
import { Track } from '../../types';
import { EffectRegistry } from '../EffectRegistry';
import { AudioContextManager } from './AudioContextManager';

// --- Types for Effects ---
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
  effectNodes: Record<string, AudioNode>;
  parametricEQNodes: BiquadFilterNode[];
  lastReverbParams?: { time: number; size: number };
  tunerProcessor?: ScriptProcessorNode;
  tunerState?: TunerState;
}

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

export class EffectsChainManager {
  private ctxManager: AudioContextManager;
  private trackChains: Map<string, TrackChain> = new Map();

  constructor(ctxManager: AudioContextManager) {
    this.ctxManager = ctxManager;
  }

  public getOrCreateTrackChain(track: Track): TrackChain {
    if (this.trackChains.has(track.id)) {
      return this.trackChains.get(track.id)!;
    }
    const context = this.ctxManager.context;

    const input = context.createGain(); 
    const effectsInput = context.createGain(); 
    const analyser = context.createAnalyser(); 
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    
    const panner = context.createStereoPanner();
    const gain = context.createGain();

    gain.gain.value = track.volume; 
    panner.pan.value = track.pan;

    input.connect(effectsInput);
    effectsInput.connect(analyser);
    analyser.connect(panner);
    panner.connect(gain);
    gain.connect(this.ctxManager.masterGain);

    const chain: TrackChain = {
      input, effectsInput, analyser, panner, gain,
      effectNodes: {}, parametricEQNodes: [],
      tunerState: { currentPitch: 0, targetPitch: 0, noteName: '-', targetNoteName: '-', isSilence: true }
    };

    this.trackChains.set(track.id, chain);
    this.rebuildTrackEffects(track);
    return chain;
  }

  public getTrackChain(trackId: string): TrackChain | undefined {
      return this.trackChains.get(trackId);
  }

  public getTrackAnalyser(trackId: string): AnalyserNode | null {
      return this.trackChains.get(trackId)?.analyser || null;
  }

  public setTrackVolume(trackId: string, volume: number) {
      const chain = this.trackChains.get(trackId);
      if (chain) chain.gain.gain.setTargetAtTime(volume, this.ctxManager.currentTime, 0.02);
  }

  public getCompressorReduction(trackId: string): number {
      const chain = this.trackChains.get(trackId);
      if (!chain) return 0;
      for (const key in chain.effectNodes) {
          if (key.includes('_comp')) {
              return (chain.effectNodes[key] as DynamicsCompressorNode).reduction;
          }
      }
      return 0;
  }

  public getTunerState(trackId: string): TunerState | null {
      return this.trackChains.get(trackId)?.tunerState || null;
  }

  // --- EFFECT BUILDING & UPDATING ---

  public rebuildTrackEffects(track: Track) {
    const chain = this.trackChains.get(track.id);
    if (!chain) return;

    const context = this.ctxManager.context;
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

    // Static EQs
    if (track.effects.eqLow.active) {
        const n = context.createBiquadFilter(); n.type = 'lowshelf'; n.frequency.value = 100; n.gain.value = track.effects.eqLow.gain; chainNode(n, 'eqLow');
    }
    if (track.effects.eqMid.active) {
        const n = context.createBiquadFilter(); n.type = 'peaking'; n.frequency.value = 1000; n.gain.value = track.effects.eqMid.gain; chainNode(n, 'eqMid');
    }
    if (track.effects.eqHigh.active) {
        const n = context.createBiquadFilter(); n.type = 'highshelf'; n.frequency.value = 5000; n.gain.value = track.effects.eqHigh.gain; chainNode(n, 'eqHigh');
    }

    // Dynamic Effects Processing
    track.activeEffects.forEach((effectId, index) => {
        const uniqueId = `${effectId}_${index}`; 
        const plugin = EffectRegistry.get(effectId);

        if (plugin) {
            const settings = track.effects[effectId] || plugin.defaultSettings;
            const node = plugin.initialize(context, settings);
            chainNode(node, uniqueId);
            return; 
        }

        // Legacy Hardcoded Effects
        if (effectId === 'autoPitch' && track.effects.autoPitch.active) {
            this.setupAutoPitch(chain, track, uniqueId, chainNode);
        }
        else if (effectId === 'parametricEQ') {
            const auditionIdx = track.effects.parametricEQ.auditionBandIndex;
            const bands = track.effects.parametricEQ.bands;
            if (typeof auditionIdx === 'number' && auditionIdx !== -1 && bands[auditionIdx]) {
                const band = bands[auditionIdx];
                const n = context.createBiquadFilter();
                n.type = 'bandpass'; n.frequency.value = band.freq; n.Q.value = band.q; 
                currentInput.connect(n); currentInput = n; chain.parametricEQNodes.push(n);
            } else {
                track.effects.parametricEQ.bands.forEach((band) => {
                    const n = context.createBiquadFilter();
                    n.type = band.type; n.frequency.value = band.freq; n.gain.value = band.gain; n.Q.value = band.q;
                    currentInput.connect(n); currentInput = n; chain.parametricEQNodes.push(n);
                });
            }
        }
        else if (effectId === 'compressor' && track.effects.compressor.active) {
            const comp = context.createDynamicsCompressor();
            const s = track.effects.compressor;
            comp.threshold.value = s.threshold; comp.ratio.value = s.ratio; comp.attack.value = s.attack; comp.release.value = s.release; comp.knee.value = s.knee;
            const makeup = context.createGain(); makeup.gain.value = Math.pow(10, s.makeup / 20);
            chain.effectNodes[`${uniqueId}_comp`] = comp;
            chain.effectNodes[`${uniqueId}_makeup`] = makeup;
            currentInput.connect(comp); comp.connect(makeup); currentInput = makeup;
        }
        else if (effectId === 'reverb' && track.effects.reverb.active) {
            this.setupReverb(chain, track, uniqueId, chainNode, currentInput);
            currentInput = chain.effectNodes[`${uniqueId}_merge`];
        }
        else if (effectId === 'distortion') {
             const distNode = context.createWaveShaper();
             distNode.curve = this.makeDistortionCurve(track.effects.distortion);
             distNode.oversample = '4x';
             chainNode(distNode, uniqueId);
        }
        else if (effectId === 'delay' && track.effects.delay.active) {
             const outputNode = this.setupDelay(chain, track, uniqueId, currentInput);
             // CRITICAL FIX: The chain must continue from the output of the delay (mixed signal), not just input or wet.
             currentInput = outputNode;
        }
    });

    currentInput.connect(chain.analyser);
  }

