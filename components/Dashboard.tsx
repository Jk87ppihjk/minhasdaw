
import React, { useEffect, useState } from 'react';
import { HardDrive, Plus, FolderOpen, Music, Clock, ArrowRight, Loader2, Disc } from 'lucide-react';

interface DashboardProps {
  rootHandle: FileSystemDirectoryHandle | null;
  onSelectRoot: () => void;
  onOpenProject: (name: string) => void;
  onNewProject: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ rootHandle, onSelectRoot, onOpenProject, onNewProject }) => {
  const [projects, setProjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const scan = async () => {
      if (!rootHandle) return;
      setIsLoading(true);
      const list: string[] = [];
      try {
        // @ts-ignore
        for await (const entry of rootHandle.values()) {
          if (entry.kind === 'directory') {
            list.push(entry.name);
          }
        }
        setProjects(list.sort());
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    scan();
  }, [rootHandle]);

  const handleCreateNew = () => {
      if (!rootHandle) {
          onSelectRoot(); // Trigger select if not ready, logic in App handles flow
      } else {
          onNewProject();
      }
  };

  return (
    <div className="fixed inset-0 bg-[#050505] text-white flex flex-col font-sans overflow-hidden">
      {/* Top Bar */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded flex items-center justify-center shadow-lg shadow-white/10">
                <Music className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-black tracking-tighter">MONOCHROME <span className="text-zinc-600 font-normal text-sm tracking-widest">HUB</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
            {rootHandle ? (
                <span className="flex items-center gap-2 px-3 py-1 rounded bg-zinc-900 border border-zinc-800">
                    <HardDrive className="w-3 h-3" /> {rootHandle.name}
                </span>
            ) : (
                <span className="text-zinc-600">NO WORKSPACE CONNECTED</span>
            )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
            
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="text-3xl font-bold mb-1">Seus Projetos</h2>
                    <p className="text-zinc-500 text-sm">Gerencie suas produções ou inicie uma nova ideia.</p>
                </div>
                {!rootHandle && (
                    <button onClick={onSelectRoot} className="bg-white text-black px-6 py-3 rounded font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-colors flex items-center gap-2">
                        <HardDrive className="w-4 h-4" /> Conectar Pasta
                    </button>
                )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                
                {/* New Project Card */}
                <button 
                    onClick={handleCreateNew}
                    className="group h-48 border border-zinc-800 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 hover:bg-zinc-900/50 hover:border-white transition-all text-zinc-500 hover:text-white"
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 group-hover:scale-110 transition-transform group-hover:border-white">
                        <Plus className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-xs uppercase tracking-widest">Novo Projeto</span>
                </button>

                {/* Loading State */}
                {isLoading && (
                    <div className="h-48 flex items-center justify-center text-zinc-500 col-span-full">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando projetos...
                    </div>
                )}

                {/* Project List */}
                {rootHandle && projects.map(project => (
                    <div 
                        key={project}
                        onClick={() => onOpenProject(project)}
                        className="group relative h-48 bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col justify-between cursor-pointer hover:border-zinc-600 hover:bg-[#0f0f0f] hover:-translate-y-1 transition-all shadow-lg hover:shadow-xl shadow-black"
                    >
                        <div className="flex justify-between items-start">
                            <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 group-hover:border-white/20 transition-colors">
                                <Disc className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5 -rotate-45 text-zinc-500" />
                            </div>
                        </div>
                        
                        <div>
                            <h3 className="font-bold text-lg text-zinc-200 group-hover:text-white truncate">{project}</h3>
                            <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500 font-mono uppercase">
                                <Clock className="w-3 h-3" />
                                <span>Local Project</span>
                            </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                ))}

                {rootHandle && projects.length === 0 && !isLoading && (
                    <div className="col-span-2 h-48 flex flex-col items-center justify-center text-zinc-600 border border-zinc-900 rounded-xl bg-zinc-900/20">
                        <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-xs">Esta pasta está vazia.</span>
                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
};
