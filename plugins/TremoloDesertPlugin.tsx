import React, { useEffect, useRef, useState } from 'react';
import { EffectPlugin } from '../types';
import { Knob } from '../components/Knob';

// 1. Configurações
interface TremoloSettings {
  speed: number; // Hz
  depth: number; // 0-1
  active: boolean;
}

// 2. Áudio
const initializeAudio = (ctx: AudioContext, settings: TremoloSettings): AudioNode => {
  // Criação dos nós
  const input = ctx.createGain();
  const output = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  
  lfo.type = 'sine';
  lfo.start();
  
  // Roteamento: LFO -> LFO Gain -> Output Gain (Modulação de Volume)
  // Input passa direto para o Output, mas o ganho do Output varia
  input.connect(output);
  lfo.connect(lfoGain);
  lfoGain.connect(output.gain);
  
  // Guardar referências no nó de input para acesso no update
  (input as any)._lfo = lfo;
  (input as any)._lfoGain = lfoGain;
  (input as any)._output = output;
  
  // Estado inicial
  updateAudio(input, settings, ctx);
  
  // Truque: O AudioEngine espera um único nó. Sobrescrevemos o connect do input
  // para que, ao conectar o input na cadeia, ele na verdade conecte o output interno.
  const originalConnect = input.connect.bind(input);
  input.connect = (destination: AudioNode | AudioParam, outputIndex?: number, inputIndex?: number) => {
      return output.connect(destination as any, outputIndex, inputIndex);
  };
  input.disconnect = () => {
      output.disconnect();
  };
  
  return input;
};

const updateAudio = (node: AudioNode, settings: TremoloSettings, ctx: AudioContext) => {
  const input = node as any;
  const lfo = input._lfo as OscillatorNode;
  const lfoGain = input._lfoGain as GainNode;
  const output = input._output as GainNode;
  
  const now = ctx.currentTime;
  
  if (!settings.active) {
      lfoGain.gain.setTargetAtTime(0, now, 0.05);
      output.gain.setTargetAtTime(1, now, 0.05);
      return;
  }
  
  // Configura LFO
  lfo.frequency.setTargetAtTime(settings.speed, now, 0.05);
  
  // Profundidade: LFO oscila entre -1 e 1.
  // Se depth for 0.8, queremos oscilar o ganho base (1) em +/- 0.4
  const modDepth = settings.depth * 0.5;
  lfoGain.gain.setTargetAtTime(modDepth, now, 0.05);
  
  // Ajusta o ganho base para 1 - metade da profundidade para manter volume
  output.gain.setTargetAtTime(1 - modDepth, now, 0.05);
};

// 3. UI Component
const TremoloComponent: React.FC<{ trackId: string, settings: TremoloSettings, onChange: (s: TremoloSettings) => void }> = ({ settings, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
      let raf: number;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      
      const loop = () => {
          if (!canvas || !ctx) return;
          const w = canvas.width = canvas.offsetWidth;
          const h = canvas.height = canvas.offsetHeight;
          const cx = w/2; 
          const cy = h/2;
          
          ctx.fillStyle = '#000';
          ctx.fillRect(0,0,w,h);
          
          // Visualização do Pulso (Simulado baseado na velocidade)
          const time = Date.now() / 1000;
          const pulse = settings.active ? Math.sin(time * settings.speed * Math.PI * 2) : 0;
          // Mapeia -1..1 para tamanho
          const size = 30 + (pulse * 10 * settings.depth);
          const opacity = 0.5 + (pulse * 0.3 * settings.depth);
          
          // Outer Glow
          ctx.beginPath();
          ctx.arc(cx, cy, size + 10, 0, Math.PI*2);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
          ctx.fill();

          // Core
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, Math.PI*2);
          ctx.fillStyle = settings.active ? '#fff' : '#333';
          ctx.fill();
          
          // Rings
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI*2); ctx.stroke();

          raf = requestAnimationFrame(loop);
      };
      loop();
      return () => cancelAnimationFrame(raf);
  }, [settings.speed, settings.depth, settings.active]);

  return (
    <div className="flex w-full h-full bg-[#050505] border border-[#222]">
        {/* Visual */}
        <div className="w-1/3 border-r border-[#222] relative">
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-[#555] font-mono">LFO RATE</div>
        </div>
        
        {/* Controls */}
        <div className="flex-1 flex items-center justify-around p-4 bg-[#0a0a0a] border-t border-[#333]">
            <Knob 
                label="SPEED" 
                value={settings.speed} 
                min={0.1} max={10} 
                onChange={(v) => onChange({...settings, speed: v})} 
            />
            <Knob 
                label="DEPTH" 
                value={settings.depth} 
                min={0} max={1} 
                onChange={(v) => onChange({...settings, depth: v})} 
            />
            
            <div className="h-10 w-[1px] bg-[#333]"></div>
            
            <button 
                onClick={() => onChange({...settings, active: !settings.active})}
                className={`text-[10px] font-bold px-4 py-2 border ${settings.active ? 'border-white text-white' : 'border-[#333] text-[#555]'}`}
            >
                {settings.active ? "ON" : "OFF"}
            </button>
        </div>
    </div>
  );
};

// 4. Exportação
export const TremoloDesertPlugin: EffectPlugin<TremoloSettings> = {
  id: 'tremoloDesert',
  name: 'Tremolo Studio',
  defaultSettings: { speed: 4, depth: 0.5, active: true },
  initialize: initializeAudio,
  update: updateAudio,
  component: TremoloComponent
};