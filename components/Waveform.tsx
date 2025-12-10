import React, { useEffect, useRef } from 'react';

interface WaveformProps {
  buffer?: AudioBuffer;
  color: string;
  start?: number; // Start time in seconds within the buffer
  duration?: number; // Duration to render in seconds
}

export const Waveform: React.FC<WaveformProps> = ({ buffer, color, start = 0, duration }) => {
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
    if (!canvas || !container || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container dimensions
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Handle High DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    ctx.scale(dpr, dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getColor(color);

    const rawData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Determine the range of samples to draw
    const startSample = Math.floor(start * sampleRate);
    // If duration is provided, use it. Otherwise use the remaining buffer length.
    const endSample = duration 
        ? Math.min(startSample + Math.floor(duration * sampleRate), rawData.length)
        : rawData.length;
    
    const totalSamplesToRender = endSample - startSample;
    
    if (totalSamplesToRender <= 0) return;

    // Config for drawing
    const barWidth = 2; // Thin bars for precision
    const gap = 1;      // Small gap
    const step = barWidth + gap;
    const totalBars = Math.floor(width / step);
    
    if (totalBars === 0) return;

    // How many samples from the source buffer represent one bar on the screen
    const samplesPerBar = Math.floor(totalSamplesToRender / totalBars);
    
    // Optimization: Don't check every sample if zoomed out significantly
    const sampleStep = Math.max(1, Math.floor(samplesPerBar / 50)); 

    ctx.beginPath();
    
    for (let i = 0; i < totalBars; i++) {
        // Calculate the actual index in the raw buffer
        const currentBufferIndex = startSample + (i * samplesPerBar);
        let max = 0;
        
        // Peak detection
        for (let j = 0; j < samplesPerBar; j += sampleStep) {
            if (currentBufferIndex + j >= rawData.length) break;
            
            const val = Math.abs(rawData[currentBufferIndex + j]);
            if (val > max) max = val;
        }

        // Calculate bar height relative to container height
        let h = max * height * 0.9;
        if (h < 2) h = 2; // Minimum height
        
        const x = i * step;
        const y = (height - h) / 2; // Center vertically
        
        const w = barWidth;
        const r = w / 2; // Fully rounded tips
        
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

  // Redraw when data changes
  useEffect(() => {
    draw();
  }, [buffer, color, start, duration]);

  // Redraw when container size changes (e.g. zooming)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
       requestAnimationFrame(draw);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [buffer, color, start, duration]);

  if (!buffer) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-[10px] tracking-widest ${color.replace('bg-', 'text-')} opacity-50`}>
        LOADING
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
};