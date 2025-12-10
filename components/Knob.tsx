import React, { useState, useRef, useEffect } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  label?: string;
}

export const Knob: React.FC<KnobProps> = ({ value, min, max, onChange, label }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef<number>(0);
  const startVal = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = value;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dy = startY.current - e.clientY;
      const range = max - min;
      const sensitivity = 0.005; // value per pixel
      let newVal = startVal.current + (dy * range * sensitivity);
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, max, min, onChange]);

  // Calculate rotation: min -> -135deg, max -> 135deg
  const percentage = (value - min) / (max - min);
  const degrees = -135 + (percentage * 270);

  return (
    <div className="flex flex-col items-center gap-1 group">
      <div 
        className="w-10 h-10 rounded-full border-2 border-zinc-700 bg-zinc-900 relative cursor-ns-resize hover:border-zinc-500 transition-colors"
        onMouseDown={handleMouseDown}
      >
        <div 
          className="w-1 h-3 bg-white absolute top-1 left-1/2 -translate-x-1/2 origin-bottom rounded-full"
          style={{ transform: `translateX(-50%) rotate(${degrees}deg)`, transformOrigin: '50% 16px' }}
        />
      </div>
      {label && <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>}
    </div>
  );
};