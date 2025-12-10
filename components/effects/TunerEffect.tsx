import React, { useRef, useEffect, useState } from 'react';
// Certifique-se de importar seus types e o engine corretamente
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
  
  // Estado local apenas para display (reduz renderizações desnecessárias do React)
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

  // --- LOOP DE DADOS (60 FPS) ---
  // Busca dados do AudioEngine sem forçar re-render do componente inteiro,
  // apenas atualiza o estado visual necessário e desenha no canvas.
  useEffect(() => {
    let animationFrameId: number;

    const loop = () => {
      const state = audioEngine.getTunerState(trackId);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      // 1. Atualizar Estado Visual (apenas se mudou significativamente para economizar React Cycles)
      // Nota: Em apps de alta performance, evitamos setState no loop, mas aqui é necessário para os textos.
      if (state && !state.isSilence) {
        const diff = state.targetPitch > 0 ? (state.targetPitch / state.currentPitch) - 1.0 : 0;
        const isSynced = Math.abs(diff) < 0.02; // Threshold visual

        // Atualiza textos na tela (pode ser otimizado com refs se ficar lento)
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

      // 2. Desenhar no Canvas (Independente do React Render)
      if (canvas && ctx && containerRef.current) {
        // Resize dinâmico se necessário
        if (canvas.width !== containerRef.current.offsetWidth || canvas.height !== containerRef.current.offsetHeight) {
          canvas.width = containerRef.current.offsetWidth;
          canvas.height = containerRef.current.offsetHeight;
        }

        const w = canvas.width;
        const h = canvas.height;
        const centerY = h / 2;

        // Limpar
        ctx.clearRect(0, 0, w, h);

        // Grade de Fundo
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(w, centerY);
        ctx.strokeStyle = "#444"; // Linha Central
        ctx.stroke();

        // Indicador de Pitch (Bola e Linha Magnética)
        if (state && !state.isSilence) {
            // Fator de suavização visual
            const diff = state.targetPitch > 0 ? (state.targetPitch / state.currentPitch) - 1.0 : 0;
            
            // Amplifica a diferença para visualização (igual ao HTML original)
            const y = centerY - (diff * 300); 

            // Linha Magnética
            ctx.beginPath();
            ctx.moveTo(w/2, y);
            ctx.lineTo(w/2, centerY);
            ctx.strokeStyle = "rgba(230, 194, 0, 0.3)";
            ctx.stroke();

            // Bola
            ctx.beginPath();
            ctx.arc(w/2, y, 10, 0, Math.PI * 2);
            // Verde se afinado, Dourado se corrigindo
            ctx.fillStyle = Math.abs(diff) < 0.02 ? "#00ff00" : "#e6c200";
            ctx.shadowBlur = Math.abs(diff) < 0.02 ? 15 : 5;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [trackId]);

  // --- ESTILOS CUSTOMIZADOS (Sliders) ---
  const customStyles = `
    .desert-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      background: #333;
      border-radius: 2px;
      outline: none;
    }
    .desert-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #e6c200;
      cursor: pointer;
      border: 2px solid #000;
      box-shadow: 0 0 8px rgba(230, 194, 0, 0.4);
    }
    .desert-select {
        background-color: #000;
        color: #e6c200;
        border: 1px solid #444;
        padding: 4px 8px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        outline: none;
    }
  `;

  return (
    <div className="flex flex-col w-full h-full bg-black text-[#f0f0f0] font-mono select-none overflow-hidden border border-[#333]">
      <style>{customStyles}</style>

      {/* --- HEADER --- */}
      <div className="flex justify-between items-center px-4 py-2 bg-[#050505] border-b border-[#333] shrink-0">
         <h1 className="text-[#e6c200] text-sm tracking-widest font-bold uppercase">Auto-Pitch Pro</h1>
         <div className={`text-[10px] px-2 py-1 rounded border ${displayInfo.hz !== 'Silence' ? 'bg-[#e6c200] text-black border-[#e6c200] font-bold' : 'bg-[#222] text-[#666] border-[#444]'}`}>
            {displayInfo.hz !== 'Silence' ? 'ACTIVE' : 'IDLE'}
         </div>
      </div>

      {/* --- VISUALIZER --- */}
      <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden" ref={containerRef}>
        <canvas ref={canvasRef} className="absolute inset-0 z-0" />
        
        {/* Info Overlay */}
        <div className="z-10 text-6xl font-bold text-[#e6c200] drop-shadow-[0_0_20px_rgba(230,194,0,0.5)]">
            {displayInfo.note}
        </div>
        <div className="z-10 text-sm text-[#666] font-mono mt-2">
            {displayInfo.hz}
        </div>
        <div className={`z-10 text-xs font-bold uppercase mt-1 tracking-wider ${displayInfo.isSynced ? 'text-[#00ff00]' : 'text-[#ff3333]'}`}>
            {displayInfo.correction}
        </div>
      </div>

      {/* --- CONTROLS PANEL --- */}
      <div className="bg-[#111] p-4 border-t-2 border-[#e6c200] shrink-0 grid grid-cols-2 gap-x-6 gap-y-4">
        
        {/* Col 1: Scale */}
        <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#888] font-bold uppercase">Tonalidade (Key)</label>
            <select 
                value={settings.scale} 
                onChange={(e) => updateParam('scale', e.target.value)}
                className="desert-select w-full h-[30px]"
            >
                {SCALES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </div>

        {/* Col 2: Speed */}
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-end">
                <label className="text-[10px] text-[#888] font-bold uppercase">Speed</label>
                <span className="text-[11px] text-[#e6c200] font-bold">
                    {settings.speed < 0.1 ? "Trap (Fast)" : "Natural (Slow)"}
                </span>
            </div>
            <input 
                type="range" 
                className="desert-slider" 
                min="0" max="0.5" step="0.01" 
                value={settings.speed} 
                onChange={(e) => updateParam('speed', parseFloat(e.target.value))} 
            />
        </div>

        {/* Col 1: Reverb (NOVO) */}
        <div className="flex flex-col gap-1">
            <div className="flex justify-between items-end">
                <label className="text-[10px] text-[#888] font-bold uppercase">Reverb</label>
                <span className="text-[11px] text-[#e6c200] font-bold">{settings.reverb || 0}%</span>
            </div>
            <input 
                type="range" 
                className="desert-slider" 
                min="0" max="100" step="1" 
                value={settings.reverb || 0} 
                onChange={(e) => updateParam('reverb', parseInt(e.target.value))} 
            />
        </div>

        {/* Col 2: Harmony & Bypass */}
        <div className="flex flex-col justify-between h-full pt-1">
            {/* Harmony Toggle */}
            <div 
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => updateParam('harmony', !settings.harmony)}
            >
                <div className={`w-4 h-4 border border-[#444] flex items-center justify-center transition-colors ${settings.harmony ? 'bg-[#e6c200] border-[#e6c200]' : 'bg-black group-hover:border-[#666]'}`}>
                    {settings.harmony && <div className="w-2 h-2 bg-black" />}
                </div>
                <span className={`text-[11px] uppercase font-bold ${settings.harmony ? 'text-[#e6c200]' : 'text-[#888]'}`}>
                    Harmonia (3 Vozes)
                </span>
            </div>

            {/* Bypass Button */}
            <button 
                onClick={() => updateParam('active', !settings.active)} 
                className={`mt-2 w-full border py-1 text-[11px] uppercase font-bold tracking-widest transition-all
                ${settings.active 
                    ? 'bg-[#e6c200] text-black border-[#e6c200] hover:bg-[#ffe033]' 
                    : 'bg-transparent text-[#666] border-[#444] hover:border-[#666] hover:text-[#888]'
                }`}
            >
                {settings.active ? "EFEITO LIGADO" : "BYPASS"}
            </button>
        </div>

      </div>
    </div>
  );
};