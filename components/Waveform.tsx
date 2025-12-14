import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  buffer?: AudioBuffer;
  dataPoints?: number[]; // Para visualização em tempo real (liveData)
  color: string;
  start?: number; 
  duration?: number; 
}

export const Waveform: React.FC<WaveformProps> = ({ buffer, dataPoints, color, start = 0, duration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to map Tailwind classes to Canvas hex colors
  const getColor = (cls: string) => {
    if (cls.includes('zinc-200')) return '#e4e4e7';
    if (cls.includes('zinc-900')) return '#18181b';
    if (cls.includes('red')) return '#ef4444';
    if (cls.includes('blue')) return '#3b82f6';
    return '#e4e4e7'; 
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    
    // Resize se necessário
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getColor(color);

    // --- MODO LIVE (GRAVAÇÃO) ---
    if (dataPoints && dataPoints.length > 0) {
        const barWidth = 2;
        const gap = 1;
        const totalBars = dataPoints.length;
        
        // Se houver muitos pontos, desenha apenas os últimos que cabem, ou comprime
        // Para uma visualização de "crescimento", assumimos que o container cresce com o clipe
        // ou que o dataPoints mapeia para a largura total atual.
        
        // Estratégia: Mapear dataPoints inteiros para a largura total
        const step = width / totalBars;
        
        // Melhor visual para live: Bar Chart simples
        ctx.beginPath();
        for (let i = 0; i < totalBars; i++) {
            const val = dataPoints[i]; // 0 a 1
            let h = val * height * 0.9;
            if (h < 2) h = 2;
            
            const x = i * step;
            const y = (height - h) / 2;
            
            // Desenha barra simples para performance
            ctx.rect(x, y, Math.max(1, step - 0.5), h);
        }
        ctx.fill();
        return;
    }

    // --- MODO ESTÁTICO (BUFFER COMPLETO) ---
    if (!buffer) return;

    const rawData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    const startSample = Math.floor(start * sampleRate);
    const endSample = duration 
        ? Math.min(startSample + Math.floor(duration * sampleRate), rawData.length)
        : rawData.length;
    
    const totalSamplesToRender = endSample - startSample;
    if (totalSamplesToRender <= 0) return;

    const barWidth = 2;
    const gap = 1;
    const step = barWidth + gap;
    const totalBars = Math.floor(width / step);
    
    if (totalBars === 0) return;

    const samplesPerBar = Math.floor(totalSamplesToRender / totalBars);
    const sampleStep = Math.max(1, Math.floor(samplesPerBar / 50)); 

    ctx.beginPath();
    
    for (let i = 0; i < totalBars; i++) {
        const currentBufferIndex = startSample + (i * samplesPerBar);
        let max = 0;
        
        for (let j = 0; j < samplesPerBar; j += sampleStep) {
            if (currentBufferIndex + j >= rawData.length) break;
            const val = Math.abs(rawData[currentBufferIndex + j]);
            if (val > max) max = val;
        }

        let h = max * height * 0.9;
        if (h < 2) h = 2; 
        
        const x = i * step;
        const y = (height - h) / 2; 
        const w = barWidth;
        const r = w / 2;
        
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
    }
    
    ctx.fill();
  };

  useEffect(() => {
    draw();
  }, [buffer, dataPoints, color, start, duration]);

  // Observer para redimensionamento
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(draw));
    observer.observe(container);
    return () => observer.disconnect();
  }, [buffer, dataPoints]);

  if (!buffer && (!dataPoints || dataPoints.length === 0)) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-[10px] tracking-widest ${color.replace('bg-', 'text-')} opacity-50`}>
        {/* Empty state or Loading */}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
};