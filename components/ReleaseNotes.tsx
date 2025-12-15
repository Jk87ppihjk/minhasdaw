import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, Bug, Zap, Smartphone, ArrowRight, Grid, AlignJustify, Eye, Volume2 } from 'lucide-react';

const CURRENT_VERSION = '0.0.2';

export const ReleaseNotes: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const savedVersion = localStorage.getItem('monochrome_version_acknowledged');
    if (savedVersion !== CURRENT_VERSION) {
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
            
            {/* Visual Improvements */}
            <div className="mb-8">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-white" />
                    High Contrast & UI Update
                </h3>
                <ul className="space-y-3">
                    <li className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <Grid className="w-4 h-4 text-white mt-0.5 shrink-0" />
                        <div>
                            <strong className="text-zinc-200 text-sm block">Sistema de Alto Contraste</strong>
                            <span className="text-zinc-500 text-xs">Redesenhamos os limites dos painéis e botões com bordas mais nítidas (#444) para melhorar a visibilidade no tema escuro.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <AlignJustify className="w-4 h-4 text-white mt-0.5 shrink-0" />
                        <div>
                            <strong className="text-zinc-200 text-sm block">Agulha de Reprodução Retina</strong>
                            <span className="text-zinc-500 text-xs">A linha de reprodução agora é branca brilhante com uma sombra forte, facilitando o corte e edição precisa.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <ArrowRight className="w-4 h-4 text-white mt-0.5 shrink-0" />
                        <div>
                            <strong className="text-zinc-200 text-sm block">Scrollbars Visíveis</strong>
                            <span className="text-zinc-500 text-xs">As barras de rolagem foram personalizadas para serem visíveis contra o fundo preto.</span>
                        </div>
                    </li>
                </ul>
            </div>

            {/* Feature Improvements */}
            <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-zinc-500" />
                    Novas Funcionalidades
                </h3>
                <ul className="space-y-3">
                    <li className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <Volume2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <div>
                            <strong className="text-zinc-300 text-sm block">Master Output Control</strong>
                            <span className="text-zinc-600 text-xs">Adicionado um controle deslizante de volume mestre no cabeçalho para controle global de ganho.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div>
                            <strong className="text-zinc-300 text-sm block">Destaque de Seleção</strong>
                            <span className="text-zinc-600 text-xs">Faixas selecionadas agora possuem uma borda iluminada clara para evitar erros de fluxo de trabalho.</span>
                        </div>
                    </li>
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
                Entendi
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>

      </div>
    </div>
  );
};