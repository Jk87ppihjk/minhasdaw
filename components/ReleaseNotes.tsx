import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, Bug, Zap, Smartphone, ArrowRight, Grid, AlignJustify } from 'lucide-react';

const CURRENT_VERSION = '0.0.1';

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
                <span className="bg-white text-black text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest">Update</span>
                <h2 className="text-2xl font-bold text-white tracking-tight">O que há de novo</h2>
            </div>
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs">
                <span>VERSION_ID:</span>
                <span className="text-white">{CURRENT_VERSION}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            
            {/* Improvements Section */}
            <div className="mb-8">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-white" />
                    Novas Funcionalidades
                </h3>
                <ul className="space-y-3">
                    {[
                        { title: "Smart Grid System", desc: "Nova régua com divisão por Compassos e Tempos (1, 1.2, 1.3...)." },
                        { title: "Visual Matrix", desc: "Adição de linhas horizontais e verticais para melhor precisão no arranjo." },
                        { title: "Precision Zoom", desc: "O grid se adapta automaticamente ao nível de zoom." }
                    ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                            <Grid className="w-4 h-4 text-white mt-0.5 shrink-0" />
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
                    Correções Críticas
                </h3>
                <ul className="space-y-3">
                    {[
                        { title: "Track/Clip Misalignment", desc: "Corrigido erro visual grave onde as faixas laterais não alinhavam com os clipes na timeline." },
                        { title: "Ruler Offset", desc: "Ajuste na compensação de altura da régua de tempo." }
                    ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                            <AlignJustify className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
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
                className="flex-1 px-4 py-3 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
                Entendi (Não exibir mais)
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>

      </div>
    </div>
  );
};