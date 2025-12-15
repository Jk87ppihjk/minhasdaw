
import React, { useEffect, useState } from 'react';
import { Folder, HardDrive, Plus, X, ArrowRight, Save, FolderOpen, Loader2 } from 'lucide-react';

interface ProjectManagerProps {
  isOpen: boolean;
  mode: 'save' | 'open';
  onClose: () => void;
  rootHandle: FileSystemDirectoryHandle | null;
  onSelectRoot: () => void;
  onConfirmAction: (projectName: string) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
  isOpen, mode, onClose, rootHandle, onSelectRoot, onConfirmAction 
}) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Scan folder when root handle changes or modal opens
  useEffect(() => {
    const scanDirectory = async () => {
      if (!rootHandle || !isOpen) return;
      
      setIsLoading(true);
      const projList: string[] = [];
      try {
        // Iterate through the directory handle
        // @ts-ignore - File System Access API types
        for await (const entry of rootHandle.values()) {
          if (entry.kind === 'directory') {
            projList.push(entry.name);
          }
        }
        setProjects(projList.sort());
      } catch (err) {
        console.error("Error scanning directory:", err);
      } finally {
        setIsLoading(false);
      }
    };

    scanDirectory();
  }, [rootHandle, isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (mode === 'save') {
        if (newProjectName.trim()) onConfirmAction(newProjectName);
        else if (selectedProject) {
            const confirmOverwrite = window.confirm(`Sobrescrever o projeto "${selectedProject}"?`);
            if (confirmOverwrite) onConfirmAction(selectedProject);
        }
    } else {
        if (selectedProject) onConfirmAction(selectedProject);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[600px] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="h-16 border-b border-zinc-800 bg-[#050505] flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center border ${mode === 'save' ? 'bg-zinc-800 border-zinc-700' : 'bg-white text-black border-white'}`}>
                    {mode === 'save' ? <Save className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white tracking-tight uppercase">{mode === 'save' ? 'Salvar Projeto' : 'Abrir Projeto'}</h2>
                    <p className="text-[10px] text-zinc-500 font-mono">
                        {rootHandle ? rootHandle.name : 'Nenhuma pasta selecionada'}
                    </p>
                </div>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
            
            {/* Left: Project List */}
            <div className="flex-1 border-r border-zinc-800 flex flex-col bg-[#080808]">
                {!rootHandle ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                        <HardDrive className="w-12 h-12 text-zinc-600 mb-2" />
                        <h3 className="text-zinc-300 font-bold">Pasta de Projetos não definida</h3>
                        <p className="text-zinc-500 text-xs max-w-xs">
                            Por segurança, o navegador precisa que você selecione a pasta onde seus projetos serão salvos/lidos.
                        </p>
                        <button 
                            onClick={onSelectRoot}
                            className="bg-white text-black px-6 py-3 rounded font-bold text-xs uppercase tracking-widest hover:bg-gray-200 transition-colors flex items-center gap-2"
                        >
                            Selecionar Pasta
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="p-3 border-b border-zinc-800 bg-[#0a0a0a] flex justify-between items-center">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Projetos Locais</span>
                            <button onClick={onSelectRoot} className="text-[10px] text-zinc-500 hover:text-white underline">Alterar Pasta</button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {isLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
                            ) : projects.length === 0 ? (
                                <div className="text-center p-8 text-zinc-600 text-xs italic">Nenhum projeto encontrado nesta pasta.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-1">
                                    {projects.map(proj => (
                                        <button
                                            key={proj}
                                            onClick={() => { setSelectedProject(proj); if(mode === 'save') setNewProjectName(proj); }}
                                            onDoubleClick={() => { setSelectedProject(proj); handleConfirm(); }}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all group ${selectedProject === proj ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'}`}
                                        >
                                            <Folder className={`w-4 h-4 ${selectedProject === proj ? 'fill-white text-white' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
                                            <span className="text-sm font-medium truncate">{proj}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Right: Action Panel */}
            <div className="w-80 bg-[#050505] p-6 flex flex-col gap-6 shrink-0">
                {mode === 'save' && (
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome do Projeto</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="Meu Novo Hit"
                                className="w-full bg-[#111] border border-zinc-700 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-white transition-colors"
                            />
                            {newProjectName && !projects.includes(newProjectName) && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Plus className="w-4 h-4 text-green-500" />
                                </div>
                            )}
                        </div>
                        {projects.includes(newProjectName) && (
                            <p className="text-[10px] text-yellow-500 mt-1">⚠️ Este projeto já existe. Será sobrescrito.</p>
                        )}
                    </div>
                )}

                {mode === 'open' && (
                    <div className="flex flex-col gap-2 flex-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Detalhes</label>
                        <div className="bg-[#111] border border-zinc-800 rounded-lg p-4 flex-1 flex flex-col items-center justify-center text-zinc-600 gap-2">
                            {selectedProject ? (
                                <>
                                    <Folder className="w-12 h-12 text-zinc-700 mb-2" />
                                    <h3 className="text-white font-bold text-center break-all">{selectedProject}</h3>
                                    <p className="text-[10px]">Clique em abrir para carregar</p>
                                </>
                            ) : (
                                <p className="text-xs">Selecione um projeto na lista</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-auto">
                    <button 
                        onClick={handleConfirm}
                        disabled={!rootHandle || (mode === 'save' ? !newProjectName : !selectedProject)}
                        className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                            !rootHandle || (mode === 'save' ? !newProjectName : !selectedProject)
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            : 'bg-white text-black hover:bg-gray-200 shadow-lg shadow-white/10'
                        }`}
                    >
                        {mode === 'save' ? 'Salvar Agora' : 'Abrir Projeto'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};
