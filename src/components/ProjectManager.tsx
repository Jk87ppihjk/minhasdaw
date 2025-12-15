import React, { useState } from 'react';
import { Save, X, ArrowRight } from 'lucide-react';

interface ProjectManagerProps {
  isOpen: boolean;
  mode: 'save' | 'open'; // Mantido para compatibilidade, mas só usamos save
  onClose: () => void;
  rootHandle: any; // ignored
  onSelectRoot: any; // ignored
  onConfirmAction: (projectName: string) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  isOpen, onClose, onConfirmAction 
}) => {
  const [newProjectName, setNewProjectName] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (newProjectName.trim()) {
        onConfirmAction(newProjectName);
    } else {
        alert("Por favor, dê um nome ao seu projeto.");
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="h-16 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded flex items-center justify-center border bg-zinc-800 border-zinc-700">
                    <Save className="w-4 h-4 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white tracking-tight uppercase">Salvar na Nuvem</h2>
                </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 bg-[#080808]">
            <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome do Projeto</label>
                <input 
                    type="text" 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Meu Novo Hit"
                    className="w-full bg-[#111] border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
                    autoFocus
                />
                <p className="text-[10px] text-zinc-500">Seu projeto será compactado (ZIP) e salvo nos nossos servidores.</p>
            </div>

            <button 
                onClick={handleConfirm}
                disabled={!newProjectName.trim()}
                className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                    !newProjectName.trim()
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-lg shadow-yellow-500/20'
                }`}
            >
                Salvar Agora
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
      </div>
    </div>
  );
};