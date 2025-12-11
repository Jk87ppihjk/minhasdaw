import React from 'react';

export enum TrackType {
  BEAT = 'BEAT',
  VOCAL = 'VOCAL',
}

export interface FilterBand {
  freq: number;
  gain: number;
  q: number;
  type: 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch';
}

// Interface antiga para compatibilidade
export interface LegacyEffectSettings {
  autoPitch: { scale: string; speed: number; active: boolean; harmony: boolean; reverb: number; };
  parametricEQ: { bands: FilterBand[]; active: boolean; preamp: number; reverb: number; };
  compressor: { threshold: number; ratio: number; attack: number; release: number; knee: number; makeup: number; active: boolean };
  reverb: { time: number; mix: number; preDelay: number; tone: number; size: number; active: boolean };
  distortion: number;
  delay: { time: number; feedback: number; mix: number; active: boolean };
  eqLow: { gain: number; active: boolean };
  eqMid: { gain: number; active: boolean };
  eqHigh: { gain: number; active: boolean };
  chorus: { rate: number; depth: number; mix: number; active: boolean };
  tremolo: { rate: number; depth: number; active: boolean };
  stereoWidener: { width: number; active: boolean };
  limiter: { threshold: number; active: boolean };
  phaser: { rate: number; depth: number; active: boolean };
}

// EffectSettings agora aceita chaves dinâmicas para os novos plugins
export type EffectSettings = LegacyEffectSettings & { [key: string]: any };

export interface Clip {
  id: string;
  name: string;
  blob?: Blob;
  buffer?: AudioBuffer;
  duration: number; 
  audioOffset: number; 
  startTime: number; 
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  volume: number; 
  pan: number; 
  muted: boolean;
  solo: boolean;
  clips: Clip[]; 
  effects: EffectSettings;
  activeEffects: string[]; 
}

export interface AudioEngineState {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  isRecording: boolean;
  bpm: number;
  snapToGrid: boolean;
  metronomeOn: boolean;
  masterVolume: number;
  loop: {
    active: boolean;
    start: number;
    end: number;
  };
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string | null;
  clipId: string | null;
}

// --- NOVO SISTEMA DE PLUGINS ---

export interface EffectPlugin<T = any> {
  id: string;
  name: string;
  defaultSettings: T;
  
  // Audio Logic
  initialize: (context: AudioContext, initialSettings: T) => AudioNode; // Retorna o nó de entrada (que deve estar conectado internamente até a saída do nó retornado)
  update: (node: AudioNode, settings: T, context: AudioContext) => void;
  
  // UI Component
  component: React.FC<{ 
    trackId: string;
    settings: T;
    onChange: (newSettings: T) => void;
  }>;
}