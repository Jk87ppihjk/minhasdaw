
import React, { useState } from 'react';
import { PenTool, Wand2, Save, Copy, Sparkles, PanelRightClose, Mic } from 'lucide-react';
import { aiLyricsService } from '../services/AiLyricsService';
import { Clip } from '../types';

interface CompositionAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  selectedClip?: Clip | null; // Receive selected clip
}

export const CompositionAssistant: React.FC<CompositionAssistantProps> = ({ isOpen, onClose, isMobile, selectedClip }) => {
  const [lyrics, setLyrics] = useState('');
  const [topic, setTopic] = useState('');
  const [genre, setGenre] = useState('Trap');
  const [mood, setMood] = useState('Melancholic');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'generate'>('write');

  const handleGenerate = async () => {
    if (!topic) return;
    setIsLoading(true);
    try {
      const result = await aiLyricsService.generateLyrics(topic, genre, mood);
      setLyrics(prev => prev ? prev + "\n\n" + result : result);
      setActiveTab('write');
    } catch (error) {
      alert("Erro ao gerar letra. Verifique sua API Key.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFix = async () => {
    if (!lyrics.trim()) return;
    setIsLoading(true);
    try {
      const result = await aiLyricsService.fixLyrics(lyrics);
      setLyrics(result);
    } catch (error) {
        alert("Erro ao processar.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggest = async () => {
    if (!lyrics.trim()) return;
    setIsLoading(true);
    try {
      const result = await aiLyricsService.suggestNextLines(lyrics);
      setLyrics(prev => prev + "\n" + result);
    } catch (error) {
        alert("Erro ao sugerir.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranscribe = async () => {
      if (!selectedClip || !selectedClip.blob) {
          alert("Selecione um clipe de áudio gravado na timeline primeiro.");
          return;
      }
      setIsLoading(true);
      try {
          const text = await aiLyricsService.transcribeAudio(selectedClip.blob);
          setLyrics(prev => prev ? prev + "\n\n[Transcribed]:\n" + text : text);
      } catch (e) {
          alert("Erro na transcrição.");
      } finally {
          setIsLoading(false);
      }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(lyrics);
    alert("Copiado!");
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
            onClick={() => setActiveTab('generate')}
            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'generate' ? 'bg-[#050505] text-white border-b-2 border-white' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
            Gerador AI
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        
        {isLoading && (
             <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center gap-3 backdrop-blur-sm animate-in fade-in">
                 <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin"></div>
                 <span className="text-xs font-mono animate-pulse text-zinc-400">PROCESSANDO...</span>
             </div>
        )}

        {activeTab === 'write' ? (
            <div className="flex-1 flex flex-col h-full">
                <div className="p-2 border-b border-zinc-900 bg-[#080808]">
                    <button 
                        onClick={handleTranscribe}
                        disabled={!selectedClip}
                        className={`w-full flex items-center justify-center gap-2 py-2 rounded text-[10px] font-bold uppercase border transition-all ${selectedClip ? 'bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-800' : 'bg-transparent text-zinc-600 border-zinc-800 cursor-not-allowed'}`}
                        title="Selecione um clipe na timeline para transcrever"
                    >
                        <Mic className="w-3 h-3" /> Transcrever Audio Selecionado
                    </button>
                </div>
                <textarea 
                    className="flex-1 bg-[#050505] text-zinc-300 p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed custom-scrollbar selection:bg-white selection:text-black placeholder-zinc-800"
                    placeholder="Escreva sua letra aqui ou use a transcrição..."
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    spellCheck={false}
                />
                
                {/* AI Tools Bar */}
                <div className="p-4 border-t border-zinc-800 bg-[#0a0a0a] grid grid-cols-2 gap-2">
                    <button onClick={handleFix} disabled={!lyrics} className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white py-2 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50">
                        <Wand2 className="w-3 h-3" /> Corrigir / Melhorar
                    </button>
                    <button onClick={handleSuggest} disabled={!lyrics} className="flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white py-2 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50">
                        <Sparkles className="w-3 h-3" /> Sugerir Próxima
                    </button>
                    <button onClick={copyToClipboard} disabled={!lyrics} className="col-span-2 flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-white hover:text-black text-zinc-400 py-2 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50">
                        <Copy className="w-3 h-3" /> Copiar Texto
                    </button>
                </div>
            </div>
        ) : (
            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sobre o que é a música?</label>
                    <input 
                        type="text" 
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Ex: Um amor perdido em uma cidade cyberpunk..."
                        className="bg-[#111] border border-zinc-800 rounded p-3 text-sm text-white focus:border-white focus:outline-none transition-colors"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Gênero</label>
                    <select 
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="bg-[#111] border border-zinc-800 rounded p-3 text-sm text-white focus:border-white focus:outline-none"
                    >
                        {['Trap', 'Rap', 'R&B', 'Pop', 'Rock', 'Lo-Fi', 'Reggaeton', 'Techno'].map(g => (
                            <option key={g} value={g}>{g}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Humor (Mood)</label>
                    <select 
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        className="bg-[#111] border border-zinc-800 rounded p-3 text-sm text-white focus:border-white focus:outline-none"
                    >
                        {['Melancholic', 'Aggressive', 'Happy', 'Romantic', 'Dark', 'Motivational', 'Chill'].map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>

                <button 
                    onClick={handleGenerate}
                    disabled={!topic || isLoading}
                    className={`mt-auto w-full py-4 rounded font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${!topic ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-white text-black hover:bg-zinc-200'}`}
                >
                    <Sparkles className="w-4 h-4" /> Gerar Letra Completa
                </button>
            </div>
        )}
      </div>
    </div>
  );
};
