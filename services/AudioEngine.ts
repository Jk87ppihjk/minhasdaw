import { Track, Clip, EffectSettings } from '../types';
import { EffectRegistry } from './EffectRegistry';

// Scale Definitions
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES: Record<string, number[]> = { "chromatic": [0,1,2,3,4,5,6,7,8,9,10,11] };

const generateScales = () => {
    const majorPattern = [0, 2, 4, 5, 7, 9, 11];
    const minorPattern = [0, 2, 3, 5, 7, 8, 10];
    NOTE_STRINGS.forEach((note, index) => {
        let majorScale = majorPattern.map(interval => (index + interval) % 12);
        SCALES[`${note} Major`] = majorScale;
        let minorScale = minorPattern.map(interval => (index + interval) % 12);
        SCALES[`${note} Minor`] = minorScale;
    });
};
generateScales();

interface TunerState {
    currentPitch: number;
    targetPitch: number;
    noteName: string;
    targetNoteName: string;
    isSilence: boolean;
}

interface TrackChain {
  input: GainNode;
  effectsInput: GainNode;
  analyser: AnalyserNode;
  panner: StereoPannerNode;
  gain: GainNode;
  effectNodes: Record<string, AudioNode>; // Armazena nós dos efeitos (Plugins e Legacy)
  parametricEQNodes: BiquadFilterNode[];
  lastReverbParams?: { time: number; size: number };
  tunerProcessor?: ScriptProcessorNode;
  tunerState?: TunerState;
}

class AudioEngineService {
  public context: AudioContext;
  private masterGain: GainNode;
  private sources: Map<string, AudioBufferSourceNode> = new Map();
  private trackChains: Map<string, TrackChain> = new Map();
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // --- Metronome State ---
  private isMetronomePlaying: boolean = false;
  private metronomeEnabled: boolean = false;
  private bpm: number = 120;
  private nextNoteTime: number = 0.0;
  private currentBeat: number = 0;
  private lookahead: number = 25.0; // ms
  private scheduleAheadTime: number = 0.1; // seconds
  private timerID: number | null = null;
  private metronomeVolume: number = 0.5;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 44100,
      latencyHint: 'interactive'
    });
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
  }

  get currentTime() { return this.context.currentTime; }

  resumeContext = async () => {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMasterVolume = (value: number) => {
    this.masterGain.gain.setTargetAtTime(value, this.context.currentTime, 0.01);
  }

  // --- Metronome Logic ---

  public setBpm(bpm: number) {
      this.bpm = bpm;
  }

  public setMetronomeStatus(enabled: boolean) {
      this.metronomeEnabled = enabled;
  }

  public startTransport(startTime: number = 0) {
      if (this.isMetronomePlaying) return;
      this.isMetronomePlaying = true;
      
      // Sync metronome start to the exact audio time we want playback to appear to start
      // Se startTime for 0, o próximo beat é AGORA. Se for no meio, calculamos.
      this.currentBeat = 0;
      this.nextNoteTime = this.context.currentTime + 0.05; // Pequeno delay para garantir estabilidade

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
      if (this.currentBeat === 4) {
          this.currentBeat = 0;
      }
  }

  private scheduleNote(beatNumber: number, time: number) {
      if (!this.metronomeEnabled) return;

      const osc = this.context.createOscillator();
      const envelope = this.context.createGain();

      // High pitch for beat 1 (downbeat), low pitch for others
      osc.frequency.value = (beatNumber % 4 === 0) ? 1000 : 600;

      envelope.gain.value = this.metronomeVolume;
      envelope.gain.exponentialRampToValueAtTime(this.metronomeVolume, time + 0.001);
      envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

      osc.connect(envelope);
      envelope.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.05);
  }

  private scheduler = () => {
      // While there are notes that will need to play before the next interval, 
      // schedule them and advance the pointer.
      while (this.nextNoteTime < this.context.currentTime + this.scheduleAheadTime) {
          this.scheduleNote(this.currentBeat, this.nextNoteTime);
          this.nextNote();
      }
      
      if (this.isMetronomePlaying) {
          this.timerID = window.setTimeout(this.scheduler, this.lookahead);
      }
  }

  // --- Tuner Logic Helpers (LEGACY) ---
  private autoCorrelate(buf: Float32Array, sampleRate: number): number {
      let SIZE = buf.length;
      let rms = 0;
      for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / SIZE);
      if (rms < 0.03) return -1; // Noise gate

      let r1 = 0, r2 = SIZE - 1, thres = 0.2;
      for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
      for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
      buf = buf.slice(r1, r2);
      SIZE = buf.length;
      
      let c = new Array(SIZE).fill(0);
      for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
      
      let d = 0; while (c[d] > c[d + 1]) d++;
      let maxval = -1, maxpos = -1;
      for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
      
      let T0 = maxpos;
      return sampleRate / T0;
  }

  private noteFromPitch(frequency: number) {
      const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
      return Math.round(noteNum) + 69;
  }

  private frequencyFromNoteNumber(note: number) {
      return 440 * Math.pow(2, (note - 69) / 12);
  }

  private getScaleNote(noteNumber: number, scaleName: string) {
      const allowedNotes = SCALES[scaleName] || SCALES['chromatic'];
      const chroma = noteNumber % 12;
      let minDiff = 100;
      let closestChroma = chroma;

      for (let note of allowedNotes) {
          let diff = Math.abs(note - chroma);
          if (diff > 6) diff = 12 - diff;
          if (diff < minDiff) { minDiff = diff; closestChroma = note; }
      }

      let octave = Math.floor(noteNumber / 12);
      let diff = closestChroma - chroma;
      if (diff > 6) octave--;
      else if (diff < -6) octave++;

      return (octave * 12) + closestChroma;
  }

  public getTunerState(trackId: string): TunerState | null {
      const chain = this.trackChains.get(trackId);
      return chain?.tunerState || null;
  }

  // --- PROCESSING UTILS ---
  
  /**
   * Applies a simple Noise Gate to the AudioBuffer destructively.
   * Scans audio, if level is below threshold (-40dB approx), it silences it with a smooth fade.
   */
  public applyNoiseReduction(buffer: AudioBuffer): AudioBuffer {
      const channels = buffer.numberOfChannels;
      const rate = buffer.sampleRate;
      const length = buffer.length;
      
      // Create a new buffer to avoid modifying the original reference unexpectedly if used elsewhere
      const newBuffer = this.context.createBuffer(channels, length, rate);
      
      // Threshold: 0.005 is roughly -46dB. 
      // 0.01 is -40dB. Let's use a conservative -40dB for "Room Noise".
      const threshold = 0.008; 
      
      // Smoothing (Attack/Release envelope simulation)
      const attack = 0.002; // samples smoothing factor
      const release = 0.0005;

      for (let c = 0; c < channels; c++) {
          const inputData = buffer.getChannelData(c);
          const outputData = newBuffer.getChannelData(c);
          
          let envelope = 0;

          for (let i = 0; i < length; i++) {
              const inputSample = inputData[i];
              const inputAbs = Math.abs(inputSample);

              // Envelope Follower
              if (inputAbs > envelope) {
                  envelope += (inputAbs - envelope) * attack;
              } else {
                  envelope += (inputAbs - envelope) * release;
              }

              // Gate Logic
              // If envelope is below threshold, gain drops to 0. Otherwise 1.
              // Use a soft knee for better sound.
              let gain = 1.0;
              if (envelope < threshold) {
                  // Fade out quickly based on how far below threshold
                  gain = Math.max(0, envelope / threshold);
                  // Apply a square to make the dropoff sharper but smooth
                  gain = gain * gain * gain;
              }

              outputData[i] = inputSample * gain;
          }
      }
      
      return newBuffer;
  }

  // --- Track Chain Management ---

  private getOrCreateTrackChain(track: Track): TrackChain {
    if (this.trackChains.has(track.id)) {
      return this.trackChains.get(track.id)!;
    }

    const input = this.context.createGain(); 
    const effectsInput = this.context.createGain(); 
    const analyser = this.context.createAnalyser(); 
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    
    const panner = this.context.createStereoPanner();
    const gain = this.context.createGain();

    gain.gain.value = track.volume; 
    panner.pan.value = track.pan;

    input.connect(effectsInput);
    effectsInput.connect(analyser);
    analyser.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain);

    const chain: TrackChain = {
      input, effectsInput, analyser, panner, gain,
      effectNodes: {}, parametricEQNodes: [],
      tunerState: { currentPitch: 0, targetPitch: 0, noteName: '-', targetNoteName: '-', isSilence: true }
    };

    this.trackChains.set(track.id, chain);
    this.rebuildTrackEffects(track);
    return chain;
  }

  public rebuildTrackEffects(track: Track) {
    const chain = this.trackChains.get(track.id);
    if (!chain) return;

    chain.effectsInput.disconnect();
    chain.effectNodes = {};
    chain.parametricEQNodes = [];
    chain.tunerProcessor = undefined;

    let currentInput: AudioNode = chain.effectsInput;

    const chainNode = (node: AudioNode, id: string) => {
        currentInput.connect(node);
        currentInput = node;
        chain.effectNodes[id] = node;
    };

    // Static EQs (Legacy)
    if (track.effects.eqLow.active) {
        const n = this.context.createBiquadFilter(); n.type = 'lowshelf'; n.frequency.value = 100; n.gain.value = track.effects.eqLow.gain; chainNode(n, 'eqLow');
    }
    if (track.effects.eqMid.active) {
        const n = this.context.createBiquadFilter(); n.type = 'peaking'; n.frequency.value = 1000; n.gain.value = track.effects.eqMid.gain; chainNode(n, 'eqMid');
    }
    if (track.effects.eqHigh.active) {
        const n = this.context.createBiquadFilter(); n.type = 'highshelf'; n.frequency.value = 5000; n.gain.value = track.effects.eqHigh.gain; chainNode(n, 'eqHigh');
    }

    // Dynamic Effects Processing
    track.activeEffects.forEach((effectId, index) => {
        const uniqueId = `${effectId}_${index}`; 

        // 1. CHECK FOR NEW PLUGIN SYSTEM FIRST
        const plugin = EffectRegistry.get(effectId);
        if (plugin) {
            const settings = track.effects[effectId] || plugin.defaultSettings;
            const node = plugin.initialize(this.context, settings);
            chainNode(node, uniqueId);
            return; // Continue to next effect
        }

        // 2. FALLBACK TO LEGACY HARDCODED EFFECTS
        if (effectId === 'autoPitch' && track.effects.autoPitch.active) {
            // Tuner Desert Implementation (Simplified Logic)
            const bufferSize = 4096;
            const processor = this.context.createScriptProcessor(bufferSize, 1, 1);
            const delayBuffer = new Float32Array(bufferSize * 2);
            let writePos = 0;
            let phaseMain = 0;
            let currentPitchFactor = 1.0;
            let targetPitchFactor = 1.0;
            const settings = track.effects.autoPitch;
            
            // Attach settings to node for updates
            (processor as any)._settings = settings;

            processor.onaudioprocess = (e) => {
                const currentSettings = (processor as any)._settings || settings;
                const input = e.inputBuffer.getChannelData(0);
                const output = e.outputBuffer.getChannelData(0);
                const pitch = this.autoCorrelate(input, this.context.sampleRate);
                
                if (pitch !== -1) {
                    const midiNote = this.noteFromPitch(pitch);
                    const rawNoteName = NOTE_STRINGS[midiNote % 12];
                    const correctedMidi = this.getScaleNote(midiNote, currentSettings.scale);
                    const targetFreq = this.frequencyFromNoteNumber(correctedMidi);
                    const correctedNoteName = NOTE_STRINGS[correctedMidi % 12];
                    
                    let ratio = targetFreq / pitch;
                    if (ratio > 2.0) ratio = 2.0; if (ratio < 0.5) ratio = 0.5;
                    if (Math.abs(1.0 - ratio) > 0.02) targetPitchFactor = ratio; else targetPitchFactor = 1.0;

                    if (chain.tunerState) {
                        chain.tunerState.currentPitch = pitch;
                        chain.tunerState.targetPitch = targetFreq;
                        chain.tunerState.noteName = rawNoteName;
                        chain.tunerState.targetNoteName = correctedNoteName;
                        chain.tunerState.isSilence = false;
                    }
                } else {
                    targetPitchFactor = 1.0;
                    if (chain.tunerState) chain.tunerState.isSilence = true;
                }

                const smoothing = Math.max(0.0001, currentSettings.speed * 0.1); 
                const grainLen = 1024;

                for (let i = 0; i < input.length; i++) {
                    delayBuffer[writePos] = input[i];
                    currentPitchFactor += (targetPitchFactor - currentPitchFactor) * smoothing;
                    
                    let phA = phaseMain % grainLen; if (phA < 0) phA += grainLen;
                    let phB = (phaseMain + grainLen/2) % grainLen; if (phB < 0) phB += grainLen;
                    let readPosA = writePos - phA; while (readPosA < 0) readPosA += delayBuffer.length;
                    let readPosB = writePos - phB; while (readPosB < 0) readPosB += delayBuffer.length;
                    
                    let valA = delayBuffer[Math.floor(readPosA) % delayBuffer.length];
                    let valB = delayBuffer[Math.floor(readPosB) % delayBuffer.length];
                    
                    let gainA = 1.0 - Math.abs((phA - grainLen/2) / (grainLen/2));
                    let gainB = 1.0 - Math.abs((phB - grainLen/2) / (grainLen/2));
                    
                    output[i] = (valA * gainA) + (valB * gainB);
                    phaseMain += (1.0 - currentPitchFactor);
                    writePos++; if (writePos >= delayBuffer.length) writePos = 0;
                }
            };
            chainNode(processor, uniqueId);
            chain.tunerProcessor = processor;
        }
        else if (effectId === 'parametricEQ') {
            track.effects.parametricEQ.bands.forEach((band, bIndex) => {
                const n = this.context.createBiquadFilter();
                n.type = band.type;
                n.frequency.value = band.freq;
                n.gain.value = band.gain;
                n.Q.value = band.q;
                currentInput.connect(n);
                currentInput = n;
                chain.parametricEQNodes.push(n);
            });
        }
        else if (effectId === 'compressor' && track.effects.compressor.active) {
            const comp = this.context.createDynamicsCompressor();
            comp.threshold.value = track.effects.compressor.threshold;
            comp.ratio.value = track.effects.compressor.ratio;
            comp.attack.value = track.effects.compressor.attack;
            comp.release.value = track.effects.compressor.release;
            comp.knee.value = track.effects.compressor.knee;
            const makeup = this.context.createGain();
            makeup.gain.value = Math.pow(10, track.effects.compressor.makeup / 20);
            chain.effectNodes[`${uniqueId}_comp`] = comp;
            chain.effectNodes[`${uniqueId}_makeup`] = makeup;
            currentInput.connect(comp);
            comp.connect(makeup);
            currentInput = makeup;
        }
        else if (effectId === 'reverb' && track.effects.reverb.active) {
            const r = track.effects.reverb;
            // Create Nodes
            const inputSplit = this.context.createGain();
            const dry = this.context.createGain();
            const wet = this.context.createGain();
            const pre = this.context.createDelay();
            const tone = this.context.createBiquadFilter();
            const conv = this.context.createConvolver();
            const merge = this.context.createGain();

            // Config
            dry.gain.value = Math.cos(r.mix * 0.5 * Math.PI);
            wet.gain.value = Math.sin(r.mix * 0.5 * Math.PI);
            pre.delayTime.value = r.preDelay / 1000;
            tone.type = 'lowpass';
            tone.frequency.value = r.tone;
            
            try {
                const impulse = this.generateReverbImpulse(r.time, r.size);
                conv.buffer = impulse;
                chain.lastReverbParams = { time: r.time, size: r.size };
            } catch(e) {}

            // Store
            chain.effectNodes[`${uniqueId}_input`] = inputSplit;
            chain.effectNodes[`${uniqueId}_dry`] = dry;
            chain.effectNodes[`${uniqueId}_wet`] = wet;
            chain.effectNodes[`${uniqueId}_pre`] = pre;
            chain.effectNodes[`${uniqueId}_tone`] = tone;
            chain.effectNodes[`${uniqueId}_conv`] = conv;
            chain.effectNodes[`${uniqueId}_merge`] = merge;

            // Connect
            currentInput.connect(inputSplit);
            inputSplit.connect(dry); dry.connect(merge);
            inputSplit.connect(pre); pre.connect(tone); tone.connect(conv); conv.connect(wet); wet.connect(merge);
            currentInput = merge;
        }
        else if (effectId === 'distortion') {
             const distNode = this.context.createWaveShaper();
             distNode.curve = this.makeDistortionCurve(track.effects.distortion);
             distNode.oversample = '4x';
             chain.effectNodes[uniqueId] = distNode;
             currentInput.connect(distNode);
             currentInput = distNode;
        }
        else if (effectId === 'delay' && track.effects.delay.active) {
             const d = track.effects.delay;
             const delay = this.context.createDelay();
             delay.delayTime.value = d.time;
             const feedback = this.context.createGain();
             feedback.gain.value = d.feedback;
             
             const inputNode = this.context.createGain();
             const dry = this.context.createGain();
             const wet = this.context.createGain();
             const outputNode = this.context.createGain();

             dry.gain.value = 1 - d.mix;
             wet.gain.value = d.mix;

             currentInput.connect(inputNode);
             inputNode.connect(dry); dry.connect(outputNode);
             
             inputNode.connect(delay);
             delay.connect(feedback); feedback.connect(delay);
             delay.connect(wet); wet.connect(outputNode);
             
             chain.effectNodes[`${uniqueId}_delay`] = delay;
             chain.effectNodes[`${uniqueId}_feedback`] = feedback;
             chain.effectNodes[`${uniqueId}_dry`] = dry;
             chain.effectNodes[`${uniqueId}_wet`] = wet;
             
             currentInput = outputNode;
        }
    });

    if (chain.effectNodes['eqLow']) (chain.effectNodes['eqLow'] as BiquadFilterNode).gain.setTargetAtTime(track.effects.eqLow.gain, this.context.currentTime, 0.1);
    if (chain.effectNodes['eqMid']) (chain.effectNodes['eqMid'] as BiquadFilterNode).gain.setTargetAtTime(track.effects.eqMid.gain, this.context.currentTime, 0.1);
    if (chain.effectNodes['eqHigh']) (chain.effectNodes['eqHigh'] as BiquadFilterNode).gain.setTargetAtTime(track.effects.eqHigh.gain, this.context.currentTime, 0.1);
  }

  public updateTrackSettings(track: Track) {
      const chain = this.trackChains.get(track.id);
      if (!chain) return;

      // Pan
      chain.panner.pan.setTargetAtTime(track.pan, this.context.currentTime, 0.1);

      // Iterate active effects to update params
      track.activeEffects.forEach((effectId, index) => {
          const uniqueId = `${effectId}_${index}`;
          const plugin = EffectRegistry.get(effectId);

          if (plugin) {
               const node = chain.effectNodes[uniqueId];
               if (node) plugin.update(node, track.effects[effectId] || plugin.defaultSettings, this.context);
          } else {
              if (effectId === 'autoPitch') {
                  const node = chain.effectNodes[uniqueId] as ScriptProcessorNode;
                  if (node) (node as any)._settings = track.effects.autoPitch;
              }
              else if (effectId === 'compressor') {
                 const comp = chain.effectNodes[`${uniqueId}_comp`] as DynamicsCompressorNode;
                 const makeup = chain.effectNodes[`${uniqueId}_makeup`] as GainNode;
                 const s = track.effects.compressor;
                 if (comp) {
                     comp.threshold.setTargetAtTime(s.threshold, this.context.currentTime, 0.1);
                     comp.ratio.setTargetAtTime(s.ratio, this.context.currentTime, 0.1);
                     comp.attack.setTargetAtTime(s.attack, this.context.currentTime, 0.1);
                     comp.release.setTargetAtTime(s.release, this.context.currentTime, 0.1);
                     comp.knee.setTargetAtTime(s.knee, this.context.currentTime, 0.1);
                 }
                 if (makeup) makeup.gain.setTargetAtTime(Math.pow(10, s.makeup / 20), this.context.currentTime, 0.1);
              }
              else if (effectId === 'distortion') {
                  const node = chain.effectNodes[uniqueId] as WaveShaperNode;
                  if (node) node.curve = this.makeDistortionCurve(track.effects.distortion);
              }
              else if (effectId === 'reverb') {
                  const r = track.effects.reverb;
                  const pre = chain.effectNodes[`${uniqueId}_pre`] as DelayNode;
                  const tone = chain.effectNodes[`${uniqueId}_tone`] as BiquadFilterNode;
                  const dry = chain.effectNodes[`${uniqueId}_dry`] as GainNode;
                  const wet = chain.effectNodes[`${uniqueId}_wet`] as GainNode;
                  const conv = chain.effectNodes[`${uniqueId}_conv`] as ConvolverNode;
                  
                  if (pre) pre.delayTime.setTargetAtTime(r.preDelay / 1000, this.context.currentTime, 0.1);
                  if (tone) tone.frequency.setTargetAtTime(r.tone, this.context.currentTime, 0.1);
                  if (dry) dry.gain.setTargetAtTime(Math.cos(r.mix * 0.5 * Math.PI), this.context.currentTime, 0.1);
                  if (wet) wet.gain.setTargetAtTime(Math.sin(r.mix * 0.5 * Math.PI), this.context.currentTime, 0.1);
                  
                  if (conv && chain.lastReverbParams && (chain.lastReverbParams.time !== r.time || chain.lastReverbParams.size !== r.size)) {
                       try {
                           conv.buffer = this.generateReverbImpulse(r.time, r.size);
                           chain.lastReverbParams = { time: r.time, size: r.size };
                       } catch(e) {}
                  }
              }
              else if (effectId === 'delay') {
                  const d = track.effects.delay;
                  const delay = chain.effectNodes[`${uniqueId}_delay`] as DelayNode;
                  const feedback = chain.effectNodes[`${uniqueId}_feedback`] as GainNode;
                  const dry = chain.effectNodes[`${uniqueId}_dry`] as GainNode;
                  const wet = chain.effectNodes[`${uniqueId}_wet`] as GainNode;
                  
                  if (delay) delay.delayTime.setTargetAtTime(d.time, this.context.currentTime, 0.1);
                  if (feedback) feedback.gain.setTargetAtTime(d.feedback, this.context.currentTime, 0.1);
                  if (dry) dry.gain.setTargetAtTime(1 - d.mix, this.context.currentTime, 0.1);
                  if (wet) wet.gain.setTargetAtTime(d.mix, this.context.currentTime, 0.1);
              }
              else if (effectId === 'parametricEQ') {
                  if (chain.parametricEQNodes.length === track.effects.parametricEQ.bands.length) {
                      chain.parametricEQNodes.forEach((node, i) => {
                          const band = track.effects.parametricEQ.bands[i];
                          node.type = band.type;
                          node.frequency.setTargetAtTime(band.freq, this.context.currentTime, 0.1);
                          node.Q.setTargetAtTime(band.q, this.context.currentTime, 0.1);
                          node.gain.setTargetAtTime(band.gain, this.context.currentTime, 0.1);
                      });
                  } else {
                      this.rebuildTrackEffects(track);
                  }
              }
          }
      });
  }

  setTrackVolume = (trackId: string, volume: number) => {
    const chain = this.trackChains.get(trackId);
    if (chain) chain.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.02);
  }

  getTrackAnalyser = (trackId: string): AnalyserNode | null => {
      return this.trackChains.get(trackId)?.analyser || null;
  }
  
  getCompressorReduction = (trackId: string): number => {
      const chain = this.trackChains.get(trackId);
      if (!chain) return 0;
      for (const key in chain.effectNodes) {
          if (key.includes('_comp')) {
              return (chain.effectNodes[key] as DynamicsCompressorNode).reduction;
          }
      }
      return 0;
  }

  playClip = (clip: Clip, track: Track, when: number = 0, offset: number = 0) => {
    if (!clip.buffer) return;
    this.stopClip(clip.id);
    const chain = this.getOrCreateTrackChain(track);
    const source = this.context.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(chain.input);
    const startTime = Math.max(this.context.currentTime, when);
    const bufferOffset = (clip.audioOffset || 0) + offset;
    const duration = clip.duration - offset;
    this.sources.set(clip.id, source);
    if (duration > 0) source.start(startTime, bufferOffset, duration);
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

  decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    return await this.context.decodeAudioData(arrayBuffer);
  }

  private generateReverbImpulse(duration: number, size: number): AudioBuffer {
      const rate = this.context.sampleRate;
      // FIX: Ensure length is a positive integer to prevent createBuffer crash
      const length = Math.max(1, Math.floor(rate * (duration || 2.0)));
      const impulse = this.context.createBuffer(2, length, rate);
      const L = impulse.getChannelData(0);
      const R = impulse.getChannelData(1);
      for (let i = 0; i < length; i++) {
          const n = i / length;
          const env = Math.pow(1 - n, 4); 
          const noiseL = (Math.random() * 2 - 1);
          const noiseR = (Math.random() * 2 - 1);
          L[i] = noiseL * env;
          R[i] = noiseR * env;
          if (i < 5000 && Math.random() > 0.95) {
              L[i] *= (1 + size);
              R[i] *= (1 + size);
          }
      }
      return impulse;
  }

  private makeDistortionCurve(amount: number) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    if (amount === 0) {
        for (let i = 0; i < n_samples; ++i) curve[i] = (i * 2) / n_samples - 1;
        return curve;
    }
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  startRecording = async () => {
    this.audioChunks = [];
    try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
        this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
        this.mediaRecorder.start();
    } catch (err) {
        console.error('Error starting recording:', err);
        throw err;
    }
  }

  stopRecording = (): Promise<Blob> => {
      return new Promise((resolve) => {
          if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
              resolve(new Blob([], { type: 'audio/webm' }));
              return;
          }
          this.mediaRecorder.onstop = () => {
              const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
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
  
  // --- OFFLINE RENDER (EXPORT) WITH EFFECTS ---
  renderOffline = async (tracks: Track[], totalDuration: number): Promise<Blob> => {
      // 1. Create Offline Context
      const offlineCtx = new OfflineAudioContext(2, 44100 * totalDuration, 44100);
      
      // 2. Helper to build effect chain in offline context
      const buildChain = (input: AudioNode, track: Track): AudioNode => {
          let current = input;

          // Legacy Static EQs
          if (track.effects.eqLow.active) {
            const n = offlineCtx.createBiquadFilter(); n.type = 'lowshelf'; n.frequency.value = 100; n.gain.value = track.effects.eqLow.gain; 
            current.connect(n); current = n;
          }
          if (track.effects.eqMid.active) {
            const n = offlineCtx.createBiquadFilter(); n.type = 'peaking'; n.frequency.value = 1000; n.gain.value = track.effects.eqMid.gain;
            current.connect(n); current = n;
          }
          if (track.effects.eqHigh.active) {
            const n = offlineCtx.createBiquadFilter(); n.type = 'highshelf'; n.frequency.value = 5000; n.gain.value = track.effects.eqHigh.gain;
            current.connect(n); current = n;
          }

          // Active Effects Loop
          track.activeEffects.forEach(effectId => {
              const plugin = EffectRegistry.get(effectId);
              
              // A. Plugins (Compatible with Offline if they use standard nodes)
              if (plugin) {
                  // Initialize creates nodes bound to the passed context (offlineCtx)
                  const node = plugin.initialize(offlineCtx as any, track.effects[effectId] || plugin.defaultSettings);
                  current.connect(node);
                  current = node;
                  return;
              }

              // B. Legacy Effects
              if (effectId === 'parametricEQ' && track.effects.parametricEQ.active) {
                  track.effects.parametricEQ.bands.forEach(band => {
                      const n = offlineCtx.createBiquadFilter();
                      n.type = band.type; n.frequency.value = band.freq; n.gain.value = band.gain; n.Q.value = band.q;
                      current.connect(n); current = n;
                  });
              }
              else if (effectId === 'compressor' && track.effects.compressor.active) {
                  const s = track.effects.compressor;
                  const comp = offlineCtx.createDynamicsCompressor();
                  comp.threshold.value = s.threshold; comp.ratio.value = s.ratio; comp.attack.value = s.attack; comp.release.value = s.release; comp.knee.value = s.knee;
                  const makeup = offlineCtx.createGain(); makeup.gain.value = Math.pow(10, s.makeup / 20);
                  current.connect(comp); comp.connect(makeup); current = makeup;
              }
              else if (effectId === 'reverb' && track.effects.reverb.active) {
                   const r = track.effects.reverb;
                   const inputSplit = offlineCtx.createGain();
                   const dry = offlineCtx.createGain(); dry.gain.value = Math.cos(r.mix * 0.5 * Math.PI);
                   const wet = offlineCtx.createGain(); wet.gain.value = Math.sin(r.mix * 0.5 * Math.PI);
                   const pre = offlineCtx.createDelay(); pre.delayTime.value = r.preDelay / 1000;
                   const tone = offlineCtx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = r.tone;
                   const conv = offlineCtx.createConvolver(); 
                   // Generate impulse for offline (needs to be synchronous or reused)
                   // Since generateReverbImpulse uses the MAIN context sample rate, we should use offlineCtx sample rate logic
                   // But here we can reuse the logic adapting to offlineCtx
                   const impulse = this.generateReverbImpulse(r.time, r.size); // Helper creates buffer on main ctx, might be issue if SampleRates differ. 
                   // To be safe, let's just use the buffer. If sample rates differ, Audio API handles resampling usually, or we recreate.
                   // Ideally we create buffer on offlineCtx. Let's assume 44100 match.
                   conv.buffer = impulse; 

                   const merge = offlineCtx.createGain();
                   
                   current.connect(inputSplit);
                   inputSplit.connect(dry); dry.connect(merge);
                   inputSplit.connect(pre); pre.connect(tone); tone.connect(conv); conv.connect(wet); wet.connect(merge);
                   current = merge;
              }
              else if (effectId === 'distortion') {
                  const n = offlineCtx.createWaveShaper(); n.curve = this.makeDistortionCurve(track.effects.distortion); n.oversample = '4x';
                  current.connect(n); current = n;
              }
              else if (effectId === 'delay' && track.effects.delay.active) {
                  const d = track.effects.delay;
                  const delay = offlineCtx.createDelay(); delay.delayTime.value = d.time;
                  const fb = offlineCtx.createGain(); fb.gain.value = d.feedback;
                  delay.connect(fb); fb.connect(delay);
                  current.connect(delay); current = delay; // Simplistic mix for offline, typically needs Dry/Wet
              }
          });

          return current;
      };

      // 3. Schedule Clips
      for (const track of tracks) {
          if (track.muted) continue; 
          
          // Track Channel Strip (Source -> Effects -> Pan -> Vol -> Dest)
          const trackInput = offlineCtx.createGain(); // Input point for clips
          const processedSignal = buildChain(trackInput, track);
          
          const panner = offlineCtx.createStereoPanner();
          panner.pan.value = track.pan;
          
          const volume = offlineCtx.createGain();
          volume.gain.value = track.volume;

          processedSignal.connect(panner);
          panner.connect(volume);
          volume.connect(offlineCtx.destination);

          for (const clip of track.clips) {
              if (!clip.buffer) continue;
              const source = offlineCtx.createBufferSource();
              source.buffer = clip.buffer;
              source.connect(trackInput);
              source.start(clip.startTime, clip.audioOffset, clip.duration);
          }
      }

      // 4. Render
      const renderedBuffer = await offlineCtx.startRendering();
      return this.bufferToWave(renderedBuffer, renderedBuffer.length);
  }

  private bufferToWave(abuffer: AudioBuffer, len: number) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i; let sample; let offset = 0; let pos = 0;
    const setUint16 = (data: any) => { view.setUint16(offset, data, true); offset += 2; };
    const setUint32 = (data: any) => { view.setUint32(offset, data, true); offset += 4; };
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4); 
    for(i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
    while(pos < len) {
        for(i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][pos])); 
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; 
            view.setInt16(offset, sample, true); offset += 2;
        }
        pos++;
    }
    return new Blob([buffer], {type: "audio/wav"});
  }
}

export const audioEngine = new AudioEngineService();