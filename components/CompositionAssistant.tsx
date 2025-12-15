
import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Wand2, Save, Copy, Sparkles, PanelRightClose, Mic, Type, Minus, Plus, Lock } from 'lucide-react';
import { aiLyricsService } from '../services/AiLyricsService';
import { Clip } from '../types';

interface CompositionAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  selectedClip?: Clip | null;
}

export const CompositionAssistant: React.FC<CompositionAssistantProps> = ({ isOpen, onClose, isMobile, selectedClip }) => {
  const [lyrics, setLyrics] = useState('');
  const [rhymeScheme, setRhymeScheme] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(14);
  const [activeTab, setActiveTab] = useState<'write' | 'generate'>('write');
  
  // Referências para sincronizar o scroll
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rhymeColRef = useRef<HTMLDivElement>(null);

  // --- Lógica de Rima ---
  useEffect(() => {
    const lines = lyrics.split('\n');
    const endings: { [suffix: string]: string } = {};
    let nextChar = 65; // Código ASCII para 'A'
    
    const schemes = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return "";

        // Remove pontuação e pega a última palavra
        const cleanLine = trimmed.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "").toLowerCase();
        const words = cleanLine.split(/\s+/);
        const lastWord = words[words.length - 1];
        
        if (!lastWord || lastWord.length < 2) return "?";

        // Pega as últimas 3 letras (ou a palavra toda se for curta) como "som" da rima
        // Isso é uma aproximação fonética simples
        const suffix = lastWord.length > 3 ? lastWord.slice(-3) : lastWord;

        if (!endings[suffix]) {
            endings[suffix] = String.fromCharCode(nextChar);
            nextChar++;
            if (nextChar > 90) nextChar = 65; // Volta para A se passar de Z (simplificado)
        }
        
        return endings[suffix];
    });

    setRhymeScheme(schemes);
  }, [lyrics]);

  // --- Sincronia de Scroll ---
  const handleScroll = () => {
      if (textareaRef.current && rhymeColRef.current) {
          rhymeColRef.current.scrollTop = textareaRef.current.scrollTop;
      }
  };

  // --- Bloqueio de Features ---
  const handleFeatureBlocked = () => {
      alert("⚠️ RECURSO EM DESENVOLVIMENTO\n\nNo momento, foque na composição manual. A transcrição e geração por IA estarão disponíveis na próxima atualização.");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(lyrics);
    alert("Letra copiada!");
  };

  return (
    <div 
        className={`
            fixed inset-y-0 right-0 z-30 w-full md:w-96 bg-[#050505] border-l border-zinc-800 transform transition-all duration-300 ease-in-out shadow-2xl flex flex-col
            lg:relative lg:shadow-none
            ${isOpen ? 'translate-x-0 lg:w-96' : 'translate-x-full lg:w-0 lg:overflow-hidden lg:border-l-0 lg:translate-x-0'}
        `}
        style={{ top: isMobile ? '4rem' : '0', height: isMobile ? 'calc(100% - 4rem)' : '100%' }}
    >
      {/* Header */}
      <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#0a0a0a] shrink-0">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <PenTool className="w-3 h-3" /> Assistant
        </span>
        <button onClick={onClose} className="hover:text-white text-zinc-500"><PanelRightClose className="w-4 h-4" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-[#080808]">
        <button 
            onClick={() => setActiveTab('write')}
            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'write' ? 'bg-[#050505] text-white border-b-2 border-white' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
            Bloco de Notas
        </button>
        <button 
            onClick={handleFeatureBlocked}
            className="flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors text-zinc-600 cursor-not-allowed flex items-center justify-center gap-2 opacity-50"
        >
            Gerador AI <Lock className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col relative bg-[#050505]">
        
        {/* Toolbar de Ferramentas de Texto */}
        <div className="h-10 border-b border-zinc-800 flex items-center px-4 gap-4 bg-[#080808] shrink-0">
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-4">
                <Type className="w-3 h-3 text-zinc-500" />
                <button onClick={() => setFontSize(Math.max(10, fontSize - 1))} className="p-1 hover:text-white text-zinc-400"><Minus className="w-3 h-3" /></button>
                <span className="text-[10px] font-mono text-zinc-300 w-4 text-center">{fontSize}</span>
                <button onClick={() => setFontSize(Math.min(32, fontSize + 1))} className="p-1 hover:text-white text-zinc-400"><Plus className="w-3 h-3" /></button>
            </div>
            
            <button onClick={handleFeatureBlocked} className="flex items-center gap-1 text-[10px] font-bold text-zinc-600 uppercase hover:text-zinc-500 cursor-not-allowed" title="Em desenvolvimento">
                <Mic className="w-3 h-3" /> Transcrever
            </button>
        </div>

        <div className="flex-1 flex relative overflow-hidden">
            {/* Coluna de Estrutura de Rimas */}
            <div 
                ref={rhymeColRef}
                className="w-8 bg-[#0a0a0a] border-r border-zinc-800 flex flex-col items-center pt-6 pb-6 overflow-hidden select-none"
                style={{ fontSize: `${fontSize}px`, lineHeight: '1.5' }}
            >
                {rhymeScheme.map((code, i) => (
                    <div key={i} className="h-[1.5em] w-full flex items-center justify-center text-[10px] font-bold text-zinc-500 font-mono">
                        {code && <span className={`px-1 rounded ${code === '?' ? 'opacity-20' : 'bg-zinc-800 text-zinc-300'}`}>{code}</span>}
                    </div>
                ))}
            </div>

            {/* Área de Texto */}
            <textarea 
                ref={textareaRef}
                className="flex-1 bg-[#050505] text-zinc-300 p-6 resize-none focus:outline-none font-mono leading-[1.5] custom-scrollbar selection:bg-white selection:text-black placeholder-zinc-800 whitespace-pre"
                placeholder="Comece a escrever sua obra prima..."
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                onScroll={handleScroll}
                style={{ fontSize: `${fontSize}px` }}
                spellCheck={false}
            />
        </div>
        
        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-[#0a0a0a] grid grid-cols-2 gap-2 shrink-0">
            <button onClick={handleFeatureBlocked} className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-600 py-2 rounded text-[10px] font-bold uppercase cursor-not-allowed">
                <Wand2 className="w-3 h-3" /> Corrigir (Dev)
            </button>
            <button onClick={handleFeatureBlocked} className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-600 py-2 rounded text-[10px] font-bold uppercase cursor-not-allowed">
                <Sparkles className="w-3 h-3" /> Sugerir (Dev)
            </button>
            <button onClick={copyToClipboard} disabled={!lyrics} className="col-span-2 flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-white hover:text-black text-zinc-400 py-2 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50">
                <Copy className="w-3 h-3" /> Copiar Texto
            </button>
        </div>
      </div>
    </div>
  );
};