  public updateTrackSettings(track: Track) {
      const chain = this.trackChains.get(track.id);
      if (!chain) return;
      const context = this.ctxManager.context;
      const now = context.currentTime;

      // Pan
      chain.panner.pan.setTargetAtTime(track.pan, now, 0.1);

      track.activeEffects.forEach((effectId, index) => {
          const uniqueId = `${effectId}_${index}`;
          const plugin = EffectRegistry.get(effectId);

          if (plugin) {
               const node = chain.effectNodes[uniqueId];
               if (node) plugin.update(node, track.effects[effectId] || plugin.defaultSettings, context);
          } else {
              // Legacy updates
              if (effectId === 'autoPitch') {
                  const node = chain.effectNodes[uniqueId] as ScriptProcessorNode;
                  if (node) (node as any)._settings = track.effects.autoPitch;
              }
              else if (effectId === 'compressor') {
                 const comp = chain.effectNodes[`${uniqueId}_comp`] as DynamicsCompressorNode;
                 const makeup = chain.effectNodes[`${uniqueId}_makeup`] as GainNode;
                 const s = track.effects.compressor;
                 if (comp) {
                     comp.threshold.setTargetAtTime(s.threshold, now, 0.1);
                     comp.ratio.setTargetAtTime(s.ratio, now, 0.1);
                     comp.attack.setTargetAtTime(s.attack, now, 0.1);
                     comp.release.setTargetAtTime(s.release, now, 0.1);
                     comp.knee.setTargetAtTime(s.knee, now, 0.1);
                 }
                 if (makeup) makeup.gain.setTargetAtTime(Math.pow(10, s.makeup / 20), now, 0.1);
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
                  if (pre) pre.delayTime.setTargetAtTime(r.preDelay / 1000, now, 0.1);
                  if (tone) tone.frequency.setTargetAtTime(r.tone, now, 0.1);
                  if (dry) dry.gain.setTargetAtTime(Math.cos(r.mix * 0.5 * Math.PI), now, 0.1);
                  if (wet) wet.gain.setTargetAtTime(Math.sin(r.mix * 0.5 * Math.PI), now, 0.1);
                  
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
                  
                  if (delay) delay.delayTime.setTargetAtTime(d.time, now, 0.1);
                  if (feedback) feedback.gain.setTargetAtTime(d.feedback, now, 0.1);
                  if (dry) dry.gain.setTargetAtTime(1 - d.mix, now, 0.1);
                  if (wet) wet.gain.setTargetAtTime(d.mix, now, 0.1);
              }
              else if (effectId === 'parametricEQ') {
                  const auditionIdx = track.effects.parametricEQ.auditionBandIndex;
                  const isSoloMode = typeof auditionIdx === 'number' && auditionIdx !== -1;
                  const currentNodes = chain.parametricEQNodes.length;
                  const expectedNodes = isSoloMode ? 1 : track.effects.parametricEQ.bands.length;
                  if (currentNodes !== expectedNodes) {
                      this.rebuildTrackEffects(track);
                  } else {
                      if (isSoloMode) {
                          const node = chain.parametricEQNodes[0];
                          const band = track.effects.parametricEQ.bands[auditionIdx!];
                          if (node && band) {
                             node.frequency.setTargetAtTime(band.freq, now, 0.1);
                             node.Q.setTargetAtTime(band.q, now, 0.1);
                          }
                      } else {
                          chain.parametricEQNodes.forEach((node, i) => {
                              const band = track.effects.parametricEQ.bands[i];
                              node.type = band.type;
                              node.frequency.setTargetAtTime(band.freq, now, 0.1);
                              node.Q.setTargetAtTime(band.q, now, 0.1);
                              node.gain.setTargetAtTime(band.gain, now, 0.1);
                          });
                      }
                  }
              }
          }
      });
  }

  // --- INTERNAL HELPER METHODS ---

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

  private generateReverbImpulse(duration: number, size: number): AudioBuffer {
      const rate = this.ctxManager.context.sampleRate;
      const length = Math.max(1, Math.floor(rate * (duration || 2.0)));
      const impulse = this.ctxManager.context.createBuffer(2, length, rate);
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
              L[i] *= (1 + size); R[i] *= (1 + size);
          }
      }
      return impulse;
  }

  private setupAutoPitch(chain: TrackChain, track: Track, uniqueId: string, chainNode: (n: AudioNode, id: string) => void) {
      const context = this.ctxManager.context;
      const bufferSize = 2048; 
      const processor = context.createScriptProcessor(bufferSize, 1, 1);
      const delayBuffer = new Float32Array(bufferSize * 2);
      let writePos = 0;
      let phaseMain = 0;
      let currentPitchFactor = 1.0;
      let targetPitchFactor = 1.0;
      
      (processor as any)._settings = track.effects.autoPitch;

      processor.onaudioprocess = (e) => {
          const currentSettings = (processor as any)._settings;
          const input = e.inputBuffer.getChannelData(0);
          const output = e.outputBuffer.getChannelData(0);
          
          const pitch = this.autoCorrelate(input, context.sampleRate);
          
          if (pitch !== -1) {
              const midiNote = 12 * (Math.log(pitch / 440) / Math.log(2)) + 69;
              const rawNoteName = NOTE_STRINGS[Math.round(midiNote) % 12];
              const correctedMidi = this.getScaleNote(Math.round(midiNote), currentSettings.scale);
              const targetFreq = 440 * Math.pow(2, (correctedMidi - 69) / 12);
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

  private setupReverb(chain: TrackChain, track: Track, uniqueId: string, chainNode: any, currentInput: AudioNode) {
      const context = this.ctxManager.context;
      const r = track.effects.reverb;
      const inputSplit = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      const pre = context.createDelay();
      const tone = context.createBiquadFilter();
      const conv = context.createConvolver();
      const merge = context.createGain();

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

      chain.effectNodes[`${uniqueId}_input`] = inputSplit;
      chain.effectNodes[`${uniqueId}_dry`] = dry;
      chain.effectNodes[`${uniqueId}_wet`] = wet;
      chain.effectNodes[`${uniqueId}_pre`] = pre;
      chain.effectNodes[`${uniqueId}_tone`] = tone;
      chain.effectNodes[`${uniqueId}_conv`] = conv;
      chain.effectNodes[`${uniqueId}_merge`] = merge;

      currentInput.connect(inputSplit);
      inputSplit.connect(dry); dry.connect(merge);
      inputSplit.connect(pre); pre.connect(tone); tone.connect(conv); conv.connect(wet); wet.connect(merge);
  }

  private setupDelay(chain: TrackChain, track: Track, uniqueId: string, currentInput: AudioNode): AudioNode {
      const context = this.ctxManager.context;
      const d = track.effects.delay;
      const delay = context.createDelay();
      delay.delayTime.value = d.time;
      const feedback = context.createGain();
      feedback.gain.value = d.feedback;
      const inputNode = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      const outputNode = context.createGain();

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
      chain.effectNodes[`${uniqueId}_merge`] = outputNode;

      return outputNode;
  }

  private autoCorrelate(buf: Float32Array, sampleRate: number): number {
      let SIZE = buf.length;
      let rms = 0; for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / SIZE); if (rms < 0.03) return -1;
      let r1 = 0, r2 = SIZE - 1, thres = 0.2;
      for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
      for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
      buf = buf.slice(r1, r2); SIZE = buf.length;
      let c = new Array(SIZE).fill(0);
      for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
      let d = 0; while (c[d] > c[d + 1]) d++;
      let maxval = -1, maxpos = -1;
      for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
      return sampleRate / maxpos;
  }

  private getScaleNote(noteNumber: number, scaleName: string) {
      const allowed = SCALES[scaleName] || SCALES['chromatic'];
      const chroma = noteNumber % 12;
      let minDiff = 100, closest = chroma;
      for (let note of allowed) {
          let diff = Math.abs(note - chroma);
          if (diff > 6) diff = 12 - diff;
          if (diff < minDiff) { minDiff = diff; closest = note; }
      }
      let octave = Math.floor(noteNumber / 12);
      let diff = closest - chroma;
      if (diff > 6) octave--; else if (diff < -6) octave++;
      return (octave * 12) + closest;
  }
}
