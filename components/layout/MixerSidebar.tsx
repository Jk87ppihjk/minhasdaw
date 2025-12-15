
import React from 'react';
import { Settings2, PanelRightClose, Disc, Plus, Trash2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Track } from '../../types';
import { Knob } from '../Knob';
import { EffectRegistry } from '../../services/EffectRegistry';
import { audioEngine } from '../../services/AudioEngine';

interface MixerSidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isMobile: boolean;
  selectedTrack: Track | undefined;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  updateEffects: (id: string, updates: Partial<Track['effects']>) => void;
  
  // Effects Interaction
  setEffectSelectorTrackId: (id: string | null) => void;
  setShowEffectSelector: (v: boolean) => void;
  setOpenedEffect: (val: { trackId: string, effectId: string } | null) => void;
  setTracks: React.Dispatch<React.SetStateAction<Track[]>>; 
  
  // AI Mixing
  onOpenAiAssistant: () => void;
}

export const MixerSidebar: React.FC<MixerSidebarProps> = ({
  isOpen, setIsOpen, isMobile, selectedTrack, updateTrack, updateEffects,
  setEffectSelectorTrackId, setShowEffectSelector, setOpenedEffect, setTracks, onOpenAiAssistant
}) => {
  
  const handleEditName = () => {
      if(!selectedTrack) return;
      const newName = prompt("Nome da Faixa:", selectedTrack.name);
      if (newName) updateTrack(selectedTrack.id, { name: newName });
  };

  return (
    <div 
        className={`
            fixed inset-y-0 right-0 z-30 w-full md:w-80 bg-[var(--bg-panel)] border-l border-[var(--border-color)] transform transition-all duration-300 ease-in-out shadow-2xl flex flex-col
            lg:relative lg:shadow-none
            ${isOpen ? 'translate-x-0 lg:w-80' : 'translate-x-full lg:w-0 lg:overflow-hidden lg:border-l-0 lg:translate-x-0'}
        `}
        style={{ top: isMobile ? '4rem' : '0', height: isMobile ? 'calc(100% - 4rem)' : '100%' }}
    >
            <div className="h-10 border-b border-[var(--border-color)] flex items-center justify-between px-4 font-bold text-[10px] tracking-widest text-[var(--text-muted)] bg-[var(--bg-panel)] uppercase shrink-0">
                <span className="flex items-center gap-2"><Settings2 className="w-3 h-3" /> Channel Strip</span>
                <button onClick={() => setIsOpen(false)} className="lg:hidden hover:text-[var(--text-main)]"><PanelRightClose className="w-4 h-4" /></button>
            </div>
            
            {selectedTrack ? (
                <div className="flex-1 p-6 flex flex-col min-h-0 gap-8 overflow-y-auto custom-scrollbar pb-20 w-80 md:w-full">
                    <div className="text-center pb-6 border-b border-[var(--border-color)]">
                        <h2 className="text-2xl font-black text-[var(--text-main)] mb-1 truncate cursor-pointer hover:text-[var(--accent)] transition-colors tracking-tight" onClick={handleEditName}>{selectedTrack.name}</h2>
                        <span className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest px-2 py-1 bg-[var(--accent)]/10 rounded border border-[var(--accent)]/20">{selectedTrack.type} TRACK</span>
                    </div>
                    
                    <div className="space-y-8">
                        <div className="flex justify-center">
                            <Knob label="PAN" min={-1} max={1} value={selectedTrack.pan} onChange={(val) => updateTrack(selectedTrack.id, { pan: val })} />
                        </div>
                        <div className="space-y-2 bg-[var(--bg-element)] p-4 rounded-lg border border-[var(--border-color)]">
                            <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold tracking-wider"><span>FADER</span><span>{(selectedTrack.volume * 100).toFixed(0)}%</span></div>
                            <input type="range" min="0" max="1" step="0.01" value={selectedTrack.volume} onChange={(e) => updateTrack(selectedTrack.id, { volume: parseFloat(e.target.value) })} className="w-full accent-[var(--text-main)] h-1 bg-[var(--bg-main)] rounded-lg appearance-none cursor-pointer" />
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1"><Disc className="w-3 h-3" /> INSERTS CHAIN</h3>
                            <div className="flex gap-2">
                                <button 
                                    onClick={onOpenAiAssistant}
                                    className="text-[10px] bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold px-2 py-1 rounded-full flex gap-1 items-center hover:scale-105 transition-transform shadow-lg shadow-purple-900/50 border border-white/20"
                                    title="AI Mixing Assistant"
                                >
                                    <Sparkles className="w-3 h-3" /> AI
                                </button>
                                <button 
                                    onClick={() => { setEffectSelectorTrackId(selectedTrack.id); setShowEffectSelector(true); }}
                                    className="text-[10px] bg-[var(--accent)] text-black font-bold px-3 py-1 rounded-full flex gap-1 items-center hover:bg-white transition-colors shadow-lg shadow-[var(--accent)]/20"
                                >
                                    <Plus className="w-3 h-3" /> FX
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 min-h-[100px]">
                            {selectedTrack.activeEffects.length === 0 && (
                                <div className="text-center py-8 border-2 border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest">
                                    Empty Chain
                                </div>
                            )}
                            {selectedTrack.activeEffects.map((effectId, index) => (
                                <div key={`${effectId}-${index}`} className="group bg-[var(--bg-element)] border border-[var(--border-color)] rounded-md p-2 pl-3 flex items-center justify-between hover:border-[var(--text-muted)] transition-all shadow-sm relative overflow-hidden">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent)]"></div>
                                    <span className="text-xs font-bold text-[var(--text-main)] uppercase cursor-pointer flex-1 truncate hover:text-[var(--accent)]" onClick={() => setOpenedEffect({ trackId: selectedTrack.id, effectId })}>
                                        {EffectRegistry.get(effectId)?.name || effectId}
                                    </span>
                                    <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setOpenedEffect({ trackId: selectedTrack.id, effectId })} className="p-1 hover:bg-[var(--bg-main)] rounded"><SlidersHorizontal className="w-3 h-3 text-[var(--text-muted)]" /></button>
                                        <button onClick={() => { 
                                            setTracks(p => p.map(t => {
                                                if (t.id === selectedTrack.id) {
                                                    const updatedTrack = {...t, activeEffects: t.activeEffects.filter((_, i) => i !== index)};
                                                    audioEngine.rebuildTrackEffects(updatedTrack);
                                                    return updatedTrack;
                                                }
                                                return t;
                                            }));
                                        }} className="p-1 hover:bg-red-900/30 rounded"><Trash2 className="w-3 h-3 text-[var(--text-muted)] hover:text-red-500" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] w-80 md:w-full">
                    <div className="w-16 h-16 rounded-full bg-[var(--bg-element)] flex items-center justify-center mb-4">
                        <Settings2 className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="text-xs uppercase font-bold tracking-widest">No Track Selected</p>
                </div>
            )}
    </div>
  );
};
