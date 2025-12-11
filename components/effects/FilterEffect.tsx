import React, { useRef, useEffect, useState } from 'react';
import { EffectSettings } from '../../types';
import { audioEngine } from '../../services/AudioEngine';

interface FilterEffectProps {
  trackId: string;
  settings: EffectSettings['filter'];
  onChange: (settings: EffectSettings['filter']) => void;
}

export const FilterEffect: React.FC<FilterEffectProps> = ({ trackId, settings, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  
  // Local state for UI feedback text derived from settings
  const [uiState, setUiState] = useState({
      type: 'CLEAN',
      freq: 'OFF',
      res: '0%'
  });

  const updateParam = (changes: Partial<EffectSettings['filter']>) => {
      onChange({ ...settings, ...changes });
  };

  // --- Logic Helpers ---
  const getFilterState = (x: number, y: number) => {
      const minLog = Math.log(20);
      const maxLog = Math.log(20000);
      const getFreq = (t: number) => Math.exp(minLog + t * (maxLog - minLog));
      
      let type = "CLEAN";
      let freq = "BYPASS";
      
      if (x < 0.45) {
          const norm = x / 0.45;
          type = "LOW PASS";
          freq = Math.round(getFreq(norm)) + " Hz";
      } else if (x > 0.55) {
          const norm = (x - 0.55) / 0.45;
          type = "HIGH PASS";
          freq = Math.round(getFreq(norm)) + " Hz";
      }

      return {
          type,
          freq,
          res: Math.round(y * 100) + "%"
      };
  };

  useEffect(() => {
      setUiState(getFilterState(settings.x, settings.y));
  }, [settings.x, settings.y]);

  // --- Visual Loop ---
  useEffect(() => {
      let rafId: number;
      const analyser = audioEngine.getTrackAnalyser(trackId);
      const bufferLen = analyser ? analyser.frequencyBinCount : 0;
      const dataArray = new Uint8Array(bufferLen);

      const loop = () => {
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (!canvas || !container) return;

          if (canvas.width !== container.offsetWidth || canvas.height !== container.offsetHeight) {
              canvas.width = container.offsetWidth;
              canvas.height = container.offsetHeight;
          }

          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const w = canvas.width;
          const h = canvas.height;

          // 1. Background
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, h);

          // 2. Grid & Crosshair
          const cx = settings.x * w;
          const cy = (1 - settings.y) * h;
          const isActive = settings.x < 0.45 || settings.x > 0.55;

          // Center Line
          ctx.lineWidth = 1;
          ctx.strokeStyle = "#333";
          ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke();

          // Laser Cursor
          ctx.beginPath();
          ctx.strokeStyle = "rgba(230, 194, 0, 0.3)";
          ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
          ctx.moveTo(0, cy); ctx.lineTo(w, cy);
          ctx.stroke();

          // Cursor Dot
          ctx.beginPath();
          ctx.arc(cx, cy, 8 + (settings.y * 10), 0, Math.PI * 2);
          ctx.fillStyle = isActive ? "#e6c200" : "#444";
          ctx.shadowBlur = isActive ? 15 : 0;
          ctx.shadowColor = "#e6c200";
          ctx.fill();
          ctx.shadowBlur = 0;

          // 3. Audio Spectrum
          if (analyser) {
              analyser.getByteFrequencyData(dataArray);
              ctx.beginPath();
              
              const barWidth = w / bufferLen * 2.5;
              for(let i = 0; i < bufferLen; i++) {
                  const v = dataArray[i] / 255.0;
                  const y = h - (v * h);
                  const x = (i / bufferLen) * w; 
                  if (i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              }
              
              ctx.lineTo(w, h);
              ctx.lineTo(0, h);
              ctx.lineWidth = 2;
              ctx.strokeStyle = isActive ? "#e6c200" : "#555";
              ctx.stroke();
              ctx.fillStyle = isActive ? "rgba(230, 194, 0, 0.1)" : "rgba(80, 80, 80, 0.1)";
              ctx.fill();
          }

          rafId = requestAnimationFrame(loop);
      };
      loop();
      return () => cancelAnimationFrame(rafId);
  }, [trackId, settings.x, settings.y]);

  // --- Interaction ---
  const handleXY = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let x = (clientX - rect.left) / rect.width;
      let y = 1.0 - ((clientY - rect.top) / rect.height);
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      updateParam({ x, y });
  };

  const handleStrip = (clientX: number) => {
      if (!stripRef.current) return;
      const rect = stripRef.current.getBoundingClientRect();
      let x = (clientX - rect.left) / rect.width;
      x = Math.max(0, Math.min(1, x));
      updateParam({ x });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#050505] text-[#f0f0f0] font-mono select-none border border-[#222]">
      
      {/* Visualizer Area (XY Pad) */}
      <div 
        ref={containerRef}
        className="flex-1 relative cursor-crosshair overflow-hidden touch-none"
        onMouseDown={(e) => { handleXY(e.clientX, e.clientY); const move = (ev: MouseEvent) => handleXY(ev.clientX, ev.clientY); window.addEventListener('mousemove', move); window.addEventListener('mouseup', () => window.removeEventListener('mousemove', move), {once:true}); }}
      >
          <canvas ref={canvasRef} className="block w-full h-full" />
          <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] text-xs text-[#333] font-bold pointer-events-none text-center">
              DRAG TO FILTER<br/>↔ FREQ | ↕ RES
          </div>
      </div>

      {/* Controls Panel */}
      <div className="bg-[#111] p-4 border-t-2 border-[#e6c200] shrink-0 flex flex-col gap-4 h-[160px]">
          
          {/* Info Header */}
          <div className="flex justify-between items-end border-b border-[#333] pb-2">
              <div className="flex flex-col">
                  <span className="text-[9px] text-[#888] font-bold uppercase">CUTOFF FREQ</span>
                  <span className="text-xl text-[#e6c200] font-bold text-shadow">{uiState.freq}</span>
              </div>
              
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold border ${uiState.type !== 'CLEAN' ? 'bg-[#e6c200] text-black border-[#e6c200]' : 'bg-black text-[#555] border-[#333]'}`}>
                  {uiState.type}
              </div>

              <div className="flex flex-col text-right">
                  <span className="text-[9px] text-[#888] font-bold uppercase">RESONANCE</span>
                  <span className="text-xl text-[#e6c200] font-bold text-shadow">{uiState.res}</span>
              </div>
          </div>

          {/* Touch Strip */}
          <div className="flex flex-col gap-1">
              <div 
                ref={stripRef}
                className="relative h-10 bg-[#1a1a1a] border border-[#333] rounded overflow-hidden cursor-ew-resize touch-none"
                onMouseDown={(e) => { handleStrip(e.clientX); const move = (ev: MouseEvent) => handleStrip(ev.clientX); window.addEventListener('mousemove', move); window.addEventListener('mouseup', () => window.removeEventListener('mousemove', move), {once:true}); }}
              >
                  {/* Fill Logic */}
                  <div 
                    className="absolute top-0 bottom-0 bg-[#e6c200] opacity-30 pointer-events-none"
                    style={{
                        left: settings.x < 0.5 ? `${settings.x * 100}%` : '50%',
                        width: settings.x < 0.5 ? `${(0.5 - settings.x) * 100}%` : `${(settings.x - 0.5) * 100}%`,
                        display: (settings.x > 0.45 && settings.x < 0.55) ? 'none' : 'block'
                    }}
                  />
                  {/* Thumb */}
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white] pointer-events-none"
                    style={{ left: `${settings.x * 100}%` }}
                  />
              </div>
              <div className="flex justify-between text-[8px] text-[#555] font-bold uppercase px-1">
                  <span>LOW PASS</span>
                  <span>NEUTRAL</span>
                  <span>HIGH PASS</span>
              </div>
          </div>

          {/* Bypass */}
          <button 
             onClick={() => updateParam({ active: !settings.active })}
             className={`w-full text-[10px] font-bold py-1 uppercase tracking-widest ${settings.active ? 'text-[#e6c200] hover:text-white' : 'text-[#555]'}`}
          >
              {settings.active ? "FILTER ACTIVE" : "BYPASS"}
          </button>
      </div>
    </div>
  );
};