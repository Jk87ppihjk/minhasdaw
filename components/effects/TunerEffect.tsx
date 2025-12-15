import React, { useRef, useEffect, useState } from 'react';
import { EffectSettings } from '../../types'; 
import { audioEngine } from '../../services/AudioEngine';

interface TunerEffectProps {
  trackId: string;
  settings: EffectSettings['autoPitch'];
  onChange: (settings: EffectSettings['autoPitch']) => void;
}

const SCALES_LIST = [
  "chromatic", "C Major", "C# Major", "D Major", "D# Major", "E Major", "F Major", "F# Major", 
  "G Major", "G# Major", "A Major", "A# Major", "B Major",
  "C Minor", "C# Minor", "D Minor", "D# Minor", "E Minor", "F Minor", "F# Minor", 
  "G Minor", "G# Minor", "A Minor", "A# Minor", "B Minor"
];

export const TunerEffect: React.FC<TunerEffectProps> = ({ trackId, settings, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [displayInfo, setDisplayInfo] = useState({
    note: '--',
    hz: 'Silence',
    correction: '',
    isSynced: false,
    diff: 0
  });

  const updateParam = (key: keyof EffectSettings['autoPitch'], value: any) => {
    onChange({ ...settings, [key]: value });
  };

  useEffect(() => {
    let animationFrameId: number;

    const loop = () => {
      const state = audioEngine.getTunerState(trackId);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (state && !state.isSilence) {
        const diff = state.targetPitch > 0 ? (state.targetPitch / state.currentPitch) - 1.0 : 0;
        const isSynced = Math.abs(diff) < 0.02;

        setDisplayInfo({
          note: state.targetNoteName,
          hz: Math.round(state.currentPitch) + ' Hz',
          correction: isSynced ? 'TUNED' : `${state.noteName} -> ${state.targetNoteName}`,
          isSynced,
          diff
        });
      } else {
        setDisplayInfo({ note: '--', hz: 'Silence', correction: '', isSynced: false, diff: 0 });
      }

      if (canvas && ctx && containerRef.current) {
        if (canvas.width !== containerRef.current.offsetWidth || canvas.height !== containerRef.current.offsetHeight) {
          canvas.width = containerRef.current.offsetWidth;
          canvas.height = containerRef.current.offsetHeight;
        }

        const w = canvas.width;
        const h = canvas.height;
        const centerY = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Gradient Background
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0a0a');
        grad.addColorStop(1, '#000');
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,w,h);

        // Grid
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<w; i+=40) { ctx.moveTo(i, 0); ctx.lineTo(i, h); }
        for(let i=0; i<h; i+=40) { ctx.moveTo(0, i); ctx.lineTo(w, i); }
        ctx.stroke();

        // Center Line
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(w, centerY);
        ctx.strokeStyle = "#333"; 
        ctx.lineWidth = 2;
        ctx.stroke();

        if (state && !state.isSilence) {
            const diff = state.targetPitch > 0 ? (state.targetPitch / state.currentPitch) - 1.0 : 0;
            const y = centerY - (diff * 300); 

            // Connection Line
            ctx.beginPath();
            ctx.moveTo(w/2, y);
            ctx.lineTo(w/2, centerY);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Ball
            ctx.beginPath();
            ctx.arc(w/2, y, 12, 0, Math.PI * 2);
            ctx.fillStyle = Math.abs(diff) < 0.02 ? "#ffffff" : "#777";
            ctx.shadowBlur = 20;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Inner Core
            ctx.beginPath();
            ctx.arc(w/2, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#000";
            ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [trackId]);

  const customStyles = `
    .studio-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      background: #222;
      border-radius: 3px;
      outline: none;
    }
    .studio-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      border: 2px solid #000;
    }
    .studio-select {
        background-color: #0a0a0a;
        color: #fff;
        border: 1px solid #333;
        padding: 6px 10px;
        font-family: 'Inter', sans-serif;
        font-size: 12px;
        font-weight: 600;
        outline: none;
        border-radius: 4px;
    }
    .studio-select:focus {
        border-color: #fff;
    }
  `;

  return (
    <div className="flex flex-col w-full h-full bg-[#050505] text-[#f0f0f0] font-sans select-none overflow-hidden border border-[#222]">
      <style>{customStyles}</style>

      {/* --- HEADER --- */}
      <div className="flex justify-between items-center px-6 py-3 bg-[#0a0a0a] border-b border-[#222] shrink-0 shadow-lg">
         <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${displayInfo.hz !== 'Silence' ? 'bg-white animate-pulse' : 'bg-[#333]'}`}></div>
            <h1 className="text-white text-sm tracking-widest font-black uppercase">Auto-Pitch <span className="text-zinc-500">PRO</span></h1>
         </div>
         <div className={`text-[10px] px-3 py-1 rounded-full border font-bold tracking-wider ${displayInfo.hz !== 'Silence' ? 'bg-white/10 text-white border-white/30' : 'bg-[#1a1a1a] text-[#555] border-[#333]'}`}>
            {displayInfo.hz !== 'Silence' ? 'SIGNAL DETECTED' : 'NO SIGNAL'}
         </div>
      </div>

      {/* --- VISUALIZER --- */}
      <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden" ref={containerRef}>
        <canvas ref={canvasRef} className="absolute inset-0 z-0" />
        
        {/* Info Overlay */}
        <div className="z-10 text-7xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] tracking-tighter">
            {displayInfo.note}
        </div>
        <div className="z-10 text-sm text-[#555] font-mono mt-2 bg-black/50 px-3 py-1 rounded backdrop-blur-sm border border-[#222]">
            {displayInfo.hz}
        </div>
        <div className={`z-10 text-xs font-bold uppercase mt-4 tracking-[0.2em] px-4 py-1 rounded-full ${displayInfo.isSynced ? 'bg-white text-black' : 'text-[#777] border border-[#333]'}`}>
            {displayInfo.correction}
        </div>
      </div>

      {/* --- CONTROLS PANEL --- */}
      <div className="bg-[#0a0a0a] p-6 border-t border-[#333] shrink-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 z-20">
        
        {/* Scale */}
        <div className="flex flex-col gap-2">
            <label className="text-[10px] text-[#666] font-bold uppercase tracking-widest">Key Scale</label>
            <select 
                value={settings.scale} 
                onChange={(e) => updateParam('scale', e.target.value)}
                className="studio-select w-full"
            >
                {SCALES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </div>

        {/* Speed */}
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-end">
                <label className="text-[10px] text-[#666] font-bold uppercase tracking-widest">Retune Speed</label>
                <span className="text-[10px] text-white font-bold bg-[#333] px-2 py-0.5 rounded">
                    {settings.speed < 0.1 ? "FAST" : "NATURAL"}
                </span>
            </div>
            <input 
                type="range" 
                className="studio-slider" 
                min="0" max="0.5" step="0.01" 
                value={settings.speed} 
                onChange={(e) => updateParam('speed', parseFloat(e.target.value))} 
            />
        </div>

        {/* Reverb */}
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-end">
                <label className="text-[10px] text-[#666] font-bold uppercase tracking-widest">Atmosphere</label>
                <span className="text-[10px] text-white font-bold bg-[#333] px-2 py-0.5 rounded">{settings.reverb || 0}%</span>
            </div>
            <input 
                type="range" 
                className="studio-slider" 
                min="0" max="100" step="1" 
                value={settings.reverb || 0} 
                onChange={(e) => updateParam('reverb', parseInt(e.target.value))} 
            />
        </div>

        {/* Actions */}
        <div className="flex flex-col justify-between h-full gap-2">
            <div 
                className={`flex items-center gap-3 cursor-pointer p-2 rounded border transition-all ${settings.harmony ? 'bg-white text-black border-white' : 'bg-[#111] border-[#333] hover:border-[#555]'}`}
                onClick={() => updateParam('harmony', !settings.harmony)}
            >
                <div className={`w-3 h-3 rounded-sm ${settings.harmony ? 'bg-black' : 'bg-[#333]'}`}></div>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${settings.harmony ? 'text-black' : 'text-[#888]'}`}>
                    Harmony Mode
                </span>
            </div>

            <button 
                onClick={() => updateParam('active', !settings.active)} 
                className={`w-full py-2 text-[10px] uppercase font-black tracking-[0.2em] transition-all rounded
                ${settings.active 
                    ? 'bg-white text-black hover:bg-gray-200' 
                    : 'bg-[#1a1a1a] text-[#555] border border-[#333] hover:border-[#555] hover:text-[#888]'
                }`}
            >
                {settings.active ? "ENGAGED" : "BYPASS"}
            </button>
        </div>

      </div>
    </div>
  );
};