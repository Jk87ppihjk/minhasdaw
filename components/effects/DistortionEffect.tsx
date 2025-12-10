import React from 'react';
import { Knob } from '../Knob';
import { Zap } from 'lucide-react';

interface DistortionEffectProps {
  value: number;
  onChange: (val: number) => void;
}

export const DistortionEffect: React.FC<DistortionEffectProps> = ({ value, onChange }) => {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full flex justify-center mb-2">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-900/20 to-zinc-900 rounded-full flex items-center justify-center border border-orange-900/50 shadow-[0_0_15px_rgba(124,45,18,0.3)]">
            <Zap className="w-8 h-8 text-orange-500" />
          </div>
      </div>
      
      <div className="flex items-center gap-8 bg-zinc-950/50 p-6 rounded-lg border border-zinc-800">
        <Knob 
            value={value} 
            min={0} 
            max={100} 
            onChange={onChange} 
            label="DRIVE"
        />
        <div className="flex flex-col items-center gap-1">
             <div className="text-[10px] text-zinc-600 uppercase font-bold tracking-wider">Output</div>
             <div className="h-12 w-2 bg-zinc-800 rounded-full overflow-hidden relative">
                 <div className="absolute bottom-0 left-0 right-0 bg-orange-500 transition-all duration-100" style={{ height: `${value}%` }} />
             </div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500 text-center max-w-[200px]">
        Adiciona harmônicos e saturação agressiva ao sinal de áudio.
      </p>
    </div>
  );
};