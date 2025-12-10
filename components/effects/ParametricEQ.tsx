import React, { useRef, useEffect, useState } from 'react';
import { FilterBand } from '../../types';
import { audioEngine } from '../../services/AudioEngine';

// Nova interface para suportar configurações globais além das bandas
export interface EQSettings {
  bands: FilterBand[];
  reverb: number; // 0 a 100
  preamp: number; // -12 a +12 dB
}

interface ParametricEQProps {
  trackId: string;
  settings: EQSettings;
  onChange: (settings: EQSettings) => void;
}

export const ParametricEQ: React.FC<ParametricEQProps> = ({ trackId, settings, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Estado local para interação (evita re-render do React durante arrasto)
  const [selectedBandIndex, setSelectedBandIndex] = useState<number>(-1);
  const [hoverBandIndex, setHoverBandIndex] = useState<number>(-1);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Refs para o Loop de Animação (acesso direto sem stale closures)
  const stateRef = useRef({
    settings,
    isDragging: false,
    dragIndex: -1,
    lastTap: 0
  });

  // Sincroniza refs com props
  useEffect(() => {
    stateRef.current.settings = settings;
    // Se o índice selecionado não existe mais (ex: deletado), reseta
    if (selectedBandIndex >= settings.bands.length) setSelectedBandIndex(-1);
  }, [settings, selectedBandIndex]);

  // --- Helpers Matemáticos (Escala Logarítmica) ---
  const minLog = Math.log(20);
  const maxLog = Math.log(20000);
  
  const getXFromFreq = (freq: number, w: number) => {
    const valLog = Math.log(Math.max(20, Math.min(20000, freq)));
    return ((valLog - minLog) / (maxLog - minLog)) * w;
  };

  const getFreqFromX = (x: number, w: number) => {
    const scale = x / w;
    return Math.exp(minLog + scale * (maxLog - minLog));
  };

  const getYFromdB = (db: number, h: number) => {
    // Range visual: +24dB a -24dB
    const minDb = -24;
    const maxDb = 24;
    const norm = (db - minDb) / (maxDb - minDb);
    return h - (norm * h);
  };

  const getdBFromY = (y: number, h: number) => {
    const minDb = -24;
    const maxDb = 24;
    const norm = 1 - (y / h);
    return minDb + (norm * (maxDb - minDb));
  };

  // --- Loop de Renderização (Canvas) ---
  useEffect(() => {
    let frameId: number;
    const analyser = audioEngine.getTrackAnalyser(trackId);
    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Resize dinâmico
      if (canvas.width !== container.offsetWidth || canvas.height !== container.offsetHeight) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
      }
      const w = canvas.width;
      const h = canvas.height;

      // 1. Fundo Preto Absoluto
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // 2. Grid Técnico
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#222';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#666';

      const freqs = [60, 200, 1000, 5000, 10000];
      const labels = ["60", "200", "1k", "5k", "10k"];
      
      freqs.forEach((f, i) => {
        const x = getXFromFreq(f, w);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillText(labels[i], x, h - 6);
      });

      // Linha 0dB
      const yZero = getYFromdB(0, h);
      ctx.beginPath();
      ctx.strokeStyle = '#444';
      ctx.moveTo(0, yZero);
      ctx.lineTo(w, yZero);
      ctx.stroke();

      // 3. Espectro (RTA)
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        ctx.beginPath();
        ctx.moveTo(0, h);
        
        // Desenha espectro logarítmico aproximado
        for (let x = 0; x < w; x += 3) {
           const f = getFreqFromX(x, w);
           // Mapeia freq para índice FFT linear
           const idx = Math.min(bufferLength - 1, Math.floor((f / 22050) * bufferLength));
           const val = dataArray[idx] || 0;
           const y = h - ((val / 255) * h * 0.9);
           ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; // Branco sutil
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.stroke();
      }

      // 4. Curva de EQ (Simulada visualmente)
      const { bands } = stateRef.current.settings;
      if (bands.length > 0) {
        ctx.beginPath();
        ctx.moveTo(0, yZero);
        
        // Simulação simples da curva somada
        for (let x = 0; x < w; x+=4) {
             const f = getFreqFromX(x, w);
             let totalDb = 0;
             
             // Somatório básico de influência das bandas (Bell curves aproximadas)
             for (const b of bands) {
                if (b.type === 'lowpass' && f > b.freq) totalDb -= 24 * Math.log2(f/b.freq); 
                else if (b.type === 'highpass' && f < b.freq) totalDb -= 24 * Math.log2(b.freq/f);
                else if (b.type === 'peaking' || !b.type) {
                    // Bell curve simplificada
                    const bandwidth = b.freq / (b.q || 1);
                    const diff = Math.abs(f - b.freq);
                    if (diff < bandwidth * 4) {
                        const factor = 1 - (diff / (bandwidth * 4));
                        totalDb += b.gain * Math.pow(factor, 2); // Falloff quadrático
                    }
                } else if (b.type === 'lowshelf' && f < b.freq) totalDb += b.gain;
                else if (b.type === 'highshelf' && f > b.freq) totalDb += b.gain;
             }
             
             const y = getYFromdB(totalDb, h);
             ctx.lineTo(x, y);
        }
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#e6c200"; // Dourado
        ctx.shadowColor = "#e6c200";
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Preenchimento abaixo da curva
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fillStyle = "rgba(230, 194, 0, 0.05)";
        ctx.fill();
      }

      // 5. Nós (Bolinhas)
      bands.forEach((b, i) => {
         const x = getXFromFreq(b.freq, w);
         const y = getYFromdB(b.gain, h);
         const isSelected = i === selectedBandIndex;
         const isHover = i === hoverBandIndex;

         // Haste
         if (isSelected || isHover) {
             ctx.beginPath();
             ctx.moveTo(x, y);
             ctx.lineTo(x, yZero);
             ctx.strokeStyle = "rgba(230, 194, 0, 0.3)";
             ctx.setLineDash([2, 2]);
             ctx.stroke();
             ctx.setLineDash([]);
         }

         // Círculo
         ctx.beginPath();
         ctx.arc(x, y, isSelected ? 8 : 6, 0, Math.PI * 2);
         ctx.fillStyle = isSelected ? "#e6c200" : (isHover ? "#fff" : "#555");
         ctx.shadowBlur = isSelected ? 15 : 0;
         ctx.shadowColor = "#e6c200";
         ctx.fill();
         
         // Número
         if (isSelected) {
            ctx.fillStyle = "#000";
            ctx.font = "bold 9px monospace";
            ctx.fillText((i+1).toString(), x, y + 3);
         }
      });

      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [trackId, selectedBandIndex, hoverBandIndex]);

  // --- Handlers de Interação ---
  const handleInteraction = (type: 'down' | 'move' | 'up', e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = canvas.width;
    const h = canvas.height;

    const { bands } = stateRef.current.settings;

    if (type === 'down') {
        const now = Date.now();
        // Double Tap: Criar Banda
        if (now - stateRef.current.lastTap < 300) {
            const freq = getFreqFromX(x, w);
            const gain = getdBFromY(y, h);
            const newBand: FilterBand = { freq, gain, q: 1, type: 'peaking' };
            const newSettings = { ...stateRef.current.settings, bands: [...bands, newBand] };
            onChange(newSettings);
            setSelectedBandIndex(newSettings.bands.length - 1);
            return;
        }
        stateRef.current.lastTap = now;

        // Hit Test
        let hitIdx = -1;
        let minDist = 30;
        bands.forEach((b, i) => {
            const bx = getXFromFreq(b.freq, w);
            const by = getYFromdB(b.gain, h);
            const dist = Math.sqrt((x-bx)**2 + (y-by)**2);
            if (dist < minDist) {
                minDist = dist;
                hitIdx = i;
            }
        });

        if (hitIdx !== -1) {
            stateRef.current.isDragging = true;
            stateRef.current.dragIndex = hitIdx;
            setSelectedBandIndex(hitIdx);
        } else {
            setSelectedBandIndex(-1);
        }

    } else if (type === 'move') {
        // Hover Logic
        let hitIdx = -1;
        let minDist = 30;
        bands.forEach((b, i) => {
            const bx = getXFromFreq(b.freq, w);
            const by = getYFromdB(b.gain, h);
            const dist = Math.sqrt((x-bx)**2 + (y-by)**2);
            if (dist < minDist) { minDist = dist; hitIdx = i; }
        });
        setHoverBandIndex(hitIdx);

        // Drag Logic
        if (stateRef.current.isDragging && stateRef.current.dragIndex !== -1) {
            const idx = stateRef.current.dragIndex;
            const freq = getFreqFromX(x, w);
            let gain = getdBFromY(y, h);
            
            // Filtros de corte (Pass) geralmente não usam ganho
            const bandType = bands[idx].type;
            if (bandType === 'lowpass' || bandType === 'highpass') gain = 0;

            const newBands = [...bands];
            newBands[idx] = { ...newBands[idx], freq, gain };
            
            onChange({ ...stateRef.current.settings, bands: newBands });

            // Tooltip
            setTooltip({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                text: `${Math.round(freq)} Hz | ${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB`
            });
        }
    } else if (type === 'up') {
        stateRef.current.isDragging = false;
        stateRef.current.dragIndex = -1;
        setTooltip(null);
    }
  };

  const selectedBand = selectedBandIndex !== -1 ? settings.bands[selectedBandIndex] : null;

  // CSS Styles
  const css = `
    .desert-slider { -webkit-appearance: none; width: 100%; height: 4px; background: #333; border-radius: 2px; outline: none; }
    .desert-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: #e6c200; border-radius: 50%; border: 2px solid #000; cursor: pointer; }
    .desert-select { background: #000; color: #e6c200; border: 1px solid #444; padding: 4px; font-size: 11px; outline: none; }
  `;

  return (
    <div className="flex flex-col w-full h-full bg-black text-[#f0f0f0] font-mono select-none border border-[#333]">
      <style>{css}</style>
      
      {/* Visualizer Area */}
      <div ref={containerRef} className="flex-1 relative cursor-crosshair overflow-hidden">
        <canvas 
            ref={canvasRef}
            className="block w-full h-full"
            onMouseDown={(e) => handleInteraction('down', e)}
            onMouseMove={(e) => handleInteraction('move', e)}
            onMouseUp={(e) => handleInteraction('up', e)}
            onMouseLeave={(e) => handleInteraction('up', e)}
        />
        {tooltip && (
            <div className="absolute bg-black border border-[#e6c200] text-[#e6c200] text-xs px-2 py-1 pointer-events-none transform -translate-y-full"
                 style={{ left: tooltip.x, top: tooltip.y - 10 }}>
                {tooltip.text}
            </div>
        )}
        {settings.bands.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[#444] text-xs pointer-events-none">
                DOUBLE CLICK TO ADD BAND
            </div>
        )}
      </div>

      {/* Controls Panel */}
      <div className="bg-[#111] p-3 border-t-2 border-[#e6c200] h-[160px] grid grid-cols-3 gap-4 shrink-0">
         
         {/* Coluna 1: Edição da Banda */}
         <div className="col-span-2 border-r border-[#333] pr-4 flex flex-col gap-2">
            {selectedBand ? (
                <>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[#e6c200] font-bold text-xs uppercase">Band {selectedBandIndex + 1}</span>
                        <button 
                           onClick={() => {
                               const newBands = settings.bands.filter((_, i) => i !== selectedBandIndex);
                               onChange({ ...settings, bands: newBands });
                               setSelectedBandIndex(-1);
                           }}
                           className="text-[#f55] text-[10px] hover:text-red-400 font-bold uppercase"
                        >
                            Delete
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                        {/* Type */}
                        <div className="flex flex-col">
                            <label className="text-[9px] text-[#666] uppercase">Type</label>
                            <select 
                                className="desert-select"
                                value={selectedBand.type}
                                onChange={(e) => {
                                    const newBands = [...settings.bands];
                                    newBands[selectedBandIndex].type = e.target.value as any;
                                    onChange({ ...settings, bands: newBands });
                                }}
                            >
                                <option value="peaking">Bell</option>
                                <option value="lowshelf">Low Shelf</option>
                                <option value="highshelf">High Shelf</option>
                                <option value="lowpass">Low Cut</option>
                                <option value="highpass">High Cut</option>
                                <option value="notch">Notch</option>
                            </select>
                        </div>
                        
                        {/* Freq */}
                        <div className="flex flex-col">
                             <label className="text-[9px] text-[#666] uppercase">Freq</label>
                             <div className="text-[#e6c200] text-xs border border-[#333] px-2 py-1 bg-black">
                                {Math.round(selectedBand.freq)} Hz
                             </div>
                        </div>

                        {/* Q */}
                        <div className="flex flex-col">
                            <label className="text-[9px] text-[#666] uppercase">Q (Width)</label>
                            <input 
                                type="range" className="desert-slider" min="0.1" max="10" step="0.1"
                                value={selectedBand.q}
                                onChange={(e) => {
                                    const newBands = [...settings.bands];
                                    newBands[selectedBandIndex].q = parseFloat(e.target.value);
                                    onChange({ ...settings, bands: newBands });
                                }}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-center h-full text-[#444] text-xs uppercase">
                    Select a node to edit
                </div>
            )}
         </div>

         {/* Coluna 2: Global Controls (Reverb & Preamp) */}
         <div className="flex flex-col gap-3 justify-center">
             
             {/* Preamp */}
             <div className="flex flex-col gap-1">
                 <div className="flex justify-between">
                    <label className="text-[9px] text-[#888] uppercase font-bold">Output Gain</label>
                    <span className="text-[10px] text-[#e6c200]">{settings.preamp > 0 ? '+' : ''}{settings.preamp}dB</span>
                 </div>
                 <input 
                    type="range" className="desert-slider" min="-12" max="12" step="0.1"
                    value={settings.preamp}
                    onChange={(e) => onChange({...settings, preamp: parseFloat(e.target.value)})}
                 />
             </div>

             {/* Reverb (O PEDIDO ESPECIAL) */}
             <div className="flex flex-col gap-1">
                 <div className="flex justify-between">
                    <label className="text-[9px] text-[#888] uppercase font-bold">Reverb</label>
                    <span className="text-[10px] text-[#e6c200]">{settings.reverb}%</span>
                 </div>
                 <input 
                    type="range" className="desert-slider" min="0" max="100" step="1"
                    value={settings.reverb}
                    onChange={(e) => onChange({...settings, reverb: parseInt(e.target.value)})}
                 />
             </div>

         </div>

      </div>
    </div>
  );
};