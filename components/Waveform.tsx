
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

  // Mapeamento de cores estrito para o tema Monochrome Pro
  const getThemeColors = (cls: string) => {
    if (cls.includes('red')) return { fill: 'rgba(239, 68, 68, 0.9)', stroke: 'rgba(239, 68, 68, 1)' };
    if (cls.includes('bg-[var(--waveform-wave)]') || cls.includes('zinc-200')) return { fill: 'rgba(228, 228, 231, 0.9)', stroke: '#ffffff' }; // Selected
    return { fill: 'rgba(113, 113, 122, 0.8)', stroke: 'rgba(161, 161, 170, 0.9)' }; // Unselected (Zinc 500/400)
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true }); // Otimização
    if (!ctx) return;

    const { fill, stroke } = getThemeColors(color);

    // --- High DPI Scaling ---
    const dpr = window.devicePixelRatio || 1;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        // Não usamos scale() aqui para manter controle pixel-perfect manual nos loops
    }
    
    // Limpar
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const drawWidth = canvas.width;
    const drawHeight = canvas.height;
    const middle = drawHeight / 2;

    // --- Linha Central (Zero Crossing) ---
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.moveTo(0, middle);
    ctx.lineTo(drawWidth, middle);
    ctx.stroke();

    // =========================================================
    // MODO LIVE (GRAVAÇÃO)
    // =========================================================
    if (dataPoints && dataPoints.length > 0) {
        const totalPoints = dataPoints.length;
        // Estratégia: Desenhar waveform contínua da esquerda para a direita
        // Assumimos que o container cresce ou que os dados preenchem o espaço
        
        ctx.beginPath();
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;

        // Passo horizontal por ponto de dado
        // Se houver poucos pontos, eles ficam largos. Se houver muitos, ficam finos.
        // Limitamos a largura máxima para não parecer "blocos"
        const barWidthRaw = drawWidth / totalPoints;
        const step = barWidthRaw; 

        ctx.moveTo(0, middle);

        // Desenhar silhueta superior
        for (let i = 0; i < totalPoints; i++) {
            const val = dataPoints[i]; // 0 a 1
            const x = i * step;
            // Amplificação visual para gravação ficar clara
            const h = Math.max(1, val * (drawHeight * 0.5) * 1.5); 
            
            // Suavização simples entre pontos para aspecto fluido
            ctx.lineTo(x, middle - h);
        }
        
        // Finalizar na direita centro
        ctx.lineTo(drawWidth, middle);

        // Desenhar silhueta inferior (espelho)
        for (let i = totalPoints - 1; i >= 0; i--) {
            const val = dataPoints[i];
            const x = i * step;
            const h = Math.max(1, val * (drawHeight * 0.5) * 1.5);
            ctx.lineTo(x, middle + h);
        }

        ctx.closePath();
        ctx.fill();
        
        // Opcional: Contorno brilhante para dar nitidez
        // ctx.stroke(); 
        return;
    }

    // =========================================================
    // MODO ESTÁTICO (BUFFER / EDIÇÃO / CORTE)
    // =========================================================
    if (!buffer) return;

    const rawData = buffer.getChannelData(0); // Mono view is standard for mixing timeline
    const sampleRate = buffer.sampleRate;
    
    // Cálculo preciso da janela de áudio baseada no Clip
    // start (offset do clip em segundos)
    // duration (duração visível do clip em segundos)
    const startSample = Math.floor((start || 0) * sampleRate);
    const endSample = Math.floor(((start || 0) + (duration || buffer.duration)) * sampleRate);
    const totalSamples = endSample - startSample;

    if (totalSamples <= 0) return;

    // Resolução: Quantos samples representam 1 pixel físico horizontal?
    // Usamos Math.ceil para garantir que não perderemos picos em zoom out
    const samplesPerPixel = Math.max(1, Math.floor(totalSamples / drawWidth));
    
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, middle);

    // Passo 1: Desenhar o envelope superior (Picos Positivos)
    for (let x = 0; x < drawWidth; x++) {
        // Calcular índice no buffer original
        const pixelStartSample = startSample + (x * samplesPerPixel);
        
        if (pixelStartSample >= rawData.length) break;

        // Encontrar o Min/Max (Peak) neste bloco de samples
        let min = 0;
        let max = 0;
        
        // Otimização: Se o bloco for muito grande, pular samples (downsampling simples) 
        // para manter performance, mas mantendo precisão visual suficiente.
        const step = Math.max(1, Math.floor(samplesPerPixel / 10)); 

        for (let j = 0; j < samplesPerPixel; j += step) {
            const idx = pixelStartSample + j;
            if (idx >= rawData.length) break;
            const val = rawData[idx];
            if (val > max) max = val;
            if (val < min) min = val;
        }

        // Desenhar linha para o Pico Máximo (Top)
        // Usamos * 0.9 para deixar margem de respiro (headroom visual)
        const yTop = middle - (max * middle * 0.95);
        ctx.lineTo(x, yTop);
    }

    // Fechar lado direito
    ctx.lineTo(drawWidth, middle);

    // Passo 2: Desenhar o envelope inferior (Picos Negativos - Espelho ou Real)
    // Voltando da direita para a esquerda para fechar o path
    for (let x = drawWidth - 1; x >= 0; x--) {
        const pixelStartSample = startSample + (x * samplesPerPixel);
        
        if (pixelStartSample >= rawData.length) {
            ctx.lineTo(x, middle);
            continue;
        }

        let min = 0;
        let max = 0;
        const step = Math.max(1, Math.floor(samplesPerPixel / 10));

        for (let j = 0; j < samplesPerPixel; j += step) {
            const idx = pixelStartSample + j;
            if (idx >= rawData.length) break;
            const val = rawData[idx];
            if (val > max) max = val;
            if (val < min) min = val;
        }

        // Desenhar linha para o Pico Mínimo (Bottom)
        // Math.abs(min) se quisermos espelhar perfeitamente, mas usar 'min' real é mais preciso
        // Se min for negativo, - (negativo) vira positivo, descendo no canvas.
        const yBottom = middle - (min * middle * 0.95);
        ctx.lineTo(x, yBottom);
    }

    ctx.closePath();
    ctx.fill();
    
    // Opcional: Linha de contorno sutil para definição extra em clips selecionados
    if (color.includes('waveform-wave')) {
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
  };

  useEffect(() => {
    // Debounce leve ou requestAnimationFrame direto para evitar travar na gravação
    let animationFrameId: number;
    const render = () => {
        draw();
    };
    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [buffer, dataPoints, color, start, duration]);

  // Observer para redimensionamento responsivo
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(draw));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (!buffer && (!dataPoints || dataPoints.length === 0)) {
    return (
      <div className={`w-full h-full flex items-center justify-center`}>
        <div className="w-full h-[1px] bg-zinc-800/50"></div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="block w-full h-full" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
};
