import React from 'react';
import { Knob } from '../Knob';
import { Activity } from 'lucide-react';

interface FilterEffectProps {
  value: number; // Frequency
  onChange: (val: number) => void;
}

export const FilterEffect: React.FC<FilterEffectProps> = ({ value, onChange }) => {
  return (
    <div className="flex flex-col items-center gap-6">
       <div className="w-full flex justify-center mb-2">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-900/20 to-zinc-900 rounded-full flex items-center justify-center border border-emerald-900/50 shadow-[0_0_15px_rgba(6,78,59,0.3)]">
            <Activity className="w-8 h-8 text-emerald-500" />
          </div>
      </div>

      <div className="flex items-center justify-center gap-8 bg-zinc-950/50 p-6 rounded-lg border border-zinc-800 w-full">
        <Knob 
            value={value} 
            min={0} 
            max={1000} 
            onChange={onChange} 
            label="FREQ (Hz)"
        />
         <div className="h-12 w-16 bg-zinc-900 border border-zinc-800 rounded flex items-end px-1 pb-1 gap-1">
             {/* Fake Spectrum Visualizer */}
             <div className="w-2 bg-emerald-900/40 h-[20%] rounded-t-sm"></div>
             <div className="w-2 bg-emerald-900/60 h-[40%] rounded-t-sm"></div>
             <div className="w-2 bg-emerald-800/80 h-[80%] rounded-t-sm"></div>
             <div className="w-2 bg-emerald-500 h-[60%] rounded-t-sm"></div>
             <div className="w-2 bg-emerald-500 h-[30%] rounded-t-sm"></div>
         </div>
      </div>
      <p className="text-[10px] text-zinc-500 text-center max-w-[200px]">
        Filtro Passa-Alta (High Pass) para remover frequências graves indesejadas.
      </p>
    </div>
  );
};