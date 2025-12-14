
export class AudioContextManager {
  public context: AudioContext;
  public masterGain: GainNode;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive'
    });
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
  }

  get currentTime() { return this.context.currentTime; }
  get sampleRate() { return this.context.sampleRate; }

  resumeContext = async () => {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMasterVolume = (value: number) => {
    this.masterGain.gain.setTargetAtTime(value, this.context.currentTime, 0.01);
  }

  decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    try {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error("Received empty AudioBuffer for decoding.");
        }
        // Clona o buffer para evitar problemas de detaching
        return await this.context.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
        console.error("AudioEngine: Error decoding audio data.", error);
        throw error;
    }
  }

  cloneBuffer(buffer: AudioBuffer): AudioBuffer {
      const newBuffer = this.context.createBuffer(
          buffer.numberOfChannels,
          buffer.length,
          buffer.sampleRate
      );
      for (let i = 0; i < buffer.numberOfChannels; i++) {
          newBuffer.copyToChannel(buffer.getChannelData(i), i);
      }
      return newBuffer;
  }
}
