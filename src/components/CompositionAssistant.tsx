import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Wand2, Save, Copy, Sparkles, PanelRightClose, Mic, Type, Minus, Plus, Loader2 } from 'lucide-react';
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
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Generator State
  const [genTopic, setGenTopic] = useState('');
  const [genGenre, setGenGenre] = useState('Pop');
  const [genMood, setGenMood] = useState('Happy');

  // Referências para sincronizar o scroll
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rhymeColRef = useRef<HTMLDivElement>(null);

  // --- Lógica de Rima Inteligente por Estrofe ---
  useEffect(() => {
    const lines = lyrics.split('\n');
    const schemes: string[] = [];
    
    // Estado volátil para cada estrofe
    let currentStanzaEndings: { [suffix: string]: string } = {};
    let nextChar = 65; // Começa em 'A'

    lines.forEach(line => {
        const trimmed = line.trim();
        
        if (!trimmed) {
            schemes.push(""); 
            currentStanzaEndings = {}; // Limpa memória da estrofe anterior
            nextChar = 65; // Reseta para A
            return;
        }

        const cleanLine = trimmed.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "").toLowerCase();
        const words = cleanLine.split(/\s+/);
        const lastWord = words[words.length - 1];
        
        if (!lastWord) {
            schemes.push("?");
            return;
        }

        let suffix = lastWord;
        if (lastWord.length >= 3) {
            suffix = lastWord.slice(-2);
        } else {
            suffix = lastWord;
        }

        if (currentStanzaEndings[suffix]) {
            schemes.push(currentStanzaEndings[suffix]);
        } else {
            const letter = String.fromCharCode(nextChar);
            currentStanzaEndings[suffix] = letter;
            schemes.push(letter);
            nextChar++;
            if (nextChar > 90) nextChar = 65; 
        }
    });

    setRhymeScheme(schemes);
  }, [lyrics]);

  // --- Sincronia de Scroll ---
  const handleScroll = () => {
      if (textareaRef.current && rhymeColRef.current) {
          rhymeColRef.current.scrollTop = textareaRef.current.scrollTop;
      }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(lyrics);
    alert("Letra copiada!");
  };

  // --- AI HANDLERS ---
  const handleGenerate = async () => {
      if (!genTopic) return;
      setIsProcessing(true);
      try {
          const generated = await aiLyricsService.generateLyrics(genTopic, genGenre, genMood);
          setLyrics(generated);
          setActiveTab('write'); // Muda pra tab de escrita pra ver o resultado
      } catch (err) {
          alert("Erro ao gerar letra. Tente novamente.");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleFix = async () => {
      if (!lyrics.trim()) return;
      setIsProcessing(true);
      try {
          const fixed = await aiLyricsService.fixLyrics(lyrics);
          setLyrics(fixed);
      } catch (err) {
          alert("Erro ao corrigir letra.");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSuggest = async () => {
      if (!lyrics.trim()) return;
      setIsProcessing(true);
      try {
          const suggestion = await aiLyricsService.suggestNextLines(lyrics);
          setLyrics(prev => prev + "\n\n" + suggestion);
      } catch (err) {
          alert("Erro ao sugerir linhas.");
      } finally {
          setIsProcessing(false);
      }
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
            <PenTool className="w-3 h-3" /> Assistant Pro
        </span>
        <button onClick={onClose} className="hover:text-white text-zinc-500"><PanelRightClose className="w-4 h-4" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-[#080808]">
        <button 
            onClick={() => setActiveTab('write')}
            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'write' ? 'bg-[#050505] text-white border-b-2 border-white' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
            Editor
        </button>
        <button 
            onClick={() => setActiveTab('generate')}
            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'generate' ? 'bg-[#050505] text-white border-b-2 border-white' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
            Gerador AI
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col relative bg-[#050505]">
        
        {activeTab === 'write' && (
            <>
                <div className="h-10 border-b border-zinc-800 flex items-center px-4 gap-4 bg-[#080808] shrink-0">
                    <div className="flex items-center gap-2 border-r border-zinc-800 pr-4">
                        <Type className="w-3 h-3 text-zinc-500" />
                        <button onClick={() => setFontSize(Math.max(10, fontSize - 1))} className="p-1 hover:text-white text-zinc-400"><Minus className="w-3 h-3" /></button>
                        <span className="text-[10px] font-mono text-zinc-300 w-4 text-center">{fontSize}</span>
                        <button onClick={() => setFontSize(Math.min(32, fontSize + 1))} className="p-1 hover:text-white text-zinc-400"><Plus className="w-3 h-3" /></button>
                    </div>
                </div>

                <div className="flex-1 flex relative overflow-hidden">
                    <div 
                        ref={rhymeColRef}
                        className="w-10 bg-[#0a0a0a] border-r border-zinc-800 flex flex-col items-center pt-6 pb-6 overflow-hidden select-none shrink-0"
                        style={{ fontSize: `${fontSize}px`, lineHeight: '1.5' }}
                    >
                        {rhymeScheme.map((code, i) => (
                            <div key={i} className="h-[1.5em] w-full flex items-center justify-center text-[10px] font-bold text-zinc-500 font-mono">
                                {code && <span className={`w-6 text-center rounded ${code === '?' ? 'opacity-20' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>{code}</span>}
                            </div>
                        ))}
                    </div>

                    <textarea 
                        ref={textareaRef}
                        className="flex-1 bg-[#050505] text-zinc-300 p-6 resize-none focus:outline-none font-mono leading-[1.5] custom-scrollbar selection:bg-white selection:text-black placeholder-zinc-800 whitespace-pre"
                        placeholder="Comece a escrever sua letra..."
                        value={lyrics}
                        onChange={(e) => setLyrics(e.target.value)}
                        onScroll={handleScroll}
                        style={{ fontSize: `${fontSize}px` }}
                        spellCheck={false}
                    />
                </div>
            </>
        )}

        {activeTab === 'generate' && (
            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Sobre o que é a música?</label>
                    <input 
                        type="text" 
                        className="w-full bg-[#111] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-white outline-none"
                        placeholder="Ex: Um amor de verão na praia..."
                        value={genTopic}
                        onChange={(e) => setGenTopic(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gênero</label>
                    <select 
                        className="w-full bg-[#111] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-white outline-none"
                        value={genGenre}
                        onChange={(e) => setGenGenre(e.target.value)}
                    >
                        <option>Pop</option><option>Rock</option><option>Rap</option><option>Trap</option><option>R&B</option><option>Sertanejo</option><option>Funk</option><option>Indie</option>
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Vibe</label>
                    <select 
                        className="w-full bg-[#111] border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-white outline-none"
                        value={genMood}
                        onChange={(e) => setGenMood(e.target.value)}
                    >
                        <option>Happy</option><option>Sad</option><option>Energetic</option><option>Chill</option><option>Aggressive</option><option>Romantic</option>
                    </select>
                </div>

                <button 
                    onClick={handleGenerate}
                    disabled={isProcessing || !genTopic}
                    className={`w-full py-4 rounded-lg font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isProcessing || !genTopic ? 'bg-zinc-800 text-zinc-600' : 'bg-white text-black hover:bg-gray-200'}`}
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isProcessing ? 'Criando...' : 'Gerar Letra'}
                </button>
            </div>
        )}
        
        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 bg-[#0a0a0a] grid grid-cols-2 gap-2 shrink-0">
            <button 
                onClick={handleFix} 
                disabled={isProcessing || !lyrics}
                className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-400 py-2 rounded text-[10px] font-bold uppercase hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
            >
                <Wand2 className="w-3 h-3" /> Melhorar
            </button>
            <button 
                onClick={handleSuggest} 
                disabled={isProcessing || !lyrics}
                className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-400 py-2 rounded text-[10px] font-bold uppercase hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
            >
                <Sparkles className="w-3 h-3" /> + Estrofe
            </button>
            <button onClick={copyToClipboard} disabled={!lyrics} className="col-span-2 flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-white hover:text-black text-zinc-400 py-2 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50">
                <Copy className="w-3 h-3" /> Copiar Texto
            </button>
        </div>
      </div>
    </div>
  );
};