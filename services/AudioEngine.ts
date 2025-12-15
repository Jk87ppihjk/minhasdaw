
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

  // Recording & Monitoring State
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingMimeType: string = 'audio/webm'; 
  public recordingAnalyser: AnalyserNode | null = null;
  private recordingDataArray: Uint8Array | null = null;
  
  // Audio Graph Nodes
  private _recSource: MediaStreamAudioSourceNode | null = null;
  private _recGain: GainNode | null = null;
  private _recDest: MediaStreamAudioDestinationNode | null = null;
  
  // Monitoring State
  private currentMonitorTrackId: string | null = null;

  constructor() {
    this.ctxManager = new AudioContextManager();
    this.audioProcessor = new AudioProcessor(this.ctxManager);
    this.effectsManager = new EffectsChainManager(this.ctxManager);
  }

  // --- Proxy Accessors ---
  get context() { return this.ctxManager.context; }
  get currentTime() { return this.ctxManager.currentTime; }
  resumeContext = () => this.ctxManager.resumeContext();
  
  // Initialize Master Chain on first use or update
  initializeMasterTrack(masterTrack: Track) {
      this.effectsManager.getOrCreateMasterChain(masterTrack);
  }

  setMasterVolume = (val: number) => {
      // Logic handled via Master Track updates usually, but direct access to ctxManager is ok fallback
      this.ctxManager.setMasterVolume(val);
  }
  
  // Decodificação
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
  bufferToWave = (b: AudioBuffer, len: number) => this.audioProcessor.bufferToWave(b, len);

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
    if (!clip.buffer) return;
    
    this.resumeContext();
    this.stopClip(clip.id);
    const chain = this.effectsManager.getOrCreateTrackChain(track);
    const source = this.context.createBufferSource();
    source.buffer = clip.buffer;
    
    try {
        source.connect(chain.input);
    } catch(err) {
        console.error('AudioEngine: Failed connection to chain', err);
    }
    
    const startTime = Math.max(this.context.currentTime, when);
    if (!Number.isFinite(startTime) || !Number.isFinite(offset)) return;

    const bufferDuration = clip.buffer.duration;
    const bufferOffset = Math.max(0, (clip.audioOffset || 0) + offset);
    
    let playDuration = clip.duration - offset;
    if (bufferOffset + playDuration > bufferDuration) {
        playDuration = bufferDuration - bufferOffset;
    }
    
    if (playDuration < 0.001 || bufferOffset >= bufferDuration) return;

    this.sources.set(clip.id, source);
    
    try {
        source.start(startTime, bufferOffset, playDuration);
    } catch (e) {
        console.error("AudioEngine: failed to start source", e);
    }
    
    source.onended = () => {
      source.disconnect();
      if (this.sources.get(clip.id) === source) this.sources.delete(clip.id);
    };
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

  // --- Microphone & Monitoring Logic ---

  private initMicrophone = async () => {
      if (this._recSource) return; // Já inicializado

      await this.resumeContext();
      
      try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
              audio: { 
                  echoCancellation: false, 
                  noiseSuppression: false, 
                  autoGainControl: false,
                  latency: 0
              } as any
          });

          this._recSource = this.context.createMediaStreamSource(this.mediaStream);
          this._recGain = this.context.createGain();
          this._recGain.gain.value = 1.0;
          this._recSource.connect(this._recGain);

          // Configura Analyser para visuais globais de input
          this.recordingAnalyser = this.context.createAnalyser();
          this.recordingAnalyser.fftSize = 256; 
          this.recordingDataArray = new Uint8Array(this.recordingAnalyser.frequencyBinCount);
          this._recGain.connect(this.recordingAnalyser);

      } catch (err) {
          console.error('AudioEngine: Failed to init microphone', err);
          throw err;
      }
  }

  // Liga/Desliga o monitoramento na faixa especificada
  public toggleMonitor = async (trackId: string, enable: boolean) => {
      // Se estiver mudando de faixa ou desligando, desconecta o anterior
      if (this.currentMonitorTrackId && (this.currentMonitorTrackId !== trackId || !enable)) {
          const oldChain = this.effectsManager.getTrackChain(this.currentMonitorTrackId);
          if (oldChain && this._recGain) {
              try { this._recGain.disconnect(oldChain.input); } catch(e) {}
          }
          this.currentMonitorTrackId = null;
      }

      if (enable) {
          await this.initMicrophone();
          const chain = this.effectsManager.getTrackChain(trackId);
          if (chain && this._recGain) {
              // Roteia: Microfone -> Ganho Input -> Input da Faixa (Efeitos)
              this._recGain.connect(chain.input);
              this.currentMonitorTrackId = trackId;
          }
      }
  }

  // --- Recording Logic ---

  startRecording = async () => {
    this.audioChunks = [];
    try {
        await this.initMicrophone();

        // Destino exclusivo para o MediaRecorder (não afeta o monitoramento)
        if (!this._recDest) {
            this._recDest = this.context.createMediaStreamDestination();
        }
        
        // Conecta o ganho do mic ao destino de gravação
        if (this._recGain) {
            this._recGain.connect(this._recDest);
        }

        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            this.recordingMimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            this.recordingMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            this.recordingMimeType = 'audio/mp4'; 
        } else {
            this.recordingMimeType = ''; 
        }
        
        const options = this.recordingMimeType ? { mimeType: this.recordingMimeType } : undefined;
        this.mediaRecorder = new MediaRecorder(this._recDest.stream, options);
        this.mediaRecorder.ondataavailable = (e) => { 
            if (e.data.size > 0) {
                this.audioChunks.push(e.data); 
            }
        };
        this.mediaRecorder.start();
    } catch (err) {
        console.error('AudioEngine: Error starting recording:', err);
        throw err;
    }
  }

  getRecordingPeak = (): number => {
      if (!this.recordingAnalyser || !this.recordingDataArray) return 0;
      // FIX: Cast to any to avoid Uint8Array<ArrayBufferLike> mismatch error in build
      this.recordingAnalyser.getByteTimeDomainData(this.recordingDataArray as any);
      let max = 0;
      for (let i = 0; i < this.recordingDataArray.length; i++) {
          const val = (this.recordingDataArray[i] - 128) / 128.0;
          if (Math.abs(val) > max) max = Math.abs(val);
      }
      return max;
  }

  stopRecording = (): Promise<Blob> => {
      return new Promise((resolve) => {
          // Desconecta do destino de gravação, mas mantém a fonte e o ganho vivos para monitoramento
          if (this._recGain && this._recDest) {
              try { this._recGain.disconnect(this._recDest); } catch(e) {}
          }

          if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
              resolve(new Blob([], { type: this.recordingMimeType || 'audio/webm' }));
              return;
          }
          
          this.mediaRecorder.onstop = () => {
              const blob = new Blob(this.audioChunks, { type: this.recordingMimeType || 'audio/webm' });
              this.audioChunks = [];
              this.mediaRecorder = null;
              resolve(blob);
          };
          this.mediaRecorder.stop();
      });
  }

  public async processRecordedBlob(blob: Blob): Promise<AudioBuffer> {
    if (blob.size === 0) {
        throw new Error("Empty recording blob");
    }
    const arrayBuffer = await blob.arrayBuffer();
    return await this.decodeAudioData(arrayBuffer);
  }
}

export const audioEngine = new AudioEngineService();
