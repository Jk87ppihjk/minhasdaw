
import React, { useState } from 'react';
import { Sparkles, X, Wand2, Music, AlertCircle } from 'lucide-react';
import { aiMixingService } from '../services/AiMixingService';
import { Track } from '../types';

interface AiAssistantModalProps {
  tracks: Track[];
  onApplyMix: (result: any) => void;
  onClose: () => void;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({ tracks, onApplyMix, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const tracksData = tracks.map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          volume: t.volume
      }));

      const result = await aiMixingService.generateMix(prompt, tracksData);
      onApplyMix(result);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to generate mix. Please check your API Key or try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "Masterização de Trap alta e com punch",
    "Mixagem Lo-Fi suave e vintage",
    "Estilo Rock moderno com vocal na frente",
    "Limpeza geral e maximização de volume",
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative">
        
        {/* Background Gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"></div>

        <div className="p-6 flex flex-col gap-6">
            
            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                        AI MIX & MASTER
                    </h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">
                        Engenharia de áudio generativa completa
                    </p>
                </div>
                <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Input Area */}
            <div className="flex flex-col gap-3">
                <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Descreva o som final (ex: 'Quero um master alto, brilhante, estilo pop moderno, com os vocais bem controlados')..."
                    className="w-full h-32 bg-[#111] border border-zinc-700 rounded-lg p-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                    disabled={isLoading}
                />
                
                {/* Suggestions */}
                <div className="flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                        <button 
                            key={i} 
                            onClick={() => setPrompt(s)}
                            className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-1 rounded-full hover:bg-zinc-800 hover:text-white transition-colors"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-900/20 border border-red-900/50 p-3 rounded-lg flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Action Button */}
            <button 
                onClick={handleSubmit}
                disabled={isLoading || !prompt.trim()}
                className={`w-full py-4 rounded-lg font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all relative overflow-hidden group
                    ${isLoading || !prompt.trim() 
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                        : 'bg-white text-black hover:scale-[1.01] shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                    }`}
            >
                {isLoading ? (
                    <>
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-black rounded-full animate-spin"></div>
                        <span>Processando Áudio...</span>
                    </>
                ) : (
                    <>
                        <Wand2 className="w-4 h-4 text-purple-600 group-hover:text-black transition-colors" />
                        <span>Gerar Mixagem Completa</span>
                    </>
                )}
            </button>

        </div>
      </div>
    </div>
  );
};
