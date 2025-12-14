import React, { useEffect, useRef } from 'react';
import { EffectPlugin } from '../types';
import { Knob } from '../components/Knob';
import { audioEngine } from '../services/AudioEngine';

// --- HELPER UI FOR MOBILE ---
const MobileContainer: React.FC<{ children: React.ReactNode, title: string }> = ({ children, title }) => (
    <div className="flex flex-col w-full h-full bg-[#050505] border border-[#222]">
        <div className="bg-[#111] border-b border-[#222] py-2 text-center">
            <span className="text-[#e6c200] font-black text-xs uppercase tracking-[0.2em]">{title}</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
            {children}
        </div>
    </div>
);

// ============================================================================
// 1. POCKET COMP (One Knob Compressor)
// ============================================================================
interface PocketCompSettings { amount: number; active: boolean; }

const initComp = (ctx: AudioContext, s: PocketCompSettings) => {
    const input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    
    input.connect(comp);
    comp.connect(makeup);
    
    // Default settings optimized for vocals
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.knee.value = 10;

    (input as any)._comp = comp;
    (input as any)._makeup = makeup;
    (input as any)._output = makeup;

    updateComp(input, s, ctx);

    // Override connect
    input.connect = (dest: any) => makeup.connect(dest);
    input.disconnect = () => makeup.disconnect();
    
    return input;
};

const updateComp = (node: AudioNode, s: PocketCompSettings, ctx: AudioContext) => {
    const comp = (node as any)._comp as DynamicsCompressorNode;
    const makeup = (node as any)._makeup as GainNode;
    const now = ctx.currentTime;

    if (!s.active) {
        comp.threshold.setTargetAtTime(0, now, 0.1);
        comp.ratio.setTargetAtTime(1, now, 0.1);
        makeup.gain.setTargetAtTime(1, now, 0.1);
        return;
    }

    // "One Knob" Logic: Increases ratio and lowers threshold simultaneously
    const t = s.amount / 100; // 0 to 1
    const thresh = -50 * t; // 0 to -50dB
    const ratio = 1 + (19 * t); // 1:1 to 20:1
    const gain = 1 + (t * 2); // Makeup gain up to 3x (approx +10dB)

    comp.threshold.setTargetAtTime(thresh, now, 0.1);
    comp.ratio.setTargetAtTime(ratio, now, 0.1);
    makeup.gain.setTargetAtTime(gain, now, 0.1);
};

const PocketCompUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET COMP">
        <div className="flex flex-col items-center gap-4">
            <div className="scale-150 transform mb-2">
                <Knob value={settings.amount} min={0} max={100} onChange={(v) => onChange({...settings, amount: v})} label="" />
            </div>
            <div className="text-center">
                <div className="text-[#e6c200] font-bold text-2xl">{Math.round(settings.amount)}%</div>
                <div className="text-[#555] text-[10px] uppercase font-bold tracking-wider mt-1">SQUASH AMOUNT</div>
            </div>
            <button onClick={() => onChange({...settings, active: !settings.active})} className={`mt-2 px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest border ${settings.active ? 'bg-[#e6c200] text-black border-[#e6c200]' : 'bg-transparent text-[#555] border-[#333]'}`}>
                {settings.active ? "ACTIVE" : "BYPASS"}
            </button>
        </div>
    </MobileContainer>
);

export const PocketCompPlugin: EffectPlugin = { id: 'pocketComp', name: 'Pocket Comp', defaultSettings: { amount: 0, active: true }, initialize: initComp, update: updateComp, component: PocketCompUI };


// ============================================================================
// 2. POCKET EQ (3-Band Fixed)
// ============================================================================
interface PocketEQSettings { low: number; mid: number; high: number; active: boolean; }

const initEQ = (ctx: AudioContext, s: PocketEQSettings) => {
    const input = ctx.createGain();
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();

    low.type = 'lowshelf'; low.frequency.value = 200;
    mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
    high.type = 'highshelf'; high.frequency.value = 4000;

    input.connect(low);
    low.connect(mid);
    mid.connect(high);

    (input as any)._nodes = [low, mid, high];
    (input as any)._output = high;

    updateEQ(input, s, ctx);

    input.connect = (dest: any) => high.connect(dest);
    input.disconnect = () => high.disconnect();
    return input;
};

const updateEQ = (node: AudioNode, s: PocketEQSettings, ctx: AudioContext) => {
    const [low, mid, high] = (node as any)._nodes as BiquadFilterNode[];
    const now = ctx.currentTime;
    
    // If active is false, flat EQ
    const lVal = s.active ? s.low : 0;
    const mVal = s.active ? s.mid : 0;
    const hVal = s.active ? s.high : 0;

    low.gain.setTargetAtTime(lVal, now, 0.1);
    mid.gain.setTargetAtTime(mVal, now, 0.1);
    high.gain.setTargetAtTime(hVal, now, 0.1);
};

const SliderV: React.FC<{ val: number, min: number, max: number, label: string, onChange: (v: number) => void }> = ({ val, min, max, label, onChange }) => (
    <div className="flex flex-col items-center h-full gap-2">
        <input 
            type="range" 
            min={min} max={max} step={0.1} value={val} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="h-32 w-12 appearance-none bg-[#222] rounded-lg outline-none slider-vertical"
            style={{ WebkitAppearance: 'slider-vertical' as any }}
        />
        <span className="text-[10px] font-bold text-[#666]">{label}</span>
        <span className="text-[9px] font-mono text-[#e6c200]">{val > 0 ? '+' : ''}{Math.round(val)}</span>
    </div>
);

const PocketEQUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET EQ">
        <div className="flex justify-between w-full max-w-[300px] h-[200px]">
            <SliderV val={settings.low} min={-12} max={12} label="LOW" onChange={(v) => onChange({...settings, low: v})} />
            <SliderV val={settings.mid} min={-12} max={12} label="MID" onChange={(v) => onChange({...settings, mid: v})} />
            <SliderV val={settings.high} min={-12} max={12} label="HIGH" onChange={(v) => onChange({...settings, high: v})} />
        </div>
    </MobileContainer>
);

export const PocketEQPlugin: EffectPlugin = { id: 'pocketEQ', name: 'Pocket EQ', defaultSettings: { low: 0, mid: 0, high: 0, active: true }, initialize: initEQ, update: updateEQ, component: PocketEQUI };


// ============================================================================
// 3. POCKET DRIVE (Simple Saturation)
// ============================================================================
interface PocketDriveSettings { drive: number; active: boolean; }

const makeDistortionCurve = (amount: number) => {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
};

const initDrive = (ctx: AudioContext, s: PocketDriveSettings) => {
    const input = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.oversample = '4x';
    const output = ctx.createGain(); // For compensation

    input.connect(shaper);
    shaper.connect(output);

    (input as any)._shaper = shaper;
    (input as any)._output = output;

    updateDrive(input, s, ctx);

    input.connect = (dest: any) => output.connect(dest);
    input.disconnect = () => output.disconnect();
    return input;
};

const updateDrive = (node: AudioNode, s: PocketDriveSettings, ctx: AudioContext) => {
    const shaper = (node as any)._shaper as WaveShaperNode;
    const output = (node as any)._output as GainNode;
    const now = ctx.currentTime;

    if (!s.active || s.drive === 0) {
        shaper.curve = null;
        output.gain.setTargetAtTime(1, now, 0.1);
    } else {
        shaper.curve = makeDistortionCurve(s.drive);
        // Auto gain compensation approximation
        const compensation = 1 / (1 + (s.drive / 100)); 
        output.gain.setTargetAtTime(compensation, now, 0.1);
    }
};

const PocketDriveUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET DRIVE">
        <div className="flex flex-col items-center gap-6">
            <div className="relative">
                <div className={`absolute inset-0 rounded-full blur-xl bg-orange-600 transition-opacity duration-300 ${settings.active && settings.drive > 0 ? 'opacity-40' : 'opacity-0'}`}></div>
                <div className="scale-150 transform relative z-10">
                    <Knob value={settings.drive} min={0} max={100} onChange={(v) => onChange({...settings, drive: v})} label="" />
                </div>
            </div>
            <div className="text-center">
                <div className="text-[#e6c200] font-bold text-2xl">{Math.round(settings.drive)}</div>
                <div className="text-[#555] text-[10px] uppercase font-bold tracking-wider mt-1">SATURATION</div>
            </div>
            <button onClick={() => onChange({...settings, active: !settings.active})} className={`mt-2 px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest border ${settings.active ? 'bg-orange-600 text-white border-orange-600' : 'bg-transparent text-[#555] border-[#333]'}`}>
                {settings.active ? "HOT" : "COLD"}
            </button>
        </div>
    </MobileContainer>
);

export const PocketDrivePlugin: EffectPlugin = { id: 'pocketDrive', name: 'Pocket Drive', defaultSettings: { drive: 0, active: true }, initialize: initDrive, update: updateDrive, component: PocketDriveUI };


// ============================================================================
// 4. POCKET SPACE (Simple Reverb)
// ============================================================================
interface PocketSpaceSettings { mix: number; active: boolean; }

const initSpace = (ctx: AudioContext, s: PocketSpaceSettings) => {
    const input = ctx.createGain();
    const convolver = ctx.createConvolver();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const output = ctx.createGain();

    // Create simple impulse
    const rate = ctx.sampleRate;
    const length = rate * 2.0; // 2 seconds fixed
    const impulse = ctx.createBuffer(2, length, rate);
    const L = impulse.getChannelData(0);
    const R = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 3);
        L[i] = (Math.random() * 2 - 1) * decay;
        R[i] = (Math.random() * 2 - 1) * decay;
    }
    convolver.buffer = impulse;

    input.connect(dry);
    input.connect(convolver);
    convolver.connect(wet);
    dry.connect(output);
    wet.connect(output);

    (input as any)._dry = dry;
    (input as any)._wet = wet;
    (input as any)._output = output;

    updateSpace(input, s, ctx);

    input.connect = (dest: any) => output.connect(dest);
    input.disconnect = () => output.disconnect();
    return input;
};

const updateSpace = (node: AudioNode, s: PocketSpaceSettings, ctx: AudioContext) => {
    const dry = (node as any)._dry as GainNode;
    const wet = (node as any)._wet as GainNode;
    const now = ctx.currentTime;

    if (!s.active) {
        dry.gain.setTargetAtTime(1, now, 0.1);
        wet.gain.setTargetAtTime(0, now, 0.1);
    } else {
        const mix = s.mix / 100;
        dry.gain.setTargetAtTime(1 - mix, now, 0.1);
        wet.gain.setTargetAtTime(mix, now, 0.1);
    }
};

const PocketSpaceUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET SPACE">
        <div className="flex flex-col items-center gap-4">
            <div className="scale-150 transform mb-2">
                <Knob value={settings.mix} min={0} max={50} onChange={(v) => onChange({...settings, mix: v})} label="" />
            </div>
            <div className="text-center">
                <div className="text-[#e6c200] font-bold text-2xl">{Math.round(settings.mix)}%</div>
                <div className="text-[#555] text-[10px] uppercase font-bold tracking-wider mt-1">AMBIENCE MIX</div>
            </div>
            <button onClick={() => onChange({...settings, active: !settings.active})} className={`mt-2 px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest border ${settings.active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-transparent text-[#555] border-[#333]'}`}>
                {settings.active ? "SPACE ON" : "DRY"}
            </button>
        </div>
    </MobileContainer>
);

export const PocketSpacePlugin: EffectPlugin = { id: 'pocketSpace', name: 'Pocket Space', defaultSettings: { mix: 0, active: true }, initialize: initSpace, update: updateSpace, component: PocketSpaceUI };


// ============================================================================
// 5. POCKET GATE (Simple Noise Gate)
// ============================================================================
interface PocketGateSettings { threshold: number; active: boolean; }

const initGate = (ctx: AudioContext, s: PocketGateSettings) => {
    const input = ctx.createGain();
    const output = ctx.createGain();
    // Simple implementation: Analyzer to check level, then automate gain
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    input.connect(analyser);
    input.connect(output);
    
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const dummyGain = ctx.createGain(); dummyGain.gain.value = 0;
    input.connect(processor); processor.connect(dummyGain); dummyGain.connect(ctx.destination);

    (processor as any)._settings = s;
    (processor as any)._output = output;
    
    processor.onaudioprocess = (e) => {
        const inp = e.inputBuffer.getChannelData(0);
        let rms = 0;
        for(let i=0; i<inp.length; i++) rms += inp[i] * inp[i];
        rms = Math.sqrt(rms / inp.length);
        const db = 20 * Math.log10(rms);
        
        const currentSettings = (processor as any)._settings;
        const outNode = (processor as any)._output as GainNode;
        
        if (currentSettings.active) {
            // Hard knee gate
            if (db < currentSettings.threshold) {
                // Close gate
                outNode.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
            } else {
                // Open gate
                outNode.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
            }
        } else {
            outNode.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
        }
    };

    (input as any)._processor = processor;
    (input as any)._output = output;

    updateGate(input, s, ctx);

    input.connect = (dest: any) => output.connect(dest);
    input.disconnect = () => output.disconnect();
    return input;
};

const updateGate = (node: AudioNode, s: PocketGateSettings, ctx: AudioContext) => {
    const processor = (node as any)._processor as ScriptProcessorNode;
    (processor as any)._settings = s;
};

const PocketGateUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET GATE">
        <div className="flex flex-col items-center gap-4">
            <div className="scale-150 transform mb-2">
                <Knob value={settings.threshold} min={-80} max={-10} onChange={(v) => onChange({...settings, threshold: v})} label="" />
            </div>
            <div className="text-center">
                <div className="text-[#e6c200] font-bold text-2xl">{Math.round(settings.threshold)} dB</div>
                <div className="text-[#555] text-[10px] uppercase font-bold tracking-wider mt-1">THRESHOLD</div>
            </div>
            <p className="text-[9px] text-[#444] w-40 text-center">Sounds below this level will be silenced.</p>
            <button onClick={() => onChange({...settings, active: !settings.active})} className={`mt-2 px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest border ${settings.active ? 'bg-green-600 text-white border-green-600' : 'bg-transparent text-[#555] border-[#333]'}`}>
                {settings.active ? "GATE ON" : "GATE OFF"}
            </button>
        </div>
    </MobileContainer>
);

export const PocketGatePlugin: EffectPlugin = { id: 'pocketGate', name: 'Pocket Gate', defaultSettings: { threshold: -40, active: true }, initialize: initGate, update: updateGate, component: PocketGateUI };
