import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Music, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { audioEngine } from '../services/AudioEngine';

interface BeatGeneratorModalProps {
  onClose: () => void;
  onImport: (buffer: AudioBuffer, name: string) => void;
}

export const BeatGeneratorModal: React.FC<BeatGeneratorModalProps> = ({ onClose, onImport }) => {
  const [prompt, setPrompt] = useState('');
  const [isInstrumental, setIsInstrumental] = useState(true);
  const [status, setStatus] = useState<'idle' | 'generating' | 'downloading' | 'decoding' | 'ready'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const pollInterval = useRef<number | null>(null);

  // Limpa intervalo ao desmontar
  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setStatus('generating');
    setError(null);

    try {
      // 1. Iniciar Geração
      const { data } = await api.post('/music/generate', {
        prompt: prompt,
        tags: "beat, instrumental, producer",
        title: "AI Beat Session",
        instrumental: isInstrumental
      });

      // A API retorna um array ou objeto dependendo da implementação, pegamos o ID
      const generatedId = Array.isArray(data.data) ? data.data[0].id : data.data.id;
      
      if (!generatedId) throw new Error("ID da tarefa não retornado.");
      
      setTaskId(generatedId);
      startPolling(generatedId);

    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || "Falha ao iniciar geração.");
      setStatus('idle');
    }
  };

  const startPolling = (id: string) => {
    // 2. Verificar Status Periodicamente
    pollInterval.current = window.setInterval(async () => {
      try {
        const { data: songs } = await api.get('/music/my-songs');
        // Encontra a música pelo ID do Suno
        const song = songs.find((s: any) => s.suno_id === id);

        if (song) {
          if (song.status === 'complete' || song.status === 'stream') { // 'stream' para streaming parcial se suportado
             if (song.audio_url) {
                 clearInterval(pollInterval.current!);
                 downloadAndImport(song.audio_url);
             }
          } else if (song.status === 'error') {
             throw new Error("Erro na geração da Suno.");
          }
        }
      } catch (err) {
        console.error("Polling error", err);
        // Não paramos o polling por erros de rede temporários, mas se for erro fatal...
      }
    }, 3000); // Checa a cada 3 segundos
  };

  const downloadAndImport = async (url: string) => {
    setStatus('downloading');
    try {
        // 3. Baixar o arquivo de áudio
        // Nota: Pode precisar de proxy se o CORS bloquear, mas geralmente URLs assinadas funcionam
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();

        setStatus('decoding');
        // 4. Decodificar para AudioBuffer da WebAudio API
        const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);

        onImport(audioBuffer, `AI Beat: ${prompt.substring(0, 15)}...`);
        setStatus('ready');
        
        // Fecha após um breve sucesso
        setTimeout(onClose, 1000);

    } catch (err) {
        console.error("Download/Decode error", err);
        setError("Erro ao baixar ou processar o áudio gerado.");
        setStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative">
        
        {/* Header */}
        <div className="bg-[#0f0f0f] border-b border-zinc-800 p-4 flex justify-between items-center">
            <div className="flex items-center gap-2 text-white font-bold">
                <Sparkles className="w-4 h-4 text-yellow-500" />
                <span>Gerador de Beats AI</span>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4">
            
            {status === 'idle' && (
                <>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Descreva seu Beat</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Ex: Dark Trap beat, 140 BPM, heavy 808s, minor key, ambient texture..."
                            className="w-full h-24 bg-[#111] border border-zinc-800 rounded-lg p-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                        />
                    </div>

                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsInstrumental(!isInstrumental)}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${isInstrumental ? 'bg-yellow-500 border-yellow-500' : 'border-zinc-600'}`}>
                            {isInstrumental && <CheckCircle2 className="w-3 h-3 text-black" />}
                        </div>
                        <span className="text-xs text-zinc-400 select-none">Forçar Instrumental</span>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-900/50 rounded flex items-center gap-2 text-red-400 text-xs">
                            <AlertCircle className="w-4 h-4" /> {error}
                        </div>
                    )}

                    <button 
                        onClick={handleGenerate}
                        disabled={!prompt.trim()}
                        className={`w-full py-3 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all 
                            ${!prompt.trim() ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.3)]'}
                        `}
                    >
                        <Music className="w-4 h-4" /> Criar & Importar
                    </button>
                </>
            )}

            {status !== 'idle' && (
                <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
                    {status === 'ready' ? (
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 mb-2">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-zinc-800 border-t-yellow-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-yellow-500 animate-pulse" />
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <h3 className="text-white font-bold text-lg animate-pulse">
                            {status === 'generating' && "Criando Beat na Nuvem..."}
                            {status === 'downloading' && "Baixando Áudio..."}
                            {status === 'decoding' && "Processando Waveform..."}
                            {status === 'ready' && "Pronto! Importando..."}
                        </h3>
                        <p className="text-zinc-500 text-xs mt-1">Isso pode levar alguns minutos. Não feche.</p>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
