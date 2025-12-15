
import React, { useEffect, useRef, useState } from 'react';
import { EffectPlugin } from '../types';
import { audioEngine } from '../services/AudioEngine';

// --- HELPER UI FOR MOBILE ---
const MobileContainer: React.FC<{ children: React.ReactNode, title: string }> = ({ children, title }) => (
    <div className="flex flex-col w-full h-full bg-[#050505] border border-[#222]">
        <div className="bg-[#0a0a0a] border-b border-[#222] py-2 text-center shrink-0">
            <span className="text-white font-black text-xs uppercase tracking-[0.2em]">{title}</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            {children}
        </div>
    </div>
);

// --- MOBILE FADER COMPONENT (TOUCH FRIENDLY) ---
interface MobileFaderProps {
    value: number;
    min: number;
    max: number;
    onChange: (val: number) => void;
    label: string;
    unit?: string;
    color?: string;
}

const MobileFader: React.FC<MobileFaderProps> = ({ value, min, max, onChange, label, unit = "", color = "bg-white" }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const handleInteraction = (clientY: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const height = rect.height;
        const bottom = rect.bottom;
        
        // Calculate relative Y from bottom (0 to 1)
        let delta = (bottom - clientY) / height;
        delta = Math.max(0, Math.min(1, delta));
        
        // Map to value
        const newValue = min + (delta * (max - min));
        onChange(newValue);
    };

    const onMouseDown = (e: React.MouseEvent) => {
        handleInteraction(e.clientY);
        const move = (ev: MouseEvent) => handleInteraction(ev.clientY);
        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    const onTouchStart = (e: React.TouchEvent) => {
        handleInteraction(e.touches[0].clientY);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        handleInteraction(e.touches[0].clientY);
    };

    const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

    return (
        <div className="flex flex-col items-center h-full w-full max-w-[80px] gap-2 select-none touch-none">
            {/* Value Display */}
            <div className="text-white font-mono text-xs font-bold text-center h-4">
                {Math.round(value)}{unit}
            </div>

            {/* Fader Track */}
            <div 
                ref={containerRef}
                className="relative flex-1 w-12 md:w-14 bg-[#111] rounded-lg border border-[#333] overflow-hidden cursor-ns-resize shadow-inner group"
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
            >
                {/* Background Grid */}
                <div className="absolute inset-0 opacity-20 flex flex-col justify-between py-2 pointer-events-none">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="w-full h-[1px] bg-[#444]"></div>
                    ))}
                </div>

                {/* Fill Bar */}
                <div 
                    className={`absolute bottom-0 left-0 right-0 ${color} transition-all duration-75 ease-out opacity-80 group-hover:opacity-100`}
                    style={{ height: `${percentage}%` }}
                />
                
                {/* Thumb / Handle Visual */}
                <div 
                    className="absolute left-0 right-0 h-[2px] bg-white shadow-[0_0_10px_white] pointer-events-none"
                    style={{ bottom: `${percentage}%` }}
                />
            </div>

            {/* Label */}
            <span className="text-[10px] font-bold text-[#555] uppercase tracking-wider text-center">{label}</span>
        </div>
    );
};


// ============================================================================
// 1. POCKET COMP (One Fader Compressor)
// ============================================================================
interface PocketCompSettings { amount: number; active: boolean; }

const initComp = (ctx: AudioContext, s: PocketCompSettings) => {
    const input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    
    input.connect(comp);
    comp.connect(makeup);
    
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.knee.value = 10;

    (input as any)._comp = comp;
    (input as any)._makeup = makeup;
    (input as any)._output = makeup;

    updateComp(input, s, ctx);

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

    const t = s.amount / 100; 
    const thresh = -50 * t; 
    const ratio = 1 + (19 * t); 
    const gain = 1 + (t * 2); 

    comp.threshold.setTargetAtTime(thresh, now, 0.1);
    comp.ratio.setTargetAtTime(ratio, now, 0.1);
    makeup.gain.setTargetAtTime(gain, now, 0.1);
};

const PocketCompUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET COMP">
        <div className="flex flex-row items-stretch justify-center h-full w-full gap-6">
            <div className="flex-1 max-w-[120px] h-full py-4">
                <MobileFader 
                    value={settings.amount} 
                    min={0} 
                    max={100} 
                    onChange={(v) => onChange({...settings, amount: v})} 
                    label="SQUASH"
                    unit="%"
                    color="bg-white"
                />
            </div>
            <div className="flex flex-col justify-center items-center">
                <button onClick={() => onChange({...settings, active: !settings.active})} className={`w-24 py-4 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all ${settings.active ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-[#111] text-[#555] border-[#333]'}`}>
                    {settings.active ? "ACTIVE" : "BYPASS"}
                </button>
            </div>
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
    
    const lVal = s.active ? s.low : 0;
    const mVal = s.active ? s.mid : 0;
    const hVal = s.active ? s.high : 0;

    low.gain.setTargetAtTime(lVal, now, 0.1);
    mid.gain.setTargetAtTime(mVal, now, 0.1);
    high.gain.setTargetAtTime(hVal, now, 0.1);
};

const PocketEQUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET EQ">
        <div className="flex justify-around w-full h-full py-2 gap-2">
            <MobileFader value={settings.low} min={-12} max={12} label="LOW" unit="dB" onChange={(v) => onChange({...settings, low: v})} color="bg-zinc-400" />
            <MobileFader value={settings.mid} min={-12} max={12} label="MID" unit="dB" onChange={(v) => onChange({...settings, mid: v})} color="bg-zinc-400" />
            <MobileFader value={settings.high} min={-12} max={12} label="HIGH" unit="dB" onChange={(v) => onChange({...settings, high: v})} color="bg-zinc-400" />
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
    const output = ctx.createGain(); 

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
        const compensation = 1 / (1 + (s.drive / 100)); 
        output.gain.setTargetAtTime(compensation, now, 0.1);
    }
};

const PocketDriveUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET DRIVE">
        <div className="flex flex-row items-stretch justify-center h-full w-full gap-6">
            <div className="flex-1 max-w-[120px] h-full py-4 relative">
                {/* Visual Glow */}
                <div className={`absolute inset-0 bg-white blur-2xl transition-opacity duration-300 pointer-events-none ${settings.active ? 'opacity-20' : 'opacity-0'}`}></div>
                
                <MobileFader 
                    value={settings.drive} 
                    min={0} 
                    max={100} 
                    onChange={(v) => onChange({...settings, drive: v})} 
                    label="DRIVE"
                    color="bg-white"
                />
            </div>
            <div className="flex flex-col justify-center items-center">
                <button onClick={() => onChange({...settings, active: !settings.active})} className={`w-24 py-4 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all ${settings.active ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-[#111] text-[#555] border-[#333]'}`}>
                    {settings.active ? "HOT" : "COLD"}
                </button>
            </div>
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

    const rate = ctx.sampleRate;
    const length = rate * 2.0; 
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
        <div className="flex flex-row items-stretch justify-center h-full w-full gap-6">
            <div className="flex-1 max-w-[120px] h-full py-4">
                <MobileFader 
                    value={settings.mix} 
                    min={0} 
                    max={50} 
                    onChange={(v) => onChange({...settings, mix: v})} 
                    label="AMBIENCE"
                    unit="%"
                    color="bg-zinc-300"
                />
            </div>
            <div className="flex flex-col justify-center items-center">
                <button onClick={() => onChange({...settings, active: !settings.active})} className={`w-24 py-4 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all ${settings.active ? 'bg-zinc-300 text-black border-zinc-300 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-[#111] text-[#555] border-[#333]'}`}>
                    {settings.active ? "ON" : "OFF"}
                </button>
            </div>
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
            if (db < currentSettings.threshold) {
                outNode.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
            } else {
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
        <div className="flex flex-row items-stretch justify-center h-full w-full gap-6">
            <div className="flex-1 max-w-[120px] h-full py-4">
                <MobileFader 
                    value={settings.threshold} 
                    min={-80} 
                    max={-10} 
                    onChange={(v) => onChange({...settings, threshold: v})} 
                    label="FLOOR"
                    unit="dB"
                    color="bg-zinc-500"
                />
            </div>
            <div className="flex flex-col justify-center items-center">
                <button onClick={() => onChange({...settings, active: !settings.active})} className={`w-24 py-4 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all ${settings.active ? 'bg-zinc-500 text-white border-zinc-500 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-[#111] text-[#555] border-[#333]'}`}>
                    {settings.active ? "GATE ON" : "GATE OFF"}
                </button>
            </div>
        </div>
    </MobileContainer>
);

export const PocketGatePlugin: EffectPlugin = { id: 'pocketGate', name: 'Pocket Gate', defaultSettings: { threshold: -40, active: true }, initialize: initGate, update: updateGate, component: PocketGateUI };

// ============================================================================
// 6. POCKET WIDE (Stereo Imager / Widener)
// ============================================================================
interface PocketWideSettings { width: number; active: boolean; }

const initWide = (ctx: AudioContext, s: PocketWideSettings) => {
    const input = ctx.createGain();
    const output = ctx.createGain();
    
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    
    const sumL = ctx.createGain(); 
    const sumR = ctx.createGain();
    const subL = ctx.createGain(); 
    const subR = ctx.createGain();
    
    const sideGain = ctx.createGain();
    
    input.connect(splitter);
    
    // Mid = (L + R)
    splitter.connect(sumL, 0); 
    splitter.connect(sumR, 1); 
    sumL.connect(merger, 0, 0); 
    sumR.connect(merger, 0, 1); 
    
    // Side = (L - R)
    splitter.connect(subL, 0); 
    splitter.connect(subR, 1); 
    subR.gain.value = -1; 
    
    subL.connect(sideGain);
    subR.connect(sideGain);
    
    const sideToL = ctx.createGain();
    const sideToR = ctx.createGain();
    sideToR.gain.value = -1;
    
    sideGain.connect(sideToL);
    sideGain.connect(sideToR);
    
    sideToL.connect(merger, 0, 0);
    sideToR.connect(merger, 0, 1);
    
    merger.connect(output);

    (input as any)._sideGain = sideGain;
    (input as any)._output = output;

    updateWide(input, s, ctx);

    input.connect = (dest: any) => output.connect(dest);
    input.disconnect = () => output.disconnect();
    
    return input;
};

const updateWide = (node: AudioNode, s: PocketWideSettings, ctx: AudioContext) => {
    const sideGain = (node as any)._sideGain as GainNode;
    const now = ctx.currentTime;

    if (!s.active) {
        sideGain.gain.setTargetAtTime(0, now, 0.1); 
    } else {
        const w = s.width / 100;
        sideGain.gain.setTargetAtTime(w, now, 0.1);
    }
};

const PocketWideUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="POCKET WIDE">
        <div className="flex flex-row items-stretch justify-center h-full w-full gap-6">
            <div className="flex-1 max-w-[120px] h-full py-4">
                <MobileFader 
                    value={settings.width} 
                    min={0} 
                    max={200} 
                    onChange={(v) => onChange({...settings, width: v})} 
                    label="WIDTH"
                    unit="%"
                    color="bg-zinc-200"
                />
            </div>
            <div className="flex flex-col justify-center items-center gap-2">
                <div className="text-[10px] text-[#555] font-bold uppercase tracking-wider text-center">
                    {settings.width < 50 ? "MONO" : (settings.width > 120 ? "HYPER" : "STEREO")}
                </div>
                <button onClick={() => onChange({...settings, active: !settings.active})} className={`w-24 py-4 rounded-xl font-bold text-xs uppercase tracking-widest border transition-all ${settings.active ? 'bg-zinc-200 text-black border-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-[#111] text-[#555] border-[#333]'}`}>
                    {settings.active ? "ACTIVE" : "BYPASS"}
                </button>
            </div>
        </div>
    </MobileContainer>
);

export const PocketWidePlugin: EffectPlugin = { id: 'pocketWide', name: 'Pocket Wide', defaultSettings: { width: 100, active: true }, initialize: initWide, update: updateWide, component: PocketWideUI };


// ============================================================================
// 7. POCKET TUNE (Pro Auto-Correction)
// ============================================================================
interface PocketTuneSettings { scale: string; speed: number; amount: number; active: boolean; }

const SCALES_LIST = [
  "chromatic", "C Major", "C# Major", "D Major", "D# Major", "E Major", "F Major", "F# Major", 
  "G Major", "G# Major", "A Major", "A# Major", "B Major",
  "C Minor", "C# Minor", "D Minor", "D# Minor", "E Minor", "F Minor", "F# Minor", 
  "G Minor", "G# Minor", "A Minor", "A# Minor", "B Minor"
];
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES_DATA: Record<string, number[]> = { "chromatic": [0,1,2,3,4,5,6,7,8,9,10,11] };
const generateScales = () => {
    const majorPattern = [0, 2, 4, 5, 7, 9, 11];
    const minorPattern = [0, 2, 3, 5, 7, 8, 10];
    NOTE_STRINGS.forEach((note, index) => {
        SCALES_DATA[`${note} Major`] = majorPattern.map(interval => (index + interval) % 12);
        SCALES_DATA[`${note} Minor`] = minorPattern.map(interval => (index + interval) % 12);
    });
};
generateScales();

const autoCorrelate = (buf: Float32Array, sampleRate: number): number => {
    let SIZE = buf.length;
    let rms = 0; for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.03) return -1; 
    let r1 = 0, r2 = SIZE - 1;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < 0.2) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < 0.2) { r2 = SIZE - i; break; }
    buf = buf.slice(r1, r2); SIZE = buf.length;
    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    return sampleRate / maxpos;
};

const getScaleNote = (noteNumber: number, scaleName: string) => {
    const allowed = SCALES_DATA[scaleName] || SCALES_DATA['chromatic'];
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
};

const initTune = (ctx: AudioContext, s: PocketTuneSettings) => {
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const delayBuffer = new Float32Array(4096);
    let writePos = 0;
    let phaseMain = 0;
    let currentPitchFactor = 1.0;
    let targetPitchFactor = 1.0;
    let holdFrameCount = 0;

    (processor as any)._settings = s;
    (processor as any)._state = { note: '--', hz: 0, active: false };

    processor.onaudioprocess = (e) => {
        const set = (processor as any)._settings;
        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);
        
        if (!set.active) {
            output.set(input);
            (processor as any)._state = { note: '--', hz: 0, active: false };
            return;
        }

        const pitch = autoCorrelate(input, ctx.sampleRate);
        if (pitch !== -1) {
            holdFrameCount = 0;
            const midiNote = 12 * (Math.log(pitch / 440) / Math.log(2)) + 69;
            const correctedMidi = getScaleNote(Math.round(midiNote), set.scale);
            const targetFreq = 440 * Math.pow(2, (correctedMidi - 69) / 12);
            const rawNoteName = NOTE_STRINGS[Math.round(midiNote) % 12];
            const targetNoteName = NOTE_STRINGS[correctedMidi % 12];
            
            let ratio = targetFreq / pitch;
            if (ratio > 2) ratio = 2; if (ratio < 0.5) ratio = 0.5;
            
            // Only update target if stable
            if (Math.abs(1.0 - ratio) > 0.015) {
                targetPitchFactor = ratio;
            } else {
                targetPitchFactor = 1.0;
            }
            
            const amount = set.amount / 100; 
            targetPitchFactor = 1.0 + (targetPitchFactor - 1.0) * amount;

            (processor as any)._state = { note: targetNoteName, hz: Math.round(pitch), active: true };
        } else {
            // Hold pitch briefly
            holdFrameCount++;
            if (holdFrameCount > 5) {
                targetPitchFactor = 1.0;
                (processor as any)._state = { note: '--', hz: 0, active: false };
            }
        }

        const smoothing = Math.max(0.002, set.speed * 0.08); 
        const grainLen = 1024;
        const bufLen = delayBuffer.length;

        for (let i = 0; i < input.length; i++) {
            delayBuffer[writePos] = input[i];
            currentPitchFactor += (targetPitchFactor - currentPitchFactor) * smoothing;
            
            let phA = phaseMain % grainLen; if (phA < 0) phA += grainLen;
            let phB = (phaseMain + grainLen/2) % grainLen; if (phB < 0) phB += grainLen;
            
            let readPosA = writePos - phA; while (readPosA < 0) readPosA += bufLen;
            let readPosB = writePos - phB; while (readPosB < 0) readPosB += bufLen;
            
            // Linear Interpolation
            const idxA = Math.floor(readPosA);
            const fracA = readPosA - idxA;
            const sA1 = delayBuffer[idxA % bufLen];
            const sA2 = delayBuffer[(idxA + 1) % bufLen];
            const valA = sA1 + fracA * (sA2 - sA1);

            const idxB = Math.floor(readPosB);
            const fracB = readPosB - idxB;
            const sB1 = delayBuffer[idxB % bufLen];
            const sB2 = delayBuffer[(idxB + 1) % bufLen];
            const valB = sB1 + fracB * (sB2 - sB1);
            
            // Hanning Window
            const normA = phA / grainLen;
            const normB = phB / grainLen;
            let gainA = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * normA));
            let gainB = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * normB));
            
            output[i] = (valA * gainA) + (valB * gainB);
            
            phaseMain += (1.0 - currentPitchFactor);
            writePos++; if (writePos >= bufLen) writePos = 0;
        }
    };

    return processor;
};

const updateTune = (node: AudioNode, s: PocketTuneSettings, ctx: AudioContext) => {
    (node as any)._settings = s;
};

const PocketTuneUI: React.FC<any> = ({ settings, onChange, trackId }) => {
    return (
        <MobileContainer title="POCKET TUNE">
            <div className="flex flex-col gap-4 w-full px-2 h-full">
                
                {/* Scale Selector */}
                <div className="flex flex-col gap-1 shrink-0">
                    <label className="text-[9px] text-[#666] font-bold uppercase text-center">KEY SCALE</label>
                    <select 
                        value={settings.scale}
                        onChange={(e) => onChange({...settings, scale: e.target.value})}
                        className="bg-[#111] text-white border border-[#333] rounded px-2 py-3 text-xs font-bold outline-none text-center"
                    >
                        {SCALES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="flex-1 flex flex-row justify-around gap-4 py-2">
                    {/* Speed Fader */}
                    <MobileFader 
                        value={settings.speed} 
                        min={0} 
                        max={0.5} 
                        onChange={(v) => onChange({...settings, speed: v})} 
                        label="SPEED"
                        color="bg-white"
                    />

                    {/* Amount Fader */}
                    <MobileFader 
                        value={settings.amount} 
                        min={0} 
                        max={100} 
                        onChange={(v) => onChange({...settings, amount: v})} 
                        label="AMOUNT"
                        unit="%"
                        color="bg-white"
                    />
                </div>

                <button onClick={() => onChange({...settings, active: !settings.active})} className={`shrink-0 py-3 rounded font-bold text-xs uppercase tracking-widest border w-full transition-all ${settings.active ? 'bg-gradient-to-r from-gray-200 to-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]' : 'bg-transparent text-[#555] border-[#333]'}`}>
                    {settings.active ? "CORRECTION ON" : "BYPASS"}
                </button>
            </div>
        </MobileContainer>
    );
};

export const PocketTunePlugin: EffectPlugin = { id: 'pocketTune', name: 'Pocket Tune', defaultSettings: { scale: 'C Major', speed: 0.05, amount: 100, active: true }, initialize: initTune, update: updateTune, component: PocketTuneUI };
