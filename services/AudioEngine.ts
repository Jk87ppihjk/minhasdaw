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
  decodeAudioData = (buffer: ArrayBuffer) => this.ctxManager.decodeAudioData(buffer);
  
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
    if (!clip.buffer) return;
    this.stopClip(clip.id);
    const chain = this.effectsManager.getOrCreateTrackChain(track);
    const source = this.context.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(chain.input);
    
    const startTime = Math.max(this.context.currentTime, when);
    if (!Number.isFinite(startTime) || !Number.isFinite(offset)) return;

    const bufferOffset = (clip.audioOffset || 0) + offset;
    const duration = clip.duration - offset;
    
    this.sources.set(clip.id, source);
    if (duration > 0 && bufferOffset >= 0 && bufferOffset < clip.buffer.duration) {
        source.start(startTime, bufferOffset, duration);
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

  // --- Recording Logic ---

  /**
   * Inicia a gravação.
   * @param enableMonitoring Se true, o áudio do microfone será reproduzido nas caixas de som/fone (cuidado com feedback).
   */
  startRecording = async (enableMonitoring: boolean = true) => {
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
        
        // --- Setup Graph ---
        this._recSource = this.context.createMediaStreamSource(this.mediaStream);
        this._recDest = this.context.createMediaStreamDestination();
        this._recGain = this.context.createGain();
        this._recGain.gain.value = 1.0;

        // Conexão: Source -> Gain
        this._recSource.connect(this._recGain);
        
        // Conexão: Gain -> Destination (para o MediaRecorder gravar)
        this._recGain.connect(this._recDest);

        // --- CORREÇÃO: Monitoramento (Ouvir enquanto grava) ---
        // Conecta o ganho também ao masterGain para sair nas caixas de som
        if (enableMonitoring) {
            this._recGain.connect(this.ctxManager.masterGain);
        }

        // --- Visuals ---
        this.recordingAnalyser = this.context.createAnalyser();
        this.recordingAnalyser.fftSize = 256; 
        this.recordingDataArray = new Uint8Array(this.recordingAnalyser.frequencyBinCount);
        this._recGain.connect(this.recordingAnalyser);

        // --- Codec Selection ---
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
        // Importante: Gravar o stream do destino (Web Audio), não o stream bruto
        this.mediaRecorder = new MediaRecorder(this._recDest.stream, options);
        this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
        this.mediaRecorder.start();
    } catch (err) {
        console.error('Error starting recording:', err);
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
          // Cleanup Nodes
          if (this.recordingAnalyser) { 
              this.recordingAnalyser.disconnect(); 
              this.recordingAnalyser = null; 
          }
          
          if (this._recSource) { 
              this._recSource.disconnect(); 
              this._recSource = null; 
          }
          
          if (this._recGain) { 
              // Ao desconectar sem argumentos, ele desconecta do Destino E do MasterGain (parando o monitoramento)
              this._recGain.disconnect(); 
              this._recGain = null; 
          }
          
          if (this._recDest) { 
              this._recDest = null; 
          }

          if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
              resolve(new Blob([], { type: this.recordingMimeType || 'audio/webm' }));
              return;
          }
          
          this.mediaRecorder.onstop = () => {
              const blob = new Blob(this.audioChunks, { type: this.recordingMimeType || 'audio/webm' });
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
}

export const audioEngine = new AudioEngineService(); 