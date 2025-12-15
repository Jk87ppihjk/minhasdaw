
import React, { useEffect, useRef } from 'react';
import { EffectPlugin } from '../types';
import { MobileFader, MobileContainer } from './MobileSuite';

// --- PRO LIMITER (Brickwall) ---
interface ProLimiterSettings { threshold: number; ceiling: number; release: number; active: boolean; }

const initLimiter = (ctx: AudioContext, s: ProLimiterSettings) => {
    const input = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const output = ctx.createGain();

    input.connect(compressor);
    compressor.connect(output);

    // Hard limiting characteristics
    compressor.knee.value = 0;
    compressor.ratio.value = 20; // High ratio for limiting
    compressor.attack.value = 0.003; // Fast attack

    (input as any)._comp = compressor;
    (input as any)._out = output;

    updateLimiter(input, s, ctx);

    input.connect = (dest: any) => output.connect(dest);
    input.disconnect = () => output.disconnect();
    return input;
};

const updateLimiter = (node: AudioNode, s: ProLimiterSettings, ctx: AudioContext) => {
    const comp = (node as any)._comp as DynamicsCompressorNode;
    const out = (node as any)._out as GainNode;
    const now = ctx.currentTime;

    if (!s.active) {
        comp.threshold.setTargetAtTime(0, now, 0.1);
        out.gain.setTargetAtTime(1, now, 0.1);
    } else {
        comp.threshold.setTargetAtTime(s.threshold, now, 0.1);
        comp.release.setTargetAtTime(s.release, now, 0.1);
        // Makeup gain to match threshold reduction + ceiling
        const makeup = -s.threshold + s.ceiling; 
        const linearGain = Math.pow(10, makeup / 20);
        out.gain.setTargetAtTime(linearGain, now, 0.1);
    }
};

const ProLimiterUI: React.FC<any> = ({ settings, onChange }) => (
    <div className="flex flex-col w-full h-full bg-[#050505] border border-[#222]">
        <div className="bg-[#0a0a0a] border-b border-[#222] py-2 text-center shrink-0">
            <span className="text-white font-black text-xs uppercase tracking-[0.2em]">PRO LIMITER</span>
        </div>
        <div className="flex-1 flex justify-around p-4 items-center">
            <div className="h-full py-2">
                <MobileFader value={settings.threshold} min={-24} max={0} onChange={(v) => onChange({...settings, threshold: v})} label="THRESH" unit="dB" color="bg-red-500" />
            </div>
            <div className="h-full py-2">
                <MobileFader value={settings.ceiling} min={-10} max={0} onChange={(v) => onChange({...settings, ceiling: v})} label="CEILING" unit="dB" color="bg-green-500" />
            </div>
            <div className="h-full py-2">
                <MobileFader value={settings.release} min={0.01} max={1.0} onChange={(v) => onChange({...settings, release: v})} label="RELEASE" unit="s" color="bg-zinc-400" />
            </div>
            <button onClick={() => onChange({...settings, active: !settings.active})} className={`h-12 w-20 rounded font-bold text-[10px] border ${settings.active ? 'bg-white text-black border-white' : 'bg-transparent text-[#555] border-[#333]'}`}>
                {settings.active ? "LIMITING" : "BYPASS"}
            </button>
        </div>
    </div>
);

export const ProLimiterPlugin: EffectPlugin = { id: 'proLimiter', name: 'Pro Limiter', defaultSettings: { threshold: -3.0, ceiling: -0.1, release: 0.1, active: true }, initialize: initLimiter, update: updateLimiter, component: ProLimiterUI };


// --- MULTIBAND COMPRESSOR (3-Band Placeholder Logic for WebAudio) ---
// Note: True Multiband requires crossovers. We use 3 filters -> 3 comps -> merge.
interface MultibandSettings { lowThresh: number; midThresh: number; highThresh: number; active: boolean; }

const initMultiband = (ctx: AudioContext, s: MultibandSettings) => {
    const input = ctx.createGain();
    const output = ctx.createGain();

    // Crossover Filters
    const lowPass = ctx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = 200;
    const highPass = ctx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = 2000;
    const midBandLow = ctx.createBiquadFilter(); midBandLow.type = 'highpass'; midBandLow.frequency.value = 200;
    const midBandHigh = ctx.createBiquadFilter(); midBandHigh.type = 'lowpass'; midBandHigh.frequency.value = 2000;

    // Compressors
    const compLow = ctx.createDynamicsCompressor(); 
    const compMid = ctx.createDynamicsCompressor();
    const compHigh = ctx.createDynamicsCompressor();

    // Routing
    input.connect(lowPass); lowPass.connect(compLow); compLow.connect(output);
    
    input.connect(midBandLow); midBandLow.connect(midBandHigh); midBandHigh.connect(compMid); compMid.connect(output);
    
    input.connect(highPass); highPass.connect(compHigh); compHigh.connect(output);

    (input as any)._comps = [compLow, compMid, compHigh];
    
    updateMultiband(input, s, ctx);

    input.connect = (dest: any) => output.connect(dest);
    input.disconnect = () => output.disconnect();
    return input;
};

const updateMultiband = (node: AudioNode, s: MultibandSettings, ctx: AudioContext) => {
    const [low, mid, high] = (node as any)._comps as DynamicsCompressorNode[];
    const now = ctx.currentTime;

    if (!s.active) {
        [low, mid, high].forEach(c => c.threshold.setTargetAtTime(0, now, 0.1));
    } else {
        low.threshold.setTargetAtTime(s.lowThresh, now, 0.1);
        mid.threshold.setTargetAtTime(s.midThresh, now, 0.1);
        high.threshold.setTargetAtTime(s.highThresh, now, 0.1);
    }
};

const MultibandUI: React.FC<any> = ({ settings, onChange }) => (
    <MobileContainer title="MULTIBAND DYNAMICS">
        <div className="flex justify-around w-full h-full py-2 gap-2">
            <MobileFader value={settings.lowThresh} min={-60} max={0} label="LOW" unit="dB" onChange={(v) => onChange({...settings, lowThresh: v})} color="bg-blue-500" />
            <MobileFader value={settings.midThresh} min={-60} max={0} label="MID" unit="dB" onChange={(v) => onChange({...settings, midThresh: v})} color="bg-yellow-500" />
            <MobileFader value={settings.highThresh} min={-60} max={0} label="HIGH" unit="dB" onChange={(v) => onChange({...settings, highThresh: v})} color="bg-purple-500" />
            <div className="flex items-center">
                 <button onClick={() => onChange({...settings, active: !settings.active})} className={`h-12 w-12 rounded-full font-bold text-[8px] border ${settings.active ? 'bg-white text-black border-white' : 'bg-transparent text-[#555] border-[#333]'}`}>
                    {settings.active ? "ON" : "OFF"}
                </button>
            </div>
        </div>
    </MobileContainer>
);

export const MultibandPlugin: EffectPlugin = { id: 'multibandComp', name: 'Multiband Comp', defaultSettings: { lowThresh: -20, midThresh: -20, highThresh: -20, active: true }, initialize: initMultiband, update: updateMultiband, component: MultibandUI };
