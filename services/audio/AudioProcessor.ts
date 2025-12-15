
import { Track } from '../../types';
import { EffectRegistry } from '../EffectRegistry';
import { AudioContextManager } from './AudioContextManager';

export class AudioProcessor {
  private ctxManager: AudioContextManager;

  constructor(ctxManager: AudioContextManager) {
    this.ctxManager = ctxManager;
  }

  // --- BUFFER MANIPULATION UTILS ---

  public async applyFade(buffer: AudioBuffer, type: 'in' | 'out', duration: number = 0.5): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          const newBuffer = this.ctxManager.cloneBuffer(buffer);
          const length = newBuffer.length;
          const rate = newBuffer.sampleRate;
          const fadeSamples = Math.min(length, Math.floor(rate * duration));
          
          for(let c = 0; c < newBuffer.numberOfChannels; c++) {
              const data = newBuffer.getChannelData(c);
              if (type === 'in') {
                  for(let i=0; i<fadeSamples; i++) {
                      data[i] *= (i / fadeSamples);
                  }
              } else {
                  for(let i=0; i<fadeSamples; i++) {
                      data[length - 1 - i] *= (i / fadeSamples);
                  }
              }
          }
          resolve(newBuffer);
      });
  }

  public async reverseBuffer(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          const newBuffer = this.ctxManager.cloneBuffer(buffer);
          for(let c = 0; c < newBuffer.numberOfChannels; c++) {
              newBuffer.getChannelData(c).reverse();
          }
          resolve(newBuffer);
      });
  }

  public async normalizeBuffer(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          const newBuffer = this.ctxManager.cloneBuffer(buffer);
          let maxPeak = 0;
          
          for(let c = 0; c < newBuffer.numberOfChannels; c++) {
              const data = newBuffer.getChannelData(c);
              for(let i=0; i<data.length; i++) {
                  const abs = Math.abs(data[i]);
                  if (abs > maxPeak) maxPeak = abs;
              }
          }

          if (maxPeak > 0) {
              const gain = 0.98 / maxPeak; // -0.2dB ceiling
              for(let c = 0; c < newBuffer.numberOfChannels; c++) {
                  const data = newBuffer.getChannelData(c);
                  for(let i=0; i<data.length; i++) {
                      data[i] *= gain;
                  }
              }
          }
          resolve(newBuffer);
      });
  }

  public async applySilence(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          const newBuffer = this.ctxManager.cloneBuffer(buffer);
          for(let c = 0; c < newBuffer.numberOfChannels; c++) {
              const data = newBuffer.getChannelData(c);
              data.fill(0);
          }
          resolve(newBuffer);
      });
  }

  public async applyInvertPhase(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          const newBuffer = this.ctxManager.cloneBuffer(buffer);
          for(let c = 0; c < newBuffer.numberOfChannels; c++) {
              const data = newBuffer.getChannelData(c);
              for(let i=0; i<data.length; i++) {
                  data[i] = -data[i];
              }
          }
          resolve(newBuffer);
      });
  }

  public async applyGain(buffer: AudioBuffer, db: number): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          const newBuffer = this.ctxManager.cloneBuffer(buffer);
          const factor = Math.pow(10, db / 20);
          
          for(let c = 0; c < newBuffer.numberOfChannels; c++) {
              const data = newBuffer.getChannelData(c);
              for(let i=0; i<data.length; i++) {
                  data[i] *= factor;
              }
          }
          resolve(newBuffer);
      });
  }

  public async removeSilence(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const sampleRate = buffer.sampleRate;
              const channels = buffer.numberOfChannels;
              const rawData = buffer.getChannelData(0);
              
              const threshold = 0.005;
              const paddingSec = 1.0;
              const paddingLen = paddingSec * sampleRate;
              
              const regions: {start: number, end: number}[] = [];
              let isSound = false;
              let start = 0;
              const step = 100; 
              
              for (let i = 0; i < rawData.length; i+=step) {
                  const abs = Math.abs(rawData[i]);
                  if (abs > threshold) {
                      if (!isSound) {
                          start = i;
                          isSound = true;
                      }
                  } else {
                      if (isSound) {
                          let trulySilent = true;
                          for(let j=1; j<10 && (i+j*step)<rawData.length; j++) {
                              if (Math.abs(rawData[i+j*step]) > threshold) {
                                  trulySilent = false;
                                  break;
                              }
                          }
                          if (trulySilent) {
                              regions.push({ start, end: i });
                              isSound = false;
                          }
                      }
                  }
              }
              if (isSound) regions.push({ start, end: rawData.length });
              
              if (regions.length === 0) {
                  resolve(buffer);
                  return;
              }

              const mergedRegions: {start: number, end: number}[] = [];
              let currentStart = Math.max(0, regions[0].start - paddingLen);
              let currentEnd = Math.min(rawData.length, regions[0].end + paddingLen);
              
              for (let i = 1; i < regions.length; i++) {
                  const r = regions[i];
                  const rStart = Math.max(0, r.start - paddingLen);
                  const rEnd = Math.min(rawData.length, r.end + paddingLen);
                  
                  if (rStart <= currentEnd) {
                      currentEnd = Math.max(currentEnd, rEnd);
                  } else {
                      mergedRegions.push({ start: currentStart, end: currentEnd });
                      currentStart = rStart;
                      currentEnd = rEnd;
                  }
              }
              mergedRegions.push({ start: currentStart, end: currentEnd });
              
              const totalLength = mergedRegions.reduce((acc, r) => acc + (r.end - r.start), 0);
              if (totalLength === 0 || totalLength >= rawData.length) {
                  resolve(buffer); return;
              }
              
              const newBuffer = this.ctxManager.context.createBuffer(channels, totalLength, sampleRate);
              for (let c = 0; c < channels; c++) {
                  const origData = buffer.getChannelData(c);
                  const newData = newBuffer.getChannelData(c);
                  let writePtr = 0;
                  for (const r of mergedRegions) {
                      const len = r.end - r.start;
                      const chunk = origData.subarray(r.start, r.end);
                      newData.set(chunk, writePtr);
                      writePtr += len;
                  }
              }
              resolve(newBuffer);
          }, 100);
      });
  }

  public async applyNeuralEnhance(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const newBuffer = this.ctxManager.cloneBuffer(buffer);
              const channels = newBuffer.numberOfChannels;
              const drive = 0.2; 
              const limitThreshold = 0.95; 
              for(let c = 0; c < channels; c++) {
                  const data = newBuffer.getChannelData(c);
                  for(let i=0; i<data.length; i++) {
                      let sample = data[i];
                      sample = sample * (1 + drive);
                      sample = sample / (1 + Math.abs(sample) * 0.5); 
                      if (sample > limitThreshold) sample = limitThreshold;
                      if (sample < -limitThreshold) sample = -limitThreshold;
                      data[i] = sample;
                  }
              }
              // Normalization post-enhance
              let maxPeak = 0;
              for(let c=0; c<channels; c++) {
                  const data = newBuffer.getChannelData(c);
                  for(let i=0; i<data.length; i++) if(Math.abs(data[i]) > maxPeak) maxPeak = Math.abs(data[i]);
              }
              if(maxPeak > 0) {
                  const gain = 0.99 / maxPeak;
                  for(let c=0; c<channels; c++) {
                      const data = newBuffer.getChannelData(c);
                      for(let i=0; i<data.length; i++) data[i] *= gain;
                  }
              }
              resolve(newBuffer);
          }, 200); 
      });
  }

  public async applyLoFi(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const newBuffer = this.ctxManager.cloneBuffer(buffer);
              const channels = newBuffer.numberOfChannels;
              const bitDepth = 8;
              const step = 1 / Math.pow(2, bitDepth);
              
              for(let c = 0; c < channels; c++) {
                  const data = newBuffer.getChannelData(c);
                  for(let i=0; i<data.length; i++) {
                      let sample = data[i];
                      sample = Math.round(sample / step) * step;
                      if (i % 2 !== 0) sample = data[i-1]; 
                      data[i] = sample;
                  }
              }
              resolve(newBuffer);
          }, 100);
      });
  }

  public async applyDeEsser(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const newBuffer = this.ctxManager.cloneBuffer(buffer);
              const channels = newBuffer.numberOfChannels;
              const threshold = 0.15; 
              const reduction = 0.6; 
              
              for(let c = 0; c < channels; c++) {
                  const data = newBuffer.getChannelData(c);
                  for(let i=1; i<data.length; i++) {
                      const slope = Math.abs(data[i] - data[i-1]);
                      if (slope > threshold) {
                          data[i] *= reduction;
                      }
                  }
              }
              resolve(newBuffer);
          }, 150);
      });
  }

  public async applyNoiseReduction(buffer: AudioBuffer): Promise<AudioBuffer> {
      return new Promise((resolve) => {
          setTimeout(() => {
              try {
                  const channels = buffer.numberOfChannels;
                  const length = buffer.length;
                  const newBuffer = this.ctxManager.context.createBuffer(channels, length, buffer.sampleRate);
                  
                  const threshold = 0.008; 
                  const attack = 0.002;
                  const release = 0.0005;

                  for (let c = 0; c < channels; c++) {
                      const inputData = buffer.getChannelData(c);
                      const outputData = newBuffer.getChannelData(c);
                      let envelope = 0;

                      for (let i = 0; i < length; i++) {
                          const inputSample = inputData[i];
                          if (isNaN(inputSample)) { outputData[i] = 0; continue; }

                          const inputAbs = Math.abs(inputSample);
                          if (inputAbs > envelope) envelope += (inputAbs - envelope) * attack;
                          else envelope += (inputAbs - envelope) * release;

                          let gain = 1.0;
                          if (envelope < threshold) {
                              gain = Math.max(0, envelope / threshold);
                              gain = gain * gain * gain;
                          }
                          outputData[i] = inputSample * gain;
                      }
                  }
                  resolve(newBuffer);
              } catch (e) {
                  console.error("Error in Noise Reduction", e);
                  resolve(buffer); 
              }
          }, 50); 
      });
  }

  // --- OFFLINE RENDERING ---

  public renderOffline = async (tracks: Track[], totalDuration: number): Promise<Blob> => {
      const offlineCtx = new OfflineAudioContext(2, 44100 * totalDuration, 44100);
      
      const buildChain = (input: AudioNode, track: Track): AudioNode => {
          let current = input;

          // Legacy EQ Hardcoded
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

          track.activeEffects.forEach(effectId => {
              const plugin = EffectRegistry.get(effectId);
              if (plugin) {
                  // Initialize creates nodes bound to the passed context (offlineCtx)
                  const node = plugin.initialize(offlineCtx as any, track.effects[effectId] || plugin.defaultSettings);
                  current.connect(node);
                  current = node;
                  return;
              }
              // Legacy Effects Logic for Offline
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
                   try {
                       conv.buffer = this.generateReverbImpulse(offlineCtx as any, r.time, r.size); 
                   } catch(e) {}
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
                  current.connect(delay); current = delay; 
              }
          });
          return current;
      };

      for (const track of tracks) {
          if (track.muted) continue; 
          const trackInput = offlineCtx.createGain(); 
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

      const renderedBuffer = await offlineCtx.startRendering();
      return this.bufferToWave(renderedBuffer, renderedBuffer.length);
  }

  // --- PRIVATE UTILS FOR RENDERING ---

  private generateReverbImpulse(ctx: AudioContext | OfflineAudioContext, duration: number, size: number): AudioBuffer {
      const rate = ctx.sampleRate;
      const length = Math.max(1, Math.floor(rate * (duration || 2.0)));
      const impulse = ctx.createBuffer(2, length, rate);
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

  public bufferToWave(abuffer: AudioBuffer, len: number) {
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
