import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, Bug, Zap, Smartphone, ArrowRight } from 'lucide-react';

const CURRENT_VERSION = '0.0.0';

export const ReleaseNotes: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const savedVersion = localStorage.getItem('monochrome_version_acknowledged');
    // Se a versão salva for diferente da atual, mostra as notas
    if (savedVersion !== CURRENT_VERSION) {
      // Pequeno delay para animação de entrada
      setTimeout(() => setIsVisible(true), 500);
    }
  }, []);

  const handleClose = (dontShowAgain: boolean) => {
    setIsVisible(false);
    if (dontShowAgain) {
      localStorage.setItem('monochrome_version_acknowledged', CURRENT_VERSION);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-[#050505] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#0a0a0a] border-b border-zinc-800 p-6 flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
                <span className="bg-[#e6c200] text-black text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest">Update</span>
                <h2 className="text-2xl font-bold text-white tracking-tight">O que há de novo</h2>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs">
                <span>VERSION_ID:</span>
                <span className="text-[#e6c200]">{CURRENT_VERSION}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            
            {/* Improvements Section */}
            <div className="mb-8">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#e6c200]" />
                    5 Novas Melhorias
                </h3>
                <ul className="space-y-3">
                    {[
                        { title: "Pocket Suite Mobile", desc: "7 novos efeitos otimizados exclusivamente para telas pequenas." },
                        { title: "Pocket Tune Pro", desc: "Correção de tom avançada com seleção de escala e controle de velocidade." },
                        { title: "Touch Faders", desc: "Substituição de knobs giratórios por faders verticais para melhor controle tátil." },
                        { title: "Stereo Imaging", desc: "Novo plugin 'Pocket Wide' para alargamento estéreo Mid/Side." },
                        { title: "Responsive Rack", desc: "O seletor de efeitos agora se adapta perfeitamente a qualquer resolução." }
                    ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <div>
                                <strong className="text-zinc-200 text-sm block">{item.title}</strong>
                                <span className="text-zinc-500 text-xs">{item.desc}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Bug Fixes Section */}
            <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Bug className="w-4 h-4 text-zinc-500" />
                    10 Bugs Corrigidos
                </h3>
                <ul className="space-y-3">
                    {[
                        { title: "Effect List Cutoff", desc: "Corrigido problema onde a lista de efeitos cortava itens no mobile." },
                        { title: "Touch Rotation", desc: "Resolvido conflito ao tentar girar knobs em telas touch." },
                        { title: "Sidebar Scrolling", desc: "Adicionada rolagem correta para cadeias de efeitos longas." },
                        { title: "Visualizer Crash", desc: "Otimização de memória nos visualizadores de áudio em tempo real." },
                        { title: "Layout Overflow", desc: "Corrigida barra de rolagem horizontal indesejada na janela principal." },
                        { title: "Metronome Drift", desc: "Corrigida dessincronização do metrônomo em tempos de reprodução longos." },
                        { title: "WAV Export Header", desc: "Resolvido problema de corrupção de cabeçalho em arquivos exportados (wav)." },
                        { title: "Ghost Clips", desc: "Corrigido bug onde clipes deletados continuavam tocando áudio residual." },
                        { title: "Safari Audio Context", desc: "Melhorada a inicialização do motor de áudio no iOS/Safari." },
                        { title: "Loop Seam Click", desc: "Eliminado pequeno estalo (click) na transição do ponto de loop." }
                    ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-900/10 border border-red-900/20">
                            <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                            </div>
                            <div>
                                <strong className="text-zinc-300 text-sm block">{item.title}</strong>
                                <span className="text-zinc-600 text-xs">{item.desc}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-zinc-800 bg-[#0a0a0a] flex flex-col sm:flex-row gap-3">
            <button 
                onClick={() => handleClose(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-800 text-zinc-400 font-bold text-xs uppercase tracking-wider hover:bg-zinc-900 hover:text-white transition-colors"
            >
                Ver de novo depois
            </button>
            <button 
                onClick={() => handleClose(true)}
                className="flex-1 px-4 py-3 rounded-xl bg-[#e6c200] text-black font-bold text-xs uppercase tracking-wider hover:bg-[#ffe033] transition-colors flex items-center justify-center gap-2"
            >
                Entendi (Não exibir mais)
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>

      </div>
    </div>
  );
};