import React, { useState, useMemo, useEffect } from 'react';
import { Search, Sliders, Activity, Zap, Mic2, Waves, Speaker, Filter, X, Smartphone } from 'lucide-react';
import { EffectRegistry } from '../services/EffectRegistry';

interface EffectSelectorProps {
  onSelect: (effectId: string) => void;
  onClose: () => void;
}

type Category = 'ALL' | 'MOBILE POCKET' | 'DYNAMICS' | 'EQ & FILTER' | 'SPACE' | 'MODULATION' | 'CREATIVE' | 'PITCH';

interface EffectMeta {
  id: string;
  name: string;
  category: Category;
  description: string;
  icon: React.ElementType;
}

// Mapa de metadados para apresentação visual bonita
const EFFECT_LIBRARY: EffectMeta[] = [
  // Pocket Series (Mobile Optimized)
  { id: 'pocketComp', name: 'Pocket Comp', category: 'MOBILE POCKET', description: 'One-knob vocal compressor.', icon: Sliders },
  { id: 'pocketEQ', name: 'Pocket EQ', category: 'MOBILE POCKET', description: 'Simple 3-Band Equalizer.', icon: Activity },
  { id: 'pocketDrive', name: 'Pocket Drive', category: 'MOBILE POCKET', description: 'Instant warmth and saturation.', icon: Zap },
  { id: 'pocketSpace', name: 'Pocket Space', category: 'MOBILE POCKET', description: 'Easy vocal ambience reverb.', icon: Speaker },
  { id: 'pocketGate', name: 'Pocket Gate', category: 'MOBILE POCKET', description: 'Remove background noise.', icon: Filter },

  // Plugins do Registro Dinâmico
  { id: 'filterDesert', name: 'Filter Desert', category: 'EQ & FILTER', description: 'XY Pad Filter with Resonance control.', icon: Filter },
  { id: 'tremoloDesert', name: 'Tremolo Desert', category: 'MODULATION', description: 'LFO based volume modulation.', icon: Waves },
  
  // Efeitos Legacy
  { id: 'parametricEQ', name: 'Parametric EQ', category: 'EQ & FILTER', description: '5-Band precision equalizer.', icon: Activity },
  { id: 'compressor', name: 'Pro Compressor', category: 'DYNAMICS', description: 'Control dynamic range and punch.', icon: Sliders },
  { id: 'reverb', name: 'Room Reverb', category: 'SPACE', description: '3D algorithmic space simulator.', icon: Speaker },
  { id: 'delay', name: 'Digital Delay', category: 'SPACE', description: 'Echo and time-based repetition.', icon: Activity },
  { id: 'distortion', name: 'Distortion', category: 'CREATIVE', description: 'Harmonic saturation and drive.', icon: Zap },
  { id: 'autoPitch', name: 'Auto-Pitch Pro', category: 'PITCH', description: 'Real-time pitch correction.', icon: Mic2 },
];

export const EffectSelector: React.FC<EffectSelectorProps> = ({ onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('ALL');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setActiveCategory('MOBILE POCKET');
  }, []);

  const filteredEffects = useMemo(() => {
    return EFFECT_LIBRARY.filter(fx => {
      const matchesSearch = fx.name.toLowerCase().includes(search.toLowerCase()) || 
                            fx.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'ALL' || fx.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const categories: Category[] = ['ALL', 'MOBILE POCKET', 'DYNAMICS', 'EQ & FILTER', 'SPACE', 'MODULATION', 'CREATIVE', 'PITCH'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[800px] max-h-[80vh] bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#050505] shrink-0">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-desert-500/10 rounded flex items-center justify-center border border-desert-500/20">
                    <Zap className="w-4 h-4 text-desert-500" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">EFFECTS RACK</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Toolbar */}
        <div className="p-6 border-b border-zinc-800 bg-[#080808] flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Search effects..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-[#111] border border-zinc-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-desert-500 transition-colors"
                />
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3 py-1.5 rounded text-[10px] font-bold tracking-wider uppercase whitespace-nowrap transition-all border flex items-center gap-2 ${
                            activeCategory === cat 
                            ? 'bg-desert-500 text-black border-desert-500' 
                            : 'bg-[#111] text-zinc-500 border-zinc-800 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                    >
                        {cat === 'MOBILE POCKET' && <Smartphone className="w-3 h-3" />}
                        {cat}
                    </button>
                ))}
            </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#050505] custom-scrollbar">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredEffects.map(fx => (
                    <button
                        key={fx.id}
                        onClick={() => onSelect(fx.id)}
                        className="group flex flex-col items-start p-4 bg-[#0a0a0a] border border-zinc-800 rounded-xl hover:border-desert-500 hover:bg-[#0f0f0f] transition-all text-left relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-2 h-2 rounded-full bg-desert-500 shadow-[0_0_10px_rgba(230,194,0,0.5)]"></div>
                        </div>
                        
                        <div className="mb-4 w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center group-hover:bg-desert-500 group-hover:text-black transition-colors text-zinc-500 border border-zinc-800 group-hover:border-desert-500">
                            <fx.icon className="w-5 h-5" />
                        </div>
                        
                        <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white mb-1">{fx.name}</h3>
                        <span className={`text-[9px] font-bold uppercase tracking-widest mb-2 border px-1.5 rounded ${fx.category === 'MOBILE POCKET' ? 'text-[#e6c200] border-[#e6c200]/50 bg-[#e6c200]/10' : 'text-zinc-500 border-zinc-800'}`}>{fx.category}</span>
                        <p className="text-[11px] text-zinc-500 leading-snug group-hover:text-zinc-400">
                            {fx.description}
                        </p>
                    </button>
                ))}
                
                {filteredEffects.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-zinc-600">
                        <Search className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-widest">No effects found</p>
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
  );
};