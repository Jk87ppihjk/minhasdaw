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
  
  // Estado local para interação
  const [selectedBandIndex, setSelectedBandIndex] = useState<number>(-1);
  const [hoverBandIndex, setHoverBandIndex] = useState<number>(-1);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Refs para o Loop de Animação
  const stateRef = useRef({
    settings,
    isDragging: false,
    dragIndex: -1,
    lastTap: 0
  });

  // Sincroniza refs com props
  useEffect(() => {
    stateRef.current.settings = settings;
    if (selectedBandIndex >= settings.bands.length) setSelectedBandIndex(-1);
  }, [settings, selectedBandIndex]);

  // --- Helpers Matemáticos (Escala Logarítmica) ---
  const minFreq = 20;
  const maxFreq = 20000;
  const minLog = Math.log(minFreq);
  const maxLog = Math.log(maxFreq);
  
  const getXFromFreq = (freq: number, w: number) => {
    const safeFreq = Math.max(minFreq, Math.min(maxFreq, freq));
    const valLog = Math.log(safeFreq);
    return ((valLog - minLog) / (maxLog - minLog)) * w;
  };

  const getFreqFromX = (x: number, w: number) => {
    const scale = x / w;
    return Math.exp(minLog + scale * (maxLog - minLog));
  };

  const getYFromdB = (db: number, h: number) => {
    // Range visual: +24dB a -24dB (Total 48dB)
    const range = 48;
    const center = 0; // meio da tela é 0dB
    // 0dB deve estar em h/2
    // +24dB em 0
    // -24dB em h
    const pixPerDb = h / range;
    return (h / 2) - (db * pixPerDb);
  };

  const getdBFromY = (y: number, h: number) => {
    const range = 48;
    const centerPix = h / 2;
    const pixPerDb = h / range;
    return (centerPix - y) / pixPerDb;
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

      // --- High DPI Scaling ---
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      
      // Define o tamanho interno do canvas para corresponder aos pixels físicos
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        // Escala o contexto para que as coordenadas lógicas funcionem
        ctx.scale(dpr, dpr);
      }
      // Garante que o estilo CSS ocupe o espaço correto
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const w = rect.width;
      const h = rect.height;

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
        ctx.moveTo(x + 0.5, 0); // +0.5 para linhas nítidas
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
        ctx.fillText(labels[i], x, h - 6);
      });

      // Linhas dB
      const dBs = [12, 0, -12];
      dBs.forEach(db => {
          const y = getYFromdB(db, h);
          ctx.beginPath();
          ctx.strokeStyle = db === 0 ? '#555' : '#222';
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(w, y + 0.5);
          ctx.stroke();
      });

      // 3. Espectro (RTA) - Suavizado
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        ctx.beginPath();
        ctx.moveTo(0, h);
        
        // Desenha com menos pontos para suavizar, interpolando
        for (let x = 0; x < w; x += 2) {
           const f = getFreqFromX(x, w);
           const idx = Math.min(bufferLength - 1, Math.floor((f / 22050) * bufferLength));
           const val = dataArray[idx] || 0;
           const y = h - ((val / 255) * h * 0.95);
           ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 4. Curva de EQ (Alta Resolução)
      const { bands } = stateRef.current.settings;
      
      const yZero = getYFromdB(0, h);
      
      ctx.beginPath();
      ctx.moveTo(0, yZero);
      
      // Renderiza pixel a pixel para eliminar triangulação
      for (let x = 0; x < w; x++) {
           const f = getFreqFromX(x, w);
           let totalDb = 0;
           
           for (const b of bands) {
              const fRatio = f / b.freq;
              const logRatio = Math.log2(fRatio);

              if (b.type === 'peaking') {
                  // Curva Gaussiana Logarítmica (Simula filtro Bell real)
                  // Q alto = banda estreita.
                  // A fórmula empírica para visualização:
                  const bandwidth = 1 / (b.q || 1); 
                  // Usamos uma gaussiana modificada para simular o Bell Filter
                  const exponent = -Math.pow(logRatio / bandwidth, 2);
                  totalDb += b.gain * Math.exp(exponent);
              } 
              else if (b.type === 'lowpass') {
                  // Slope de 12dB/octave suavizado
                  if (f > b.freq) {
                      // joelho suave
                      totalDb -= 12 * logRatio; 
                  }
              }
              else if (b.type === 'highpass') {
                  if (f < b.freq) {
                      totalDb -= 12 * Math.log2(b.freq / f);
                  }
              }
              else if (b.type === 'lowshelf') {
                  // Sigmoid para Shelf
                  // Transição suave em torno da freq
                  // Aproximação usando atan
                  const slope = Math.atan(-logRatio * 2) / (Math.PI / 2); // -1 a 1 invertido
                  // Queremos gain total abaixo, 0 acima.
                  // Em logRatio negativo (f < freq), slope é positivo -> gain.
                  const factor = (slope + 1) / 2; // 0 a 1
                  totalDb += b.gain * factor;
              }
              else if (b.type === 'highshelf') {
                  const slope = Math.atan(logRatio * 2) / (Math.PI / 2);
                  const factor = (slope + 1) / 2;
                  totalDb += b.gain * factor;
              }
              else if (b.type === 'notch') {
                   const bandwidth = 0.5 / (b.q || 1);
                   const exponent = -Math.pow(logRatio / bandwidth, 2);
                   // Notch remove tudo (-inf), visualmente limitamos a -24dB para o desenho
                   totalDb -= 48 * Math.exp(exponent);
              }
           }
           
           // Clamp visual para não sair da tela absurdamente
           if (totalDb > 30) totalDb = 30;
           if (totalDb < -30) totalDb = -30;

           const y = getYFromdB(totalDb, h);
           ctx.lineTo(x, y);
      }
      
      ctx.lineWidth = 2.5; // Linha um pouco mais grossa
      ctx.strokeStyle = "#e6c200";
      ctx.lineJoin = 'round'; // Juntas redondas para suavidade
      ctx.shadowColor = "rgba(230, 194, 0, 0.5)";
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Preenchimento
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fillStyle = "rgba(230, 194, 0, 0.05)";
      ctx.fill();

      // 5. Nós (Handles)
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
             ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
             ctx.lineWidth = 1;
             ctx.setLineDash([3, 3]);
             ctx.stroke();
             ctx.setLineDash([]);
         }

         // Círculo Externo (Glow)
         if (isSelected) {
             ctx.beginPath();
             ctx.arc(x, y, 12, 0, Math.PI * 2);
             ctx.fillStyle = "rgba(230, 194, 0, 0.2)";
             ctx.fill();
         }

         // Círculo Principal
         ctx.beginPath();
         ctx.arc(x, y, isSelected ? 6 : 5, 0, Math.PI * 2);
         ctx.fillStyle = isSelected ? "#e6c200" : (isHover ? "#fff" : "#888");
         ctx.strokeStyle = "#000";
         ctx.lineWidth = 2;
         ctx.fill();
         ctx.stroke();
         
         // Número
         if (isSelected || isHover) {
            ctx.fillStyle = isSelected ? "#e6c200" : "#aaa";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText((i+1).toString(), x, y - 12);
         }
      });

      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [trackId, selectedBandIndex, hoverBandIndex]);

  // --- Handlers de Interação ---
  const handleInteraction = (type: 'down' | 'move' | 'up', e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const { bands } = stateRef.current.settings;

    if (type === 'down') {
        const now = Date.now();
        // Double Tap: Criar Banda
        if (now - stateRef.current.lastTap < 300) {
            if (bands.length < 8) { // Limite de 8 bandas
                const freq = getFreqFromX(x, w);
                const gain = getdBFromY(y, h);
                const newBand: FilterBand = { freq, gain, q: 1, type: 'peaking' };
                const newSettings = { ...stateRef.current.settings, bands: [...bands, newBand] };
                onChange(newSettings);
                setSelectedBandIndex(newSettings.bands.length - 1);
            }
            return;
        }
        stateRef.current.lastTap = now;

        // Hit Test (Prioriza bandas selecionadas ou próximas)
        let hitIdx = -1;
        let minDist = 20; // Raio de clique em pixels
        
        // Check reverso para pegar as bandas "de cima" primeiro visualmente
        for (let i = bands.length - 1; i >= 0; i--) {
            const b = bands[i];
            const bx = getXFromFreq(b.freq, w);
            const by = getYFromdB(b.gain, h);
            const dist = Math.sqrt((x-bx)**2 + (y-by)**2);
            if (dist < minDist) {
                minDist = dist;
                hitIdx = i;
                break; // Encontrou, para
            }
        }

        if (hitIdx !== -1) {
            stateRef.current.isDragging = true;
            stateRef.current.dragIndex = hitIdx;
            setSelectedBandIndex(hitIdx);
        } else {
            // Clicou no vazio, deseleciona
            setSelectedBandIndex(-1);
        }

    } else if (type === 'move') {
        // Hover Logic
        let hitIdx = -1;
        let minDist = 20;
        for (let i = bands.length - 1; i >= 0; i--) {
            const b = bands[i];
            const bx = getXFromFreq(b.freq, w);
            const by = getYFromdB(b.gain, h);
            const dist = Math.sqrt((x-bx)**2 + (y-by)**2);
            if (dist < minDist) { minDist = dist; hitIdx = i; break; }
        }
        setHoverBandIndex(hitIdx);

        // Drag Logic
        if (stateRef.current.isDragging && stateRef.current.dragIndex !== -1) {
            const idx = stateRef.current.dragIndex;
            const freq = getFreqFromX(x, w);
            let gain = getdBFromY(y, h);
            
            // Filtros de corte (Pass) e Notch tem ganho fixo ou irrelevante para a posição Y em alguns UX,
            // mas aqui permitimos mover livremente, exceto se quisermos travar o Y.
            // Opcional: Travar Y em 0 para LowPass/HighPass se desejar comportamento padrão
            // if (bands[idx].type === 'lowpass' || bands[idx].type === 'highpass') gain = 0; 

            // Clamp Frequency
            const safeFreq = Math.max(20, Math.min(20000, freq));
            // Clamp Gain
            const safeGain = Math.max(-24, Math.min(24, gain));

            const newBands = [...bands];
            newBands[idx] = { ...newBands[idx], freq: safeFreq, gain: safeGain };
            
            onChange({ ...stateRef.current.settings, bands: newBands });

            // Tooltip
            setTooltip({
                x: x,
                y: y,
                text: `${Math.round(safeFreq)} Hz | ${safeGain > 0 ? '+' : ''}${safeGain.toFixed(1)} dB`
            });
        }
    } else if (type === 'up') {
        stateRef.current.isDragging = false;
        stateRef.current.dragIndex = -1;
        setTooltip(null);
    }
  };

  const selectedBand = selectedBandIndex !== -1 ? settings.bands[selectedBandIndex] : null;

  return (
    <div className="flex flex-col w-full h-full bg-black text-[#f0f0f0] font-sans select-none border border-[#333]">
      <style>{`
        .desert-slider { -webkit-appearance: none; width: 100%; height: 4px; background: #333; border-radius: 2px; outline: none; }
        .desert-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: #e6c200; border-radius: 50%; border: 2px solid #000; cursor: pointer; }
        .desert-select { background: #000; color: #e6c200; border: 1px solid #444; padding: 4px; font-size: 11px; outline: none; }
        .desert-select option { background: #111; color: #fff; }
      `}</style>
      
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
            <div className="absolute bg-black/90 border border-[#e6c200] text-[#e6c200] text-[10px] font-mono px-2 py-1 pointer-events-none transform -translate-y-full -translate-x-1/2 rounded shadow-lg z-50 whitespace-nowrap"
                 style={{ left: tooltip.x, top: tooltip.y - 15 }}>
                {tooltip.text}
            </div>
        )}
        {settings.bands.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[#444] text-xs pointer-events-none uppercase tracking-widest">
                Double click to add band
            </div>
        )}
      </div>

      {/* Controls Panel */}
      <div className="bg-[#0a0a0a] p-3 border-t border-[#333] h-[140px] grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0 relative z-10">
         
         {/* Coluna 1: Edição da Banda */}
         <div className="col-span-2 flex flex-col gap-2">
            {selectedBand ? (
                <>
                    <div className="flex justify-between items-center border-b border-[#222] pb-1">
                        <span className="text-[#e6c200] font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 bg-[#e6c200] rounded-full"></div>
                            Band {selectedBandIndex + 1}
                        </span>
                        <button 
                           onClick={() => {
                               const newBands = settings.bands.filter((_, i) => i !== selectedBandIndex);
                               onChange({ ...settings, bands: newBands });
                               setSelectedBandIndex(-1);
                           }}
                           className="text-[#f55] text-[9px] hover:text-red-400 font-bold uppercase tracking-widest hover:underline"
                        >
                            DELETE
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4 items-end">
                        {/* Type */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-[#666] uppercase font-bold">TYPE</label>
                            <select 
                                className="desert-select w-full"
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
                        
                        {/* Freq Display (Read only) */}
                        <div className="flex flex-col gap-1">
                             <label className="text-[9px] text-[#666] uppercase font-bold">FREQ</label>
                             <div className="text-[#e6c200] text-xs font-mono border border-[#333] px-2 py-1 bg-black rounded">
                                {Math.round(selectedBand.freq)} Hz
                             </div>
                        </div>

                        {/* Q */}
                        <div className="flex flex-col gap-1 col-span-2">
                            <div className="flex justify-between">
                                <label className="text-[9px] text-[#666] uppercase font-bold">Q (WIDTH)</label>
                                <span className="text-[9px] text-[#888]">{selectedBand.q.toFixed(2)}</span>
                            </div>
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
                <div className="flex items-center justify-center h-full text-[#333] text-[10px] uppercase font-bold tracking-widest border border-[#222] border-dashed rounded">
                    Select a node to edit parameters
                </div>
            )}
         </div>

         {/* Coluna 2: Global Controls */}
         <div className="border-l border-[#222] pl-6 flex flex-col justify-center gap-4">
             
             {/* Preamp */}
             <div className="flex flex-col gap-1">
                 <div className="flex justify-between items-center">
                    <label className="text-[9px] text-[#666] uppercase font-bold tracking-wider">OUTPUT GAIN</label>
                    <span className="text-[9px] text-[#e6c200] font-mono">{settings.preamp > 0 ? '+' : ''}{settings.preamp}dB</span>
                 </div>
                 <input 
                    type="range" className="desert-slider" min="-12" max="12" step="0.1"
                    value={settings.preamp}
                    onChange={(e) => onChange({...settings, preamp: parseFloat(e.target.value)})}
                 />
             </div>

             {/* Reverb */}
             <div className="flex flex-col gap-1">
                 <div className="flex justify-between items-center">
                    <label className="text-[9px] text-[#666] uppercase font-bold tracking-wider">REVERB</label>
                    <span className="text-[9px] text-[#e6c200] font-mono">{settings.reverb}%</span>
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