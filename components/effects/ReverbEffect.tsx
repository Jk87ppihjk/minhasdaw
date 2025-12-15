import React, { useRef, useEffect } from 'react';
import { EffectSettings } from '../../types';
import { audioEngine } from '../../services/AudioEngine';

interface ReverbEffectProps {
  trackId: string;
  settings: EffectSettings['reverb'];
  onChange: (settings: EffectSettings['reverb']) => void;
}

export const ReverbEffect: React.FC<ReverbEffectProps> = ({ trackId, settings, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const updateParam = (key: keyof EffectSettings['reverb'], value: number) => {
      onChange({ ...settings, [key]: value });
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const analyser = audioEngine.getTrackAnalyser(trackId);
      const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
      
      const particles: {x: number, y: number, vx: number, vy: number, life: number, size: number}[] = [];
      const maxParticles = 100;
      let rafId: number;

      const draw = () => {
          // Resize Logic
          if (containerRef.current && (canvas.width !== containerRef.current.offsetWidth || canvas.height !== containerRef.current.offsetHeight)) {
              canvas.width = containerRef.current.offsetWidth;
              canvas.height = containerRef.current.offsetHeight;
          }

          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = h / 2;

          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, w, h);

          let audioLevel = 0;
          if (analyser) {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for(let i=0; i<30; i++) sum += dataArray[i]; 
              audioLevel = sum / 30 / 255;
          }

          const sizeVal = settings.size;
          const pulse = audioLevel * 20;
          const backSize = (50 + (sizeVal * 100)) + pulse;

          ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 1;
          
          ctx.beginPath();
          ctx.rect(cx - backSize, cy - backSize * 0.6, backSize * 2, backSize * 1.2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(cx - backSize, cy - backSize * 0.6);
          ctx.moveTo(w, 0); ctx.lineTo(cx + backSize, cy - backSize * 0.6);
          ctx.moveTo(0, h); ctx.lineTo(cx - backSize, cy + backSize * 0.6);
          ctx.moveTo(w, h); ctx.lineTo(cx + backSize, cy + backSize * 0.6);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(cx, cy + backSize * 0.6);
          ctx.lineTo(cx, h);
          ctx.stroke();

          if (audioLevel > 0.05 && particles.length < maxParticles) {
              particles.push({
                  x: cx, y: cy,
                  vx: (Math.random() - 0.5) * 5,
                  vy: (Math.random() - 0.5) * 5,
                  life: 1.0,
                  size: Math.random() * 2 + 1
              });
          }

          const decayFactor = 0.01 + (1.0 / settings.time) * 0.02;

          for (let i = particles.length - 1; i >= 0; i--) {
              let p = particles[i];
              p.x += p.vx;
              p.y += p.vy;
              p.life -= decayFactor;

              if (p.life <= 0) {
                  particles.splice(i, 1);
                  continue;
              }

              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
              ctx.fill();
          }

          if (audioLevel > 0.01) {
              ctx.beginPath();
              ctx.arc(cx, cy, backSize * 0.3 + (pulse * 2), 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(255, 255, 255, ${audioLevel * 0.5})`;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(cx, cy, backSize * 0.6 + (pulse * 4), 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(255, 255, 255, ${audioLevel * 0.3})`;
              ctx.stroke();
          }

          rafId = requestAnimationFrame(draw);
      };
      
      draw();
      return () => cancelAnimationFrame(rafId);
  }, [trackId, settings.size, settings.time]);

  return (
    <div className="flex flex-col w-full h-full bg-[#000] text-[#f0f0f0] font-[Courier New] select-none">
        <style>{`
            .studio-slider { width: 100%; height: 2px; background: #333; appearance: none; border-radius: 0px; outline: none; margin-top: 5px; }
            .studio-slider::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; background: #fff; border-radius: 50%; cursor: pointer; border: 2px solid #000; }
        `}</style>

        {/* Visual Section */}
        <div className="flex-1 relative bg-[#000] border-b border-[#222] overflow-hidden" ref={containerRef}>
            <canvas ref={canvasRef} className="block w-full h-full" />
            <div className="absolute top-[10px] left-[15px] text-[10px] text-[#444] pointer-events-none uppercase">3D ROOM SIMULATOR</div>
        </div>

        {/* Controls Panel */}
        <div className="bg-[#050505] p-[20px] grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-[20px] border-t border-[#333] shrink-0">
            {/* Time */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#666] font-bold">TIME</span><span className="text-[12px] text-white">{settings.time.toFixed(1)}s</span></div>
                <input type="range" className="studio-slider" min="0.1" max="5.0" step="0.1" value={settings.time} onChange={(e) => updateParam('time', parseFloat(e.target.value))} />
            </div>
            {/* Mix */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#666] font-bold">MIX</span><span className="text-[12px] text-white">{Math.round(settings.mix * 100)}%</span></div>
                <input type="range" className="studio-slider" min="0" max="1" step="0.01" value={settings.mix} onChange={(e) => updateParam('mix', parseFloat(e.target.value))} />
            </div>
            {/* Pre Delay */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#666] font-bold">PRE-DELAY</span><span className="text-[12px] text-white">{Math.round(settings.preDelay)}ms</span></div>
                <input type="range" className="studio-slider" min="0" max="200" step="1" value={settings.preDelay} onChange={(e) => updateParam('preDelay', parseFloat(e.target.value))} />
            </div>
            {/* Tone */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#666] font-bold">TONE</span><span className="text-[12px] text-white">{Math.round(settings.tone)}Hz</span></div>
                <input type="range" className="studio-slider" min="500" max="15000" step="100" value={settings.tone} onChange={(e) => updateParam('tone', parseFloat(e.target.value))} />
            </div>
            {/* Size */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#666] font-bold">SIZE</span><span className="text-[12px] text-white">{Math.round(settings.size * 100)}%</span></div>
                <input type="range" className="studio-slider" min="0.1" max="1" step="0.01" value={settings.size} onChange={(e) => updateParam('size', parseFloat(e.target.value))} />
            </div>
            {/* Bypass */}
            <div className="flex items-end justify-end">
                <button onClick={() => updateParam('active', !settings.active ? 1 : 0)} className={`w-full border py-2 text-[12px] uppercase font-bold tracking-widest ${settings.active ? 'bg-white text-black border-white' : 'bg-[#111] text-[#666] border-[#333]'}`}>
                    {settings.active ? "REVERB ON" : "REVERB OFF"}
                </button>
            </div>
        </div>
    </div>
  );
};