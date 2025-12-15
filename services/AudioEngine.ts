import { Track, Clip, EffectSettings } from '../types';
import { AudioContextManager } from './audio/AudioContextManager';
import { AudioProcessor } from './audio/AudioProcessor';
import { EffectsChainManager } from './audio/EffectsChainManager';

class AudioEngineService {
  public ctxManager: AudioContextManager;
  public audioProcessor: AudioProcessor;
  public effectsManager: EffectsChainManager;

  // Transport State
  private sources: Map<string, AudioBufferSourceNode> = new Map();
  private isMetronomePlaying: boolean = false;
  private metronomeEnabled: boolean = false;
  private bpm: number = 120;
  private nextNoteTime: number = 0.0;
  private currentBeat: number = 0;
  private lookahead: number = 25.0; 
  private scheduleAheadTime: number = 0.1;
  private timerID: number | null = null;
  private metronomeVolume: number = 0.5;

  // Recording State
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingMimeType: string = 'audio/webm'; 
  public recordingAnalyser: AnalyserNode | null = null;
  private recordingDataArray: Uint8Array | null = null;
  
  // Recording Graph Nodes (for cleanup)
  private _recSource: MediaStreamAudioSourceNode | null = null;
  private _recGain: GainNode | null = null;
  private _recDest: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    this.ctxManager = new AudioContextManager();
    this.audioProcessor = new AudioProcessor(this.ctxManager);
    this.effectsManager = new EffectsChainManager(this.ctxManager);
  }

  // --- Proxy Accessors ---
  get context() { return this.ctxManager.context; }
  get currentTime() { return this.ctxManager.currentTime; }
  resumeContext = () => this.ctxManager.resumeContext();
  setMasterVolume = (val: number) => this.ctxManager.setMasterVolume(val);
  
  // Decodificação (Essencial para o áudio gravado tocar)
  decodeAudioData = async (buffer: ArrayBuffer) => {
      return await this.ctxManager.decodeAudioData(buffer);
  }
  
  // Processing Proxies
  applyFade = (b: AudioBuffer, t: 'in' | 'out', d: number) => this.audioProcessor.applyFade(b, t, d);
  reverseBuffer = (b: AudioBuffer) => this.audioProcessor.reverseBuffer(b);
  normalizeBuffer = (b: AudioBuffer) => this.audioProcessor.normalizeBuffer(b);
  applySilence = (b: AudioBuffer) => this.audioProcessor.applySilence(b);
  removeSilence = (b: AudioBuffer) => this.audioProcessor.removeSilence(b);
  applyNeuralEnhance = (b: AudioBuffer) => this.audioProcessor.applyNeuralEnhance(b);
  applyLoFi = (b: AudioBuffer) => this.audioProcessor.applyLoFi(b);
  applyDeEsser = (b: AudioBuffer) => this.audioProcessor.applyDeEsser(b);
  applyNoiseReduction = (b: AudioBuffer) => this.audioProcessor.applyNoiseReduction(b);
  applyInvertPhase = (b: AudioBuffer) => this.audioProcessor.applyInvertPhase(b);
  applyGain = (b: AudioBuffer, db: number) => this.audioProcessor.applyGain(b, db);
  renderOffline = (tracks: Track[], dur: number) => this.audioProcessor.renderOffline(tracks, dur);

  // Effects Proxies
  rebuildTrackEffects = (t: Track) => this.effectsManager.rebuildTrackEffects(t);
  updateTrackSettings = (t: Track) => this.effectsManager.updateTrackSettings(t);
  setTrackVolume = (id: string, vol: number) => this.effectsManager.setTrackVolume(id, vol);
  getTrackAnalyser = (id: string) => this.effectsManager.getTrackAnalyser(id);
  getCompressorReduction = (id: string) => this.effectsManager.getCompressorReduction(id);
  getTunerState = (id: string) => this.effectsManager.getTunerState(id);

  // --- Transport Logic ---

  public setBpm(bpm: number) {
      this.bpm = bpm;
  }

  public setMetronomeStatus(enabled: boolean) {
      this.metronomeEnabled = enabled;
  }

  public startTransport(startTime: number = 0) {
      if (this.isMetronomePlaying) return;
      this.isMetronomePlaying = true;
      this.currentBeat = 0;
      this.nextNoteTime = this.ctxManager.currentTime + 0.05; 
      this.scheduler();
  }

  public stopTransport() {
      this.isMetronomePlaying = false;
      if (this.timerID) {
          window.clearTimeout(this.timerID);
          this.timerID = null;
      }
  }

  private nextNote() {
      const secondsPerBeat = 60.0 / this.bpm;
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat++;
      if (this.currentBeat === 4) this.currentBeat = 0;
  }

  private scheduleNote(beatNumber: number, time: number) {
      if (!this.metronomeEnabled) return;
      const osc = this.context.createOscillator();
      const envelope = this.context.createGain();
      osc.frequency.value = (beatNumber % 4 === 0) ? 1000 : 600;
      envelope.gain.value = this.metronomeVolume;
      envelope.gain.exponentialRampToValueAtTime(this.metronomeVolume, time + 0.001);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(envelope);
      envelope.connect(this.ctxManager.masterGain);
      osc.start(time);
      osc.stop(time + 0.05);
  }

  private scheduler = () => {
      while (this.nextNoteTime < this.ctxManager.currentTime + this.scheduleAheadTime) {
          this.scheduleNote(this.currentBeat, this.nextNoteTime);
          this.nextNote();
      }
      if (this.isMetronomePlaying) {
          this.timerID = window.setTimeout(this.scheduler, this.lookahead);
      }
  }

  // --- Playback Logic ---

  playClip = (clip: Clip, track: Track, when: number = 0, offset: number = 0) => {
    // LOGGING START
    console.groupCollapsed(`[AudioEngine] playClip: ${clip.name}`);
    console.log(`Track: ${track.name} (Vol: ${track.volume}, Muted: ${track.muted})`);
    
    if (!clip.buffer) {
        console.warn('❌ Clip has no audio buffer loaded.');
        console.groupEnd();
        return;
    }
    
    console.log(`Buffer: Duration=${clip.buffer.duration.toFixed(2)}s, Channels=${clip.buffer.numberOfChannels}, Rate=${clip.buffer.sampleRate}`);

    // Garante que o contexto esteja rodando
    this.resumeContext();
    console.log(`AudioContext State: ${this.context.state}, Time: ${this.context.currentTime.toFixed(2)}`);

    this.stopClip(clip.id);
    const chain = this.effectsManager.getOrCreateTrackChain(track);
    const source = this.context.createBufferSource();
    source.buffer = clip.buffer;
    
    // Connect to effects chain
    try {
        source.connect(chain.input);
        console.log('✅ Connected to effects chain input');
    } catch(err) {
        console.error('❌ Failed connection to chain', err);
    }
    
    const startTime = Math.max(this.context.currentTime, when);
    if (!Number.isFinite(startTime) || !Number.isFinite(offset)) {
        console.error('❌ Invalid time parameters:', { startTime, offset });
        console.groupEnd();
        return;
    }

    const bufferDuration = clip.buffer.duration;
    const bufferOffset = Math.max(0, (clip.audioOffset || 0) + offset);
    
    // Clamp duration to prevent overrunning buffer bounds which can silence playback
    let playDuration = clip.duration - offset;
    if (bufferOffset + playDuration > bufferDuration) {
        console.warn(`⚠️ Clamping duration. Requested: ${playDuration.toFixed(2)}, Max Avail: ${(bufferDuration - bufferOffset).toFixed(2)}`);
        playDuration = bufferDuration - bufferOffset;
    }
    
    console.log(`Scheduling: Start=${startTime.toFixed(3)}, Offset=${bufferOffset.toFixed(3)}, Duration=${playDuration.toFixed(3)}`);

    // Avoid playing excessively short or negative durations
    if (playDuration < 0.001 || bufferOffset >= bufferDuration) {
        console.warn('❌ Skipped: Duration too short or offset out of bounds.');
        console.groupEnd();
        return;
    }

    this.sources.set(clip.id, source);
    
    try {
        source.start(startTime, bufferOffset, playDuration);
        console.log('▶️ source.start() executed successfully');
    } catch (e) {
        console.error("❌ AudioEngine: failed to start source", e);
    }
    
    source.onended = () => {
      // console.log('[AudioEngine] Source ended');
      source.disconnect();
      if (this.sources.get(clip.id) === source) this.sources.delete(clip.id);
    };
    
    console.groupEnd();
  }

  stopClip = (clipId: string) => {
      const source = this.sources.get(clipId);
      if (source) {
          try { source.stop(); source.disconnect(); } catch(e) {}
          this.sources.delete(clipId);
      }
  }

  stopAll = () => {
    this.stopTransport();
    this.sources.forEach((source) => { try { source.stop(); source.disconnect(); } catch (e) { } });
    this.sources.clear();
  }

  // --- Recording Logic ---

  startRecording = async () => {
    console.log('[AudioEngine] startRecording initialized...');
    this.audioChunks = [];
    try {
        await this.resumeContext();

        this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: false, 
                noiseSuppression: false, 
                autoGainControl: false,
                latency: 0
            } as any
        });
        
        console.log('[AudioEngine] Microphone stream acquired.');

        this._recSource = this.context.createMediaStreamSource(this.mediaStream);
        this._recDest = this.context.createMediaStreamDestination();
        this._recGain = this.context.createGain();
        this._recGain.gain.value = 1.0;

        this._recSource.connect(this._recGain);
        this._recGain.connect(this._recDest);

        // Visuals
        this.recordingAnalyser = this.context.createAnalyser();
        this.recordingAnalyser.fftSize = 256; 
        this.recordingDataArray = new Uint8Array(this.recordingAnalyser.frequencyBinCount);
        this._recGain.connect(this.recordingAnalyser);

        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            this.recordingMimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            this.recordingMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            this.recordingMimeType = 'audio/mp4'; 
        } else {
            this.recordingMimeType = ''; 
        }
        
        console.log(`[AudioEngine] Using MIME Type: ${this.recordingMimeType}`);

        const options = this.recordingMimeType ? { mimeType: this.recordingMimeType } : undefined;
        this.mediaRecorder = new MediaRecorder(this._recDest.stream, options);
        this.mediaRecorder.ondataavailable = (e) => { 
            if (e.data.size > 0) {
                this.audioChunks.push(e.data); 
                // console.log(`[AudioEngine] Data chunk received: ${e.data.size} bytes`);
            }
        };
        this.mediaRecorder.start();
        console.log('[AudioEngine] MediaRecorder started.');
    } catch (err) {
        console.error('[AudioEngine] Error starting recording:', err);
        throw err;
    }
  }

  getRecordingPeak = (): number => {
      if (!this.recordingAnalyser || !this.recordingDataArray) return 0;
      this.recordingAnalyser.getByteTimeDomainData(this.recordingDataArray);
      let max = 0;
      for (let i = 0; i < this.recordingDataArray.length; i++) {
          const val = (this.recordingDataArray[i] - 128) / 128.0;
          if (Math.abs(val) > max) max = Math.abs(val);
      }
      return max;
  }

  stopRecording = (): Promise<Blob> => {
      return new Promise((resolve) => {
          console.log('[AudioEngine] stopRecording called.');
          if (this.recordingAnalyser) { this.recordingAnalyser.disconnect(); this.recordingAnalyser = null; }
          if (this._recSource) { this._recSource.disconnect(); this._recSource = null; }
          if (this._recGain) { this._recGain.disconnect(); this._recGain = null; }
          if (this._recDest) { this._recDest = null; }

          if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
              console.warn('[AudioEngine] MediaRecorder was inactive or null.');
              resolve(new Blob([], { type: this.recordingMimeType || 'audio/webm' }));
              return;
          }
          this.mediaRecorder.onstop = () => {
              const blob = new Blob(this.audioChunks, { type: this.recordingMimeType || 'audio/webm' });
              console.log(`[AudioEngine] Recording final blob created. Size: ${blob.size}, Type: ${blob.type}`);
              this.audioChunks = [];
              if (this.mediaStream) {
                  this.mediaStream.getTracks().forEach(track => track.stop());
                  this.mediaStream = null;
              }
              this.mediaRecorder = null;
              resolve(blob);
          };
          this.mediaRecorder.stop();
      });
  }

  // --- [NOVO MÉTODO ADICIONADO] ---
  // Transforma o Blob (arquivo) em AudioBuffer (memória tocável)
  public async processRecordedBlob(blob: Blob): Promise<AudioBuffer> {
    console.log(`[AudioEngine] processRecordedBlob: Processing blob of size ${blob.size}`);
    
    if (blob.size === 0) {
        console.error('[AudioEngine] Recorded blob is empty. No audio captured.');
        throw new Error("Empty recording blob");
    }

    // 1. Converte Blob -> ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();
    console.log(`[AudioEngine] Converted to ArrayBuffer. Length: ${arrayBuffer.byteLength}`);
    
    // 2. Decodifica ArrayBuffer -> AudioBuffer
    // Usa o método decodeAudioData que você já tinha na classe
    try {
        const audioBuffer = await this.decodeAudioData(arrayBuffer);
        console.log(`[AudioEngine] Decoded AudioBuffer. Duration: ${audioBuffer.duration}s`);
        return audioBuffer;
    } catch (e) {
        console.error('[AudioEngine] Failed to decode audio data:', e);
        throw e;
    }
  }
}

export const audioEngine = new AudioEngineService();