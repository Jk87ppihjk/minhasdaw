import React, { useRef, useEffect } from 'react';
import { EffectSettings } from '../../types';
import { audioEngine } from '../../services/AudioEngine';

interface CompressorEffectProps {
  trackId: string;
  settings: EffectSettings['compressor'];
  onChange: (settings: EffectSettings['compressor']) => void;
}

export const CompressorEffect: React.FC<CompressorEffectProps> = ({ trackId, settings, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeDataRef = useRef<{input: number, reduction: number, thresh: number}[]>([]);
  
  const updateParam = (key: keyof EffectSettings['compressor'], value: number) => {
      onChange({ ...settings, [key]: value });
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      const grBar = document.getElementById('grBarVisual');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const analyser = audioEngine.getTrackAnalyser(trackId);
      const dataArray = new Float32Array(2048);

      let rafId: number;

      const getdB = (buffer: Float32Array) => {
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
          const rms = Math.sqrt(sum / buffer.length);
          if (rms < 0.0001) return -100;
          return 20 * Math.log10(rms);
      };

      const mapY = (db: number, height: number) => {
          const min = -60; const max = 0;
          let norm = (db - min) / (max - min);
          if (norm < 0) norm = 0; if (norm > 1) norm = 1;
          return height - (norm * height);
      };

      const draw = () => {
          // Resize Check
          if (containerRef.current && (canvas.width !== containerRef.current.offsetWidth || canvas.height !== containerRef.current.offsetHeight)) {
              canvas.width = containerRef.current.offsetWidth;
              canvas.height = containerRef.current.offsetHeight;
          }

          const width = canvas.width;
          const height = canvas.height;
          
          let inputdB = -100;
          let reductiondB = 0;

          if (analyser) {
              analyser.getFloatTimeDomainData(dataArray);
              inputdB = getdB(dataArray);
              reductiondB = audioEngine.getCompressorReduction(trackId);
          }

          timeDataRef.current.push({ input: inputdB, reduction: reductiondB, thresh: settings.threshold });
          if (timeDataRef.current.length > width) timeDataRef.current.shift(); // Fill width pixel by pixel approx

          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);

          // Threshold Line
          const threshY = mapY(settings.threshold, height);
          ctx.beginPath();
          ctx.strokeStyle = "#444";
          ctx.setLineDash([5, 5]);
          ctx.moveTo(0, threshY);
          ctx.lineTo(width, threshY);
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.fillStyle = "#444";
          ctx.font = "10px monospace";
          ctx.fillText("THRESH", 5, threshY - 5);

          // GR Bar
          if (grBar) {
              let grHeight = (Math.abs(reductiondB) / 20) * 100;
              if (grHeight > 100) grHeight = 100;
              grBar.style.height = `${grHeight}%`;
          }

          // Waveform
          if (timeDataRef.current.length > 1) {
              const step = width / 300; // Resolution scaling

              // Input (Gold)
              ctx.beginPath();
              ctx.moveTo(0, mapY(timeDataRef.current[0].input, height));
              for (let i = 1; i < timeDataRef.current.length; i++) {
                  // Stretch data to fit width
                  const x = (i / timeDataRef.current.length) * width;
                  ctx.lineTo(x, mapY(timeDataRef.current[i].input, height));
              }
              ctx.strokeStyle = "rgba(230, 194, 0, 0.8)";
              ctx.lineWidth = 2;
              ctx.stroke();

              // Reduction (Red Fill)
              ctx.beginPath();
              for (let i = 0; i < timeDataRef.current.length; i++) {
                  const x = (i / timeDataRef.current.length) * width;
                  const y = mapY(timeDataRef.current[i].input, height);
                  if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              }
              for (let i = timeDataRef.current.length - 1; i >= 0; i--) {
                  const x = (i / timeDataRef.current.length) * width;
                  const y = mapY(timeDataRef.current[i].input + timeDataRef.current[i].reduction, height);
                  ctx.lineTo(x, y);
              }
              ctx.closePath();
              ctx.fillStyle = "rgba(255, 50, 50, 0.7)";
              ctx.fill();
          }

          rafId = requestAnimationFrame(draw);
      };

      draw();
      return () => cancelAnimationFrame(rafId);
  }, [trackId, settings.threshold]);

  return (
    <div className="flex flex-col w-full h-full bg-[#000] text-[#f0f0f0] font-mono select-none">
        <style>{`
            .desert-comp-slider { width: 100%; height: 4px; background: #333; appearance: none; border-radius: 2px; outline: none; margin-top: 5px; }
            .desert-comp-slider::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; background: #e6c200; border-radius: 50%; cursor: pointer; box-shadow: 0 0 5px rgba(230, 194, 0, 0.4); border: 2px solid #000; }
        `}</style>

        {/* Visualizer */}
        <div className="flex-1 relative bg-[#000] border-b border-[#333] overflow-hidden" ref={containerRef}>
            <canvas ref={canvasRef} className="block w-full h-full" />
            <div className="absolute top-[10px] left-[15px] text-[10px] text-[#666] pointer-events-none">LINE: Input<br/>RED: Reduction</div>
            <div className="absolute right-[10px] top-[10px] bottom-[10px] w-[12px] bg-[#111] border border-[#444] rounded-[2px] overflow-hidden">
                <div id="grBarVisual" className="w-full bg-[#ff3333] absolute top-0 transition-[height] duration-75 ease-linear h-0"></div>
            </div>
        </div>

        {/* Controls */}
        <div className="bg-[#111] p-[20px] grid grid-cols-2 md:grid-cols-4 gap-x-[20px] gap-y-[20px] border-t-2 border-[#e6c200] shrink-0">
            {/* THRESHOLD */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#888] font-bold">THRESHOLD</span><span className="text-[12px] text-[#e6c200]">{settings.threshold.toFixed(1)} dB</span></div>
                <input type="range" className="desert-comp-slider" min="-60" max="0" step="0.5" value={settings.threshold} onChange={(e) => updateParam('threshold', parseFloat(e.target.value))} />
            </div>
            {/* RATIO */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#888] font-bold">RATIO</span><span className="text-[12px] text-[#e6c200]">{settings.ratio.toFixed(1)}:1</span></div>
                <input type="range" className="desert-comp-slider" min="1" max="20" step="0.1" value={settings.ratio} onChange={(e) => updateParam('ratio', parseFloat(e.target.value))} />
            </div>
            {/* ATTACK */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#888] font-bold">ATTACK</span><span className="text-[12px] text-[#e6c200]">{Math.round(settings.attack * 1000)} ms</span></div>
                <input type="range" className="desert-comp-slider" min="0" max="1" step="0.001" value={settings.attack} onChange={(e) => updateParam('attack', parseFloat(e.target.value))} />
            </div>
            {/* RELEASE */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#888] font-bold">RELEASE</span><span className="text-[12px] text-[#e6c200]">{Math.round(settings.release * 1000)} ms</span></div>
                <input type="range" className="desert-comp-slider" min="0.01" max="1" step="0.01" value={settings.release} onChange={(e) => updateParam('release', parseFloat(e.target.value))} />
            </div>
            {/* KNEE */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#888] font-bold">KNEE</span><span className="text-[12px] text-[#e6c200]">{settings.knee}</span></div>
                <input type="range" className="desert-comp-slider" min="0" max="40" step="1" value={settings.knee} onChange={(e) => updateParam('knee', parseFloat(e.target.value))} />
            </div>
            {/* MAKEUP */}
            <div className="flex flex-col gap-1">
                <div className="flex justify-between"><span className="text-[10px] text-[#888] font-bold">MAKEUP</span><span className="text-[12px] text-[#e6c200]">+{settings.makeup.toFixed(1)} dB</span></div>
                <input type="range" className="desert-comp-slider" min="0" max="20" step="0.5" value={settings.makeup} onChange={(e) => updateParam('makeup', parseFloat(e.target.value))} />
            </div>
            
            {/* BYPASS */}
            <div className="col-span-2 md:col-span-2 flex items-end justify-end">
                <button onClick={() => updateParam('active', !settings.active ? 1 : 0)} className={`w-full border border-[#444] py-2 text-[12px] font-bold tracking-widest uppercase ${settings.active ? 'bg-[#e6c200] text-black border-[#e6c200]' : 'bg-[#222] text-[#666]'}`}>
                    {settings.active ? "COMPRESSOR ON" : "COMPRESSOR OFF"}
                </button>
            </div>
        </div>
    </div>
  );
};