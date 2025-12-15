import React, { useEffect, useState } from 'react';
import { Cloud, Plus, FolderOpen, Music, Clock, ArrowRight, Loader2, Disc, LayoutGrid } from 'lucide-react';
import { api } from '../services/api';

interface Project {
    id: number;
    name: string;
    updated_at: string;
}

interface DashboardProps {
  rootHandle?: any; // Deprecated but kept for type compat if needed
  onSelectRoot?: any; // Deprecated
  onOpenProject: (projectId: string) => void; // Now receives ID, not name
  onNewProject: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject, onNewProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get('/projects');
        setProjects(data);
      } catch (e) {
        console.error("Failed to load projects", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
  };

  return (
    <div className="fixed inset-0 bg-[#050505] text-white flex flex-col font-sans overflow-hidden">
      {/* Top Bar */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-500 rounded flex items-center justify-center shadow-lg shadow-yellow-500/20">
                <Music className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-black tracking-tighter">MONOCHROME <span className="text-zinc-600 font-normal text-sm tracking-widest">CLOUD</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
            <span className="flex items-center gap-2 px-3 py-1 rounded bg-zinc-900 border border-zinc-800 text-green-500">
                <Cloud className="w-3 h-3" /> Online
            </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
            
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="text-3xl font-bold mb-1">Seus Projetos</h2>
                    <p className="text-zinc-500 text-sm">Gerencie suas produções salvas na nuvem.</p>
                </div>
                <button onClick={onNewProject} className="bg-yellow-500 text-black px-6 py-3 rounded font-bold text-xs uppercase tracking-widest hover:bg-yellow-400 transition-colors flex items-center gap-2 shadow-lg shadow-yellow-500/20">
                    <Plus className="w-4 h-4" /> Novo Projeto
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                
                {/* New Project Card (Shortcut) */}
                <button 
                    onClick={onNewProject}
                    className="group h-48 border border-zinc-800 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 hover:bg-zinc-900/50 hover:border-yellow-500/50 transition-all text-zinc-500 hover:text-white"
                >
                    <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 group-hover:scale-110 transition-transform group-hover:border-yellow-500 group-hover:text-yellow-500">
                        <Plus className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-xs uppercase tracking-widest">Criar Vazio</span>
                </button>

                {/* Loading State */}
                {isLoading && (
                    <div className="h-48 flex items-center justify-center text-zinc-500 col-span-full">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Sincronizando com a nuvem...
                    </div>
                )}

                {/* Project List */}
                {!isLoading && projects.map(project => (
                    <div 
                        key={project.id}
                        onClick={() => onOpenProject(project.id.toString())}
                        className="group relative h-48 bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 flex flex-col justify-between cursor-pointer hover:border-yellow-500/50 hover:bg-[#0f0f0f] hover:-translate-y-1 transition-all shadow-lg hover:shadow-xl shadow-black"
                    >
                        <div className="flex justify-between items-start">
                            <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 group-hover:border-yellow-500/30 transition-colors">
                                <Disc className="w-5 h-5 text-zinc-400 group-hover:text-yellow-500" />
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-5 h-5 -rotate-45 text-zinc-500 group-hover:text-yellow-500" />
                            </div>
                        </div>
                        
                        <div>
                            <h3 className="font-bold text-lg text-zinc-200 group-hover:text-white truncate">{project.name}</h3>
                            <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500 font-mono uppercase">
                                <Clock className="w-3 h-3" />
                                <span>{formatDate(project.updated_at)}</span>
                            </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                ))}

                {!isLoading && projects.length === 0 && (
                    <div className="col-span-2 h-48 flex flex-col items-center justify-center text-zinc-600 border border-zinc-900 rounded-xl bg-zinc-900/20">
                        <FolderOpen className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-xs">Nenhum projeto encontrado na nuvem.</span>
                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
};