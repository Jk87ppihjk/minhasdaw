import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Square, Mic, Music, Layers, Settings2, Trash2, Plus, ZoomIn, ZoomOut, Magnet, SlidersHorizontal, Scissors, PanelRightClose, MousePointer2, XCircle, Download, Save, ArrowLeft, Volume2, Disc, Repeat, Palette, Activity, FolderOpen } from 'lucide-react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { audioEngine } from './services/AudioEngine';
import { Track, TrackType, AudioEngineState, Clip, EffectSettings } from './types';
import { EffectRegistry } from './services/EffectRegistry';
import { Waveform } from './components/Waveform';
import { Knob } from './components/Knob';
import { EffectSelector } from './components/EffectSelector';
import { ParametricEQ } from './components/effects/ParametricEQ';
import { CompressorEffect } from './components/effects/CompressorEffect';
import { ReverbEffect } from './components/effects/ReverbEffect';
import { TunerEffect } from './components/effects/TunerEffect';
import { DistortionEffect } from './components/effects/DistortionEffect'; 

// --- Constants ---
const BASE_PX_PER_SEC = 50;

// --- THEME CONFIGURATION ---
const THEMES: Record<string, React.CSSProperties> = {
  dark: {
    '--bg-main': '#050505',
    '--bg-panel': '#0a0a0a',
    '--bg-element': '#111',
    '--text-main': '#e4e4e7', // zinc-200
    '--text-muted': '#71717a', // zinc-500
    '--border-color': '#27272a', // zinc-800
    '--accent': '#e6c200',
    '--waveform-bg': '#27272a',
    '--waveform-wave': '#a1a1aa'
  } as React.CSSProperties,
  light: {
    '--bg-main': '#f4f4f5', // zinc-100
    '--bg-panel': '#ffffff',
    '--bg-element': '#e4e4e7', // zinc-200
    '--text-main': '#18181b', // zinc-900
    '--text-muted': '#71717a',
    '--border-color': '#d4d4d8', // zinc-300
    '--accent': '#d97706', // amber-600
    '--waveform-bg': '#e4e4e7',
    '--waveform-wave': '#52525b'
  } as React.CSSProperties,
  yellow: {
    '--bg-main': '#fef08a', // yellow-200
    '--bg-panel': '#facc15', // yellow-400
    '--bg-element': '#eab308', // yellow-500
    '--text-main': '#422006', // yellow-950
    '--text-muted': '#854d0e', // yellow-800
    '--border-color': '#a16207', // yellow-700
    '--accent': '#000000',
    '--waveform-bg': '#ca8a04',
    '--waveform-wave': '#ffffff'
  } as React.CSSProperties,
  blue: {
    '--bg-main': '#020617', // slate-950
    '--bg-panel': '#0f172a', // slate-900
    '--bg-element': '#1e293b', // slate-800
    '--text-main': '#f1f5f9', // slate-100
    '--text-muted': '#64748b', // slate-500
    '--border-color': '#334155', // slate-700
    '--accent': '#38bdf8', // sky-400
    '--waveform-bg': '#1e293b',
    '--waveform-wave': '#7dd3fc'
  } as React.CSSProperties,
  green: {
    '--bg-main': '#022c22', // teal-950
    '--bg-panel': '#064e3b', // teal-900
    '--bg-element': '#115e59', // teal-800
    '--text-main': '#ccfbf1', // teal-100
    '--text-muted': '#5eead4', // teal-300
    '--border-color': '#134e4a', // teal-800
    '--accent': '#34d399', // emerald-400
    '--waveform-bg': '#064e3b',
    '--waveform-wave': '#6ee7b7'
  } as React.CSSProperties,
  red: {
    '--bg-main': '#2a0a0a', 
    '--bg-panel': '#450a0a',
    '--bg-element': '#7f1d1d',
    '--text-main': '#fecdd3', // rose-200
    '--text-muted': '#fb7185', // rose-400
    '--border-color': '#881337', // rose-900
    '--accent': '#f43f5e', // rose-500
    '--waveform-bg': '#4c0519',
    '--waveform-wave': '#fda4af'
  } as React.CSSProperties,
  purple: {
    '--bg-main': '#1e1b4b', // indigo-950
    '--bg-panel': '#312e81', // indigo-900
    '--bg-element': '#4338ca', // indigo-700
    '--text-main': '#e0e7ff', // indigo-100
    '--text-muted': '#818cf8', // indigo-400
    '--border-color': '#3730a3', // indigo-800
    '--accent': '#c084fc', // purple-400
    '--waveform-bg': '#312e81',
    '--waveform-wave': '#a78bfa'
  } as React.CSSProperties
};

const BASE_DEFAULTS: EffectSettings = {
    autoPitch: { scale: 'C Major', speed: 0.02, active: true, harmony: false, reverb: 0 },
    parametricEQ: { bands: [], active: true, preamp: 0, reverb: 0 },
    compressor: { threshold: -24, ratio: 4, attack: 0.010, release: 0.25, knee: 30, makeup: 0, active: true },
    reverb: { time: 2.0, mix: 0.4, preDelay: 20, tone: 5000, size: 0.8, active: true },
    distortion: 0,
    delay: { time: 0.3, feedback: 0.3, mix: 0.3, active: true },
    eqLow: { gain: 0, active: false },
    eqMid: { gain: 0, active: false },
    eqHigh: { gain: 0, active: false },
    chorus: { rate: 1.5, depth: 0.5, mix: 0.5, active: false },
    tremolo: { rate: 5, depth: 0.5, active: false },
    stereoWidener: { width: 0.5, active: false },
    limiter: { threshold: -1, active: false },
    phaser: { rate: 0.5, depth: 0.5, active: false }
};

export default function App() {
  // State
  const [welcomeScreen, setWelcomeScreen] = useState(true);
  const [theme, setTheme] = useState<string>('dark');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<'cursor' | 'split'>('cursor');
  
  const [showEffectSelector, setShowEffectSelector] = useState(false);
  const [effectSelectorTrackId, setEffectSelectorTrackId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  
  const [audioState, setAudioState] = useState<AudioEngineState>({
    isPlaying: false,
    currentTime: 0,
    totalDuration: 120, 
    isRecording: false,
    bpm: 120,
    snapToGrid: true,
    metronomeOn: false,
    masterVolume: 0.8,
    loop: { active: false, start: 0, end: 4 }
  });

  const [openedEffect, setOpenedEffect] = useState<{ trackId: string, effectId: string } | null>(null);

  // References
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const playbackAnchorTimeRef = useRef<number>(0); 
  const rafRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);
  const playStartCursorRef = useRef<number>(0);

  // Dragging / Navigation State
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null); 
  const dragStartXRef = useRef<number>(0);
  const dragOriginalStartTimeRef = useRef<number>(0);
  
  // Collision Detection Constraints
  const dragConstraintsRef = useRef<{ min: number; max: number }>({ min: 0, max: Infinity });

  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const isDraggingTimelineRef = useRef(false);
  
  const isDraggingLoopStartRef = useRef(false);
  const isDraggingLoopEndRef = useRef(false);
  const isCreatingLoopRef = useRef(false);
  const loopStartAnchorRef = useRef(0);

  // --- Helpers ---
  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const pixelsPerSecond = BASE_PX_PER_SEC * zoomLevel;

  // --- Theme Toggle ---
  const toggleTheme = () => {
    const keys = Object.keys(THEMES);
    const currentIndex = keys.indexOf(theme);
    const nextIndex = (currentIndex + 1) % keys.length;
    setTheme(keys[nextIndex]);
  };

  // --- Real-time Mixing Logic ---
  useEffect(() => {
    const anySolo = tracks.some(t => t.solo);
    tracks.forEach(track => {
        let effectiveVolume = track.volume;
        if (track.muted) {
            effectiveVolume = 0;
        } else if (anySolo && !track.solo) {
            effectiveVolume = 0;
        }
        audioEngine.setTrackVolume(track.id, effectiveVolume);
    });
  }, [tracks]);

  // --- Project Management ---
  const saveProject = async () => {
    const zip = new JSZip();
    
    // Save Audio Blobs
    const audioFolder = zip.folder("audio");
    let clipIndex = 0;
    
    // Create a lean version of tracks for JSON (without blob/buffer objects)
    const tracksForJson = tracks.map(t => ({
        ...t,
        clips: t.clips.map(c => {
            const fileName = `clip_${clipIndex++}.wav`;
            if (c.blob && audioFolder) {
                audioFolder.file(fileName, c.blob);
            } else if (c.buffer && audioFolder) {
                 // Convert AudioBuffer to WAV blob for saving
                 // Note: Ideally we store original blob, but for generated clips we might need to encode.
                 // For now, let's assume blob exists or we skip (in production, need bufferToWav here)
            }
            return {
                ...c,
                fileName: fileName, // Link to file in zip
                blob: null,
                buffer: null
            };
        })
    }));

    const projectState = {
        tracks: tracksForJson,
        audioState
    };
    
    zip.file("project.json", JSON.stringify(projectState));
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "monochrome_project.zip");
  };

  const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        await audioEngine.resumeContext();
        handleStop();
        
        const zip = await JSZip.loadAsync(file);
        const projectJsonFile = zip.file("project.json");
        
        if (!projectJsonFile) {
            alert("Invalid project file");
            return;
        }

        const projectJson = await projectJsonFile.async("string");
        const projectData = JSON.parse(projectJson);
        const audioFolder = zip.folder("audio");

        const loadedTracks: Track[] = [];

        for (const trackData of projectData.tracks) {
            const clips: Clip[] = [];
            for (const clipData of trackData.clips) {
                if (clipData.fileName && audioFolder) {
                    const audioFile = audioFolder.file(clipData.fileName);
                    if (audioFile) {
                        const arrayBuffer = await audioFile.async("arraybuffer");
                        const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);
                        const blob = new Blob([arrayBuffer], { type: 'audio/wav' }); // Recreate blob
                        
                        clips.push({
                            ...clipData,
                            buffer: audioBuffer,
                            blob: blob
                        });
                    }
                }
            }
            loadedTracks.push({ ...trackData, clips });
        }

        setTracks(loadedTracks);
        setAudioState(prev => ({ ...prev, ...projectData.audioState, isPlaying: false }));
        setWelcomeScreen(false);

    } catch (err) {
        console.error("Failed to load project", err);
        alert("Error loading project file.");
    }
  };

  const exportWav = async () => {
      audioEngine.resumeContext();
      if(tracks.length === 0) return;
      const wavBlob = await audioEngine.renderOffline(tracks, audioState.totalDuration);
      saveAs(wavBlob, "mixdown.wav");
  };

  // --- Audio Actions ---
  const handleImportBeat = async (e: React.ChangeEvent<HTMLInputElement>, trackIdToAdd?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    audioEngine.resumeContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);
    const newClip: Clip = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        blob: file, 
        buffer: audioBuffer,
        duration: audioBuffer.duration,
        audioOffset: 0,
        startTime: 0,
    };
    if (trackIdToAdd) {
        setTracks(prev => prev.map(t => {
            if (t.id === trackIdToAdd) {
                const maxEnd = t.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
                newClip.startTime = maxEnd > 0 ? maxEnd + 1 : 0;
                return { ...t, clips: [...t.clips, newClip] }
            }
            return t;
        }));
    } else {
        const newTrack: Track = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          type: TrackType.BEAT,
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false,
          clips: [newClip],
          effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() },
          activeEffects: []
        };
        setTracks(prev => [...prev, newTrack]);
        setAudioState(prev => ({
            ...prev, 
            totalDuration: Math.max(prev.totalDuration, audioBuffer.duration + 10)
        }));
    }
  };

  const addNewTrack = () => {
      const newTrack: Track = {
          id: crypto.randomUUID(),
          name: `Faixa ${tracks.length + 1}`,
          type: TrackType.VOCAL,
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false,
          clips: [],
          effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() },
          activeEffects: []
      };
      setTracks(prev => [...prev, newTrack]);
  };

  const deleteTrack = (id: string) => {
      setTracks(prev => prev.filter(t => t.id !== id));
      if (selectedTrackId === id) setSelectedTrackId(null);
  };

  const editTrackName = (id: string) => {
      const track = tracks.find(t => t.id === id);
      if (!track) return;
      const newName = prompt("Nome da Faixa:", track.name);
      if (newName) {
          updateTrack(id, { name: newName });
      }
  };

  const splitTrack = () => {
    if (!selectedTrackId) return;
    const track = tracks.find(t => t.id === selectedTrackId);
    if (!track) return;
    const splitTime = audioState.currentTime;
    const clipToSplit = track.clips.find(c => splitTime > c.startTime && splitTime < (c.startTime + c.duration));
    if (!clipToSplit) return; 
    if (audioState.isPlaying) audioEngine.stopClip(clipToSplit.id);
    const relativeSplit = splitTime - clipToSplit.startTime;
    const leftClip: Clip = { ...clipToSplit, duration: relativeSplit };
    const rightClip: Clip = { ...clipToSplit, id: crypto.randomUUID(), startTime: splitTime, duration: clipToSplit.duration - relativeSplit, audioOffset: clipToSplit.audioOffset + relativeSplit, name: `${clipToSplit.name} (Part)` };
    setTracks(prev => prev.map(t => {
        if (t.id === track.id) {
            const otherClips = t.clips.filter(c => c.id !== clipToSplit.id);
            return { ...t, clips: [...otherClips, leftClip, rightClip] };
        }
        return t;
    }));
    setSelectedClipId(rightClip.id);
  };

  const deleteSelectedClip = () => {
      if (!selectedClipId || !selectedTrackId) return;
      if (audioState.isPlaying) audioEngine.stopClip(selectedClipId);
      setTracks(prev => prev.map(t => {
          if (t.id === selectedTrackId) return { ...t, clips: t.clips.filter(c => c.id !== selectedClipId) };
          return t;
      }));
      setSelectedClipId(null);
  };

  const toggleRecord = async () => {
    audioEngine.resumeContext();
    if (audioState.isRecording) {
      const blob = await audioEngine.stopRecording();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioEngine.decodeAudioData(arrayBuffer);
      const newClip: Clip = {
          id: crypto.randomUUID(),
          name: "Rec Take",
          blob: blob,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
          audioOffset: 0,
          startTime: recordingStartTimeRef.current,
      };
      const selectedTrack = tracks.find(t => t.id === selectedTrackId);
      if (selectedTrack && selectedTrack.type === TrackType.VOCAL) {
          setTracks(prev => prev.map(t => {
              if (t.id === selectedTrack.id) return { ...t, clips: [...t.clips, newClip] };
              return t;
          }));
      } else {
          const newTrack: Track = {
            id: crypto.randomUUID(),
            name: `Vocal Rec ${tracks.filter(t => t.type === TrackType.VOCAL).length + 1}`,
            type: TrackType.VOCAL,
            volume: 1.0,
            pan: 0,
            muted: false,
            solo: false,
            clips: [newClip],
            effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() },
            activeEffects: []
          };
          setTracks(prev => [...prev, newTrack]);
          setSelectedTrackId(newTrack.id);
      }
      setAudioState(prev => ({ ...prev, isRecording: false }));
    } else {
      try {
        await audioEngine.startRecording();
        recordingStartTimeRef.current = audioState.currentTime;
        setAudioState(prev => ({ ...prev, isRecording: true }));
        if (!audioState.isPlaying) togglePlay();
      } catch (err) {
        alert("Microphone error.");
      }
    }
  };

  const toggleLoop = () => {
    setAudioState(prev => ({ ...prev, loop: { ...prev.loop, active: !prev.loop.active } }));
  };

  const togglePlay = useCallback(() => {
    audioEngine.resumeContext();
    setAudioState(prev => {
        if (prev.isPlaying) {
            audioEngine.stopAll();
            cancelAnimationFrame(rafRef.current);
            return { ...prev, isPlaying: false, currentTime: playStartCursorRef.current };
        } else {
            playStartCursorRef.current = prev.currentTime;
            const startCursor = prev.currentTime;
            playbackAnchorTimeRef.current = audioEngine.currentTime - startCursor;
            audioEngine.startTransport(startCursor); // Start Metronome
            return { ...prev, isPlaying: true };
        }
    });
  }, []);

  const handleStop = () => {
       audioEngine.stopAll();
       cancelAnimationFrame(rafRef.current);
       setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  // --- Play Loop Animation ---
  useEffect(() => {
    if (audioState.isPlaying) {
        const loop = () => {
            const now = audioEngine.currentTime;
            let visualTime = now - playbackAnchorTimeRef.current;
            
            if (audioState.loop.active) {
                if (visualTime >= audioState.loop.end) {
                    audioEngine.stopAll();
                    visualTime = audioState.loop.start;
                    playbackAnchorTimeRef.current = now - audioState.loop.start;
                    audioEngine.startTransport(visualTime); // Restart metronome sync
                    playActiveSegments(visualTime);
                }
            } else if (visualTime >= audioState.totalDuration) {
               audioEngine.stopAll();
               setAudioState(prev => ({ ...prev, currentTime: 0, isPlaying: false }));
               cancelAnimationFrame(rafRef.current);
               return;
            }
            setAudioState(prev => ({ ...prev, currentTime: Math.max(0, visualTime) }));
            rafRef.current = requestAnimationFrame(loop);
        };
        playActiveSegments(audioState.currentTime);
        rafRef.current = requestAnimationFrame(loop);
    } else {
        cancelAnimationFrame(rafRef.current);
        audioEngine.stopAll();
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioState.isPlaying, audioState.loop]); 

  // Sync BPM and Metronome with Engine
  useEffect(() => {
      audioEngine.setBpm(audioState.bpm);
      audioEngine.setMetronomeStatus(audioState.metronomeOn);
  }, [audioState.bpm, audioState.metronomeOn]);

  const playActiveSegments = (startCursor: number) => {
    tracks.forEach(track => {
        track.clips.forEach(clip => {
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + clip.duration;
            if (clipEnd > startCursor) {
                if (clipStart >= startCursor) {
                    audioEngine.playClip(clip, track, playbackAnchorTimeRef.current + clipStart, 0);
                } else {
                    const offset = startCursor - clipStart;
                    audioEngine.playClip(clip, track, audioEngine.currentTime, offset);
                }
            }
        });
      });
  };

  const handleZoom = (direction: 'in' | 'out') => {
      setZoomLevel(prev => {
          const newZoom = direction === 'in' ? Math.min(5, prev + 0.2) : Math.max(0.2, prev - 0.2);
          if (scrollContainerRef.current) {
              const containerWidth = scrollContainerRef.current.offsetWidth;
              const playheadX = audioState.currentTime * (BASE_PX_PER_SEC * newZoom);
              setTimeout(() => {
                  if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollLeft = playheadX - (containerWidth / 2);
                  }
              }, 0);
          }
          return newZoom;
      });
  };

  const updateTrack = (id: string, updates: Partial<Track>) => {
    setTracks(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, ...updates };
        if (audioState.isPlaying) {
            audioEngine.updateTrackSettings(updated);
        }
        return updated;
      }
      return t;
    }));
  };

  const updateEffects = (id: string, updates: Partial<Track['effects']>) => {
      setTracks(prev => prev.map(t => {
          if (t.id === id) {
              const updated = { ...t, effects: { ...t.effects, ...updates } };
              audioEngine.updateTrackSettings(updated);
              return updated;
          }
          return t;
      }));
  };

  const addEffect = (trackId: string, effectName: string) => {
     setTracks(prev => prev.map(t => {
         if (t.id === trackId && !t.activeEffects.includes(effectName)) {
             const updatedTrack = { ...t, activeEffects: [...t.activeEffects, effectName] };
             audioEngine.rebuildTrackEffects(updatedTrack);
             return updatedTrack;
         }
         return t;
     }));
     setOpenedEffect({ trackId, effectId: effectName });
     setShowEffectSelector(false); // Close modal
  };

  // --- UI Interactions ---
  const handleClipMouseDown = (e: React.MouseEvent, trackId: string, clipId: string) => {
      if (e.button !== 0 || activeTool === 'split') return; 
      e.stopPropagation(); e.preventDefault();
      
      const track = tracks.find(t => t.id === trackId);
      const clip = track?.clips.find(c => c.id === clipId);
      if (!track || !clip) return;

      // 1. Calcular Limites de Colisão
      // Pega todos os clipes dessa faixa, exceto o que estamos movendo
      const otherClips = track.clips.filter(c => c.id !== clipId).sort((a, b) => a.startTime - b.startTime);
      
      // Encontra o clip imediatamente anterior
      const prevClip = otherClips.filter(c => c.startTime + c.duration <= clip.startTime).pop();
      // Encontra o clip imediatamente posterior
      const nextClip = otherClips.find(c => c.startTime >= clip.startTime + clip.duration);

      const minTime = prevClip ? prevClip.startTime + prevClip.duration : 0;
      const maxTime = nextClip ? nextClip.startTime - clip.duration : Infinity;

      dragConstraintsRef.current = { min: minTime, max: maxTime };

      setDraggingClipId(clipId); setDraggingTrackId(trackId);
      dragStartXRef.current = e.clientX; 
      dragOriginalStartTimeRef.current = clip.startTime;
      setSelectedTrackId(trackId); setSelectedClipId(clipId);
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!scrollContainerRef.current) return;
          const rect = scrollContainerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
          const t = Math.max(0, x / pixelsPerSecond);

          // Loop Dragging Logic
          if (isDraggingLoopStartRef.current) { 
              let newStart = Math.min(t, audioState.loop.end - 0.1);
              if (audioState.snapToGrid) {
                 const spb = 60 / audioState.bpm;
                 newStart = Math.round(newStart / (spb/4)) * (spb/4);
                 newStart = Math.min(newStart, audioState.loop.end - 0.1);
              }
              setAudioState(p => ({ ...p, loop: { ...p.loop, start: newStart, active: true } })); 
              return; 
          }
          
          if (isDraggingLoopEndRef.current) { 
              let newEnd = Math.max(t, audioState.loop.start + 0.1);
              if (audioState.snapToGrid) {
                 const spb = 60 / audioState.bpm;
                 newEnd = Math.round(newEnd / (spb/4)) * (spb/4);
                 newEnd = Math.max(newEnd, audioState.loop.start + 0.1);
              }
              setAudioState(p => ({ ...p, loop: { ...p.loop, end: newEnd, active: true } })); 
              return; 
          }

          if (isCreatingLoopRef.current) { 
            const s = Math.min(loopStartAnchorRef.current, t); 
            const end = Math.max(loopStartAnchorRef.current, t); 
            setAudioState(p => ({ ...p, loop: { ...p.loop, start: s, end, active: true } })); 
            return; 
          }
          
          if (isScrubbingRef.current) { setAudioState(prev => ({ ...prev, currentTime: t })); return; }

          // --- LOGICA DE ARRASTO COM COLISÃO ---
          if (draggingClipId && draggingTrackId && activeTool === 'cursor') {
              const deltaX = e.clientX - dragStartXRef.current;
              const deltaSeconds = deltaX / pixelsPerSecond;
              let newStartTime = dragOriginalStartTimeRef.current + deltaSeconds;
              
              if (audioState.snapToGrid) { 
                  const spb = 60 / audioState.bpm; 
                  newStartTime = Math.round(newStartTime / (spb/4)) * (spb/4); 
              }
              
              // Clamping para evitar sobreposição usando os limites calculados no MouseDown
              newStartTime = Math.max(
                  Math.max(0, dragConstraintsRef.current.min), 
                  Math.min(newStartTime, dragConstraintsRef.current.max)
              );

              setTracks(prev => prev.map(t => {
                  if (t.id === draggingTrackId) {
                      return { ...t, clips: t.clips.map(c => c.id === draggingClipId ? { ...c, startTime: newStartTime } : c) };
                  }
                  return t;
              }));
          }
      };
      const handleMouseUp = () => {
          if (isScrubbingRef.current) { isScrubbingRef.current = false; if (wasPlayingRef.current) togglePlay(); }
          isDraggingLoopStartRef.current = false; isDraggingLoopEndRef.current = false; isCreatingLoopRef.current = false;
          if (draggingClipId) {
              if (audioState.isPlaying && draggingTrackId) {
                   audioEngine.stopClip(draggingClipId);
                   const track = tracks.find(t => t.id === draggingTrackId);
                   const clip = track?.clips.find(c => c.id === draggingClipId);
                   if (track && clip) {
                       const now = audioState.currentTime;
                       if (now >= clip.startTime && now < clip.startTime + clip.duration) audioEngine.playClip(clip, track, audioEngine.currentTime, now - clip.startTime);
                   }
              }
              setDraggingClipId(null); setDraggingTrackId(null);
          }
          isDraggingTimelineRef.current = false;
      };
      window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [draggingClipId, draggingTrackId, pixelsPerSecond, audioState.isPlaying, audioState.snapToGrid, audioState.bpm, tracks, togglePlay, audioState.loop.start, audioState.loop.end]);

  // --- Components ---
  const { Ruler, GridLines } = useMemo(() => {
      const secondsPerBeat = 60 / audioState.bpm;
      const secondsPerBar = secondsPerBeat * 4; 
      const totalBars = Math.ceil(audioState.totalDuration / secondsPerBar);
      const markers = []; const gridLines = [];
      for(let i = 0; i < totalBars; i++) {
          const left = i * secondsPerBar * pixelsPerSecond;
          markers.push(<div key={i} className="absolute top-0 bottom-0 border-l border-[var(--border-color)] text-[10px] text-[var(--text-muted)] pl-2 select-none flex items-center h-1/2 font-mono z-10" style={{ left }}>{i + 1}</div>);
          gridLines.push(<div key={`grid-${i}`} className="absolute top-0 bottom-0 border-l border-[var(--border-color)] opacity-20 pointer-events-none" style={{ left, height: '100%' }} />);
          // Sub-beats (fainter)
          for(let j=1; j<4; j++) {
             gridLines.push(<div key={`grid-${i}-${j}`} className="absolute top-0 bottom-0 border-l border-[var(--border-color)] opacity-10 pointer-events-none" style={{ left: left + (j * secondsPerBeat * pixelsPerSecond), height: '100%' }} />);
          }
      }
      return { Ruler: markers, GridLines: gridLines };
  }, [audioState.bpm, audioState.totalDuration, pixelsPerSecond]);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  // --- Render ---
  return (
    <div 
        className="flex flex-col h-screen w-full bg-[var(--bg-main)] text-[var(--text-main)] font-sans selection:bg-[var(--accent)] selection:text-black overflow-hidden relative transition-colors duration-300"
        style={THEMES[theme] as React.CSSProperties}
    >
      
      {/* Modals */}
      {showEffectSelector && effectSelectorTrackId && (
          <EffectSelector 
              onSelect={(effectId) => addEffect(effectSelectorTrackId, effectId)}
              onClose={() => { setShowEffectSelector(false); setEffectSelectorTrackId(null); }}
          />
      )}

      {/* Welcome Screen */}
      {welcomeScreen && (
          <div className="fixed inset-0 z-[100] bg-[var(--bg-main)] flex flex-col items-center justify-center animate-fade-in text-center">
             <div className="w-24 h-24 bg-[var(--accent)] rounded-full flex items-center justify-center mb-8 shadow-2xl animate-pulse">
                <Music className="w-12 h-12 text-black" />
             </div>
             <h1 className="text-6xl font-black tracking-tighter mb-4 text-[var(--text-main)]">MONOCHROME</h1>
             <p className="text-xl text-[var(--text-muted)] font-light tracking-widest mb-12 uppercase">Professional Web DAW</p>
             <div className="flex gap-4">
                 <button onClick={() => setWelcomeScreen(false)} className="px-10 py-4 bg-[var(--text-main)] text-[var(--bg-main)] font-bold tracking-widest hover:bg-[var(--accent)] hover:text-black transition-colors shadow-2xl uppercase">
                     Enter Studio
                 </button>
                 <label className="px-10 py-4 border border-[var(--text-main)] text-[var(--text-main)] font-bold tracking-widest hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-2xl uppercase cursor-pointer flex items-center gap-2">
                     <FolderOpen className="w-5 h-5" /> Load Project
                     <input type="file" accept=".zip" className="hidden" onChange={handleLoadProject} />
                 </label>
             </div>
          </div>
      )}

      {/* FULL SCREEN EFFECT OVERLAY */}
      {openedEffect && tracks.find(t => t.id === openedEffect.trackId) && (
          <div className="fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-col animate-in fade-in duration-200">
              {/* Header */}
              <div className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-6 bg-[var(--bg-panel)] shrink-0">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setOpenedEffect(null)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors uppercase text-xs font-bold tracking-widest border border-[var(--border-color)] px-3 py-1.5 rounded hover:border-[var(--text-muted)]">
                          <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <div className="h-6 w-[1px] bg-[var(--border-color)]"></div>
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-[var(--text-main)] uppercase tracking-tight leading-none">{openedEffect.effectId}</span>
                        <span className="text-[10px] text-[var(--accent)] uppercase tracking-widest font-bold">
                            {tracks.find(t => t.id === openedEffect.trackId)?.name}
                        </span>
                      </div>
                  </div>
              </div>
              
              {/* Content Area */}
              <div className="flex-1 overflow-hidden relative">
                  {(() => {
                      const track = tracks.find(t => t.id === openedEffect.trackId)!;
                      const fx = openedEffect.effectId;
                      const plugin = EffectRegistry.get(fx);
                      if (plugin) {
                          const PluginComponent = plugin.component;
                          return <PluginComponent trackId={track.id} settings={track.effects[fx] || plugin.defaultSettings} onChange={(newSettings) => updateEffects(track.id, { [fx]: newSettings })} />;
                      }
                      if (fx === 'parametricEQ') return <ParametricEQ trackId={track.id} settings={track.effects.parametricEQ} onChange={(newSettings) => updateEffects(track.id, { parametricEQ: { ...track.effects.parametricEQ, ...newSettings } })} />;
                      if (fx === 'compressor') return <CompressorEffect trackId={track.id} settings={track.effects.compressor} onChange={(newSettings) => updateEffects(track.id, { compressor: newSettings })} />;
                      if (fx === 'reverb') return <ReverbEffect trackId={track.id} settings={track.effects.reverb} onChange={(newSettings) => updateEffects(track.id, { reverb: newSettings })} />;
                      if (fx === 'autoPitch') return <TunerEffect trackId={track.id} settings={track.effects.autoPitch} onChange={(newSettings) => updateEffects(track.id, { autoPitch: newSettings })} />;
                      if (fx === 'distortion') return <div className="w-full h-full flex items-center justify-center bg-black"><DistortionEffect value={track.effects.distortion} onChange={(v) => updateEffects(track.id, { distortion: v })} /></div>;
                      if (fx === 'delay') return <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-8 border border-zinc-800 m-8 rounded-xl"><h2 className="text-2xl text-zinc-500 tracking-widest font-bold">DIGITAL DELAY</h2><div className="flex gap-12"><Knob value={track.effects.delay.time} min={0} max={1} onChange={(v) => updateEffects(track.id, { delay: { ...track.effects.delay, time: v } })} label="TIME" /><Knob value={track.effects.delay.feedback} min={0} max={0.9} onChange={(v) => updateEffects(track.id, { delay: { ...track.effects.delay, feedback: v } })} label="FEEDBACK" /><Knob value={track.effects.delay.mix} min={0} max={1} onChange={(v) => updateEffects(track.id, { delay: { ...track.effects.delay, mix: v } })} label="MIX" /></div></div>;
                      return <div className="w-full h-full flex items-center justify-center text-zinc-600">Effect GUI Not Available</div>;
                  })()}
              </div>
          </div>
      )}

      {/* Main Transport & Workspace */}
      <header className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-6 bg-[var(--bg-panel)] shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-3 w-1/4">
          <div className="w-8 h-8 bg-[var(--accent)] rounded flex items-center justify-center shadow-lg">
            <Music className="text-[var(--bg-main)] w-5 h-5 fill-current" />
          </div>
          <h1 className="font-bold text-lg tracking-tight hidden md:block text-[var(--text-main)] font-sans">MONOCHROME</h1>
        </div>
        
        {/* Central Transport Capsule */}
        <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-center gap-6">
                
                {/* BPM & Metronome Controls */}
                <div className="flex items-center gap-2 bg-[var(--bg-element)] rounded-lg px-2 py-1 border border-[var(--border-color)]">
                    <div className="flex flex-col items-center">
                        <span className="text-[8px] font-bold text-[var(--text-muted)] tracking-wider">BPM</span>
                        <input 
                            type="number" 
                            value={audioState.bpm} 
                            onChange={(e) => setAudioState(p => ({ ...p, bpm: Math.max(40, Math.min(300, parseInt(e.target.value))) }))}
                            className="w-10 bg-transparent text-[var(--accent)] font-mono text-center text-xs font-bold outline-none"
                        />
                    </div>
                    <div className="h-6 w-[1px] bg-[var(--border-color)] mx-1"></div>
                    <button 
                        onClick={() => setAudioState(p => ({ ...p, metronomeOn: !p.metronomeOn }))}
                        className={`p-1.5 rounded transition-all ${audioState.metronomeOn ? 'bg-[var(--accent)] text-black shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        title="Metronome"
                    >
                        <Activity className="w-4 h-4" />
                    </button>
                </div>

                <div className="bg-[var(--bg-element)] rounded-full px-2 py-1.5 flex items-center gap-2 border border-[var(--border-color)] shadow-inner">
                    <button onClick={handleStop} className="p-2 hover:bg-[var(--bg-main)] rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"><Square className="w-4 h-4 fill-current" /></button>
                    <button onClick={togglePlay} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${audioState.isPlaying ? 'bg-[var(--accent)] text-black shadow-lg' : 'bg-[var(--bg-panel)] text-[var(--text-main)] hover:bg-[var(--bg-main)] border border-[var(--border-color)]'}`}>
                        {audioState.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                    </button>
                    <button onClick={toggleRecord} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${audioState.isRecording ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-[var(--bg-element)] border-[var(--border-color)] text-red-500 hover:text-red-400'}`}>
                        <div className={`w-3 h-3 rounded-full ${audioState.isRecording ? 'bg-white' : 'bg-current'}`}></div>
                    </button>
                </div>
                <div className="flex flex-col items-center justify-center h-10 w-28 bg-[var(--bg-main)] border border-[var(--border-color)] rounded text-center shadow-inner">
                     <span className="font-mono text-xl text-[var(--accent)] leading-none mt-1">{formatTime(audioState.currentTime)}</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-3 justify-end w-1/4">
            <button onClick={toggleTheme} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title={`Theme: ${theme.toUpperCase()}`}><Palette className="w-5 h-5" /></button>
            <div className="h-6 w-[1px] bg-[var(--border-color)] mx-2"></div>
            
            <label className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer" title="Load Project">
                <FolderOpen className="w-5 h-5" />
                <input type="file" accept=".zip" className="hidden" onChange={handleLoadProject} />
            </label>
            <button onClick={saveProject} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Save Project"><Save className="w-5 h-5" /></button>
            <button onClick={exportWav} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Export WAV"><Download className="w-5 h-5" /></button>
            <div className="h-6 w-[1px] bg-[var(--border-color)] mx-2"></div>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 border border-[var(--border-color)] rounded ${isSidebarOpen ? 'bg-[var(--bg-element)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}><PanelRightClose className="w-4 h-4" /></button>
            <label className="bg-[var(--bg-element)] border border-[var(--border-color)] px-3 py-1.5 rounded text-xs font-bold cursor-pointer text-[var(--text-main)] hover:border-[var(--text-muted)] transition-colors">IMPORT<input type="file" accept="audio/*" className="hidden" onChange={(e) => handleImportBeat(e)} /></label>
            <button onClick={addNewTrack} className="bg-[var(--text-main)] text-[var(--bg-main)] px-3 py-1.5 rounded text-xs font-bold hover:bg-[var(--accent)] hover:text-black transition-colors shadow-lg">+ TRACK</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col bg-[var(--bg-main)] relative overflow-hidden">
             
             {/* Timeline Toolbar */}
             <div className="h-10 border-b border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-shrink-0 items-center justify-between px-4">
                 <div className="w-48 text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Arrangement
                 </div>
                 <div className="flex items-center gap-1 bg-[var(--bg-element)] p-1 rounded-lg border border-[var(--border-color)]">
                    <button onClick={() => setActiveTool('cursor')} className={`p-1.5 rounded ${activeTool === 'cursor' ? 'bg-[var(--bg-main)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`} title="Cursor Tool"><MousePointer2 className="w-4 h-4" /></button>
                    <button onClick={() => { setActiveTool('split'); splitTrack(); setTimeout(()=>setActiveTool('cursor'), 200); }} className={`p-1.5 rounded ${activeTool === 'split' ? 'bg-[var(--bg-main)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`} title="Split Tool"><Scissors className="w-4 h-4" /></button>
                    <div className="w-[1px] h-4 bg-[var(--border-color)] mx-1"></div>
                    <button onClick={() => setAudioState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }))} className={`p-1.5 rounded ${audioState.snapToGrid ? 'bg-[var(--accent)] text-black shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`} title="Snap to Grid"><Magnet className="w-4 h-4" /></button>
                    <button onClick={toggleLoop} className={`p-1.5 rounded ${audioState.loop.active ? 'bg-[var(--accent)] text-black shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`} title="Loop Mode"><Repeat className="w-4 h-4" /></button>
                    
                    {selectedClipId && <button onClick={deleteSelectedClip} className="p-1.5 rounded text-red-500 hover:bg-red-900/20 ml-2"><Trash2 className="w-4 h-4" /></button>}
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => handleZoom('out')} className="p-1 hover:text-[var(--text-main)] text-[var(--text-muted)]"><ZoomOut className="w-4 h-4" /></button>
                    <button onClick={() => handleZoom('in')} className="p-1 hover:text-[var(--text-main)] text-[var(--text-muted)]"><ZoomIn className="w-4 h-4" /></button>
                 </div>
             </div>

             <div className="flex flex-1 relative overflow-hidden">
                {/* Track List (Left) */}
                <div className="w-48 bg-[var(--bg-panel)] border-r border-[var(--border-color)] overflow-hidden shadow-2xl z-20 flex flex-col">
                    <div className="flex-1 space-y-[1px]" style={{ transform: `translateY(-${scrollTop}px)` }}>
                        {tracks.map(track => (
                            <div key={track.id} onClick={() => setSelectedTrackId(track.id)} className={`h-28 flex-shrink-0 px-3 py-3 flex flex-col justify-between border-b border-[var(--border-color)] cursor-pointer group transition-colors relative ${selectedTrackId === track.id ? 'bg-[var(--bg-element)] border-l-4 border-l-[var(--accent)]' : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-element)] border-l-4 border-l-transparent'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col overflow-hidden">
                                        <span className={`font-bold text-sm truncate w-24 ${selectedTrackId === track.id ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`} onDoubleClick={() => editTrackName(track.id)}>{track.name}</span>
                                        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">{track.type}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteTrack(track.id) }} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-opacity"><XCircle className="w-3 h-3" /></button>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <Volume2 className="w-3 h-3 text-[var(--text-muted)]" />
                                    <div className="h-1 flex-1 bg-[var(--bg-main)] rounded-full overflow-hidden">
                                        <div className="h-full bg-[var(--text-muted)]" style={{ width: `${track.volume * 100}%` }}></div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-1">
                                    <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} className={`text-[9px] font-bold w-6 h-6 rounded flex items-center justify-center border transition-all ${track.muted ? 'bg-red-500/10 text-red-500 border-red-500' : 'bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--text-muted)]'}`}>M</button>
                                    <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} className={`text-[9px] font-bold w-6 h-6 rounded flex items-center justify-center border transition-all ${track.solo ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--text-muted)]'}`}>S</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Timeline Grid (Right) */}
                <div className="flex-1 overflow-auto bg-[var(--bg-main)] relative custom-scrollbar" ref={scrollContainerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                    <div className="relative" style={{ minWidth: `${audioState.totalDuration * pixelsPerSecond}px`, minHeight: '100%' }}>
                        <div className="absolute inset-0 z-0 opacity-40">{GridLines}</div>
                        {/* Playhead Ruler */}
                        <div className="h-6 w-full border-b border-[var(--border-color)] bg-[var(--bg-panel)]/95 backdrop-blur-sm sticky top-0 z-50 flex items-center" 
                            onMouseDown={(e) => {
                                if ((e.target as HTMLElement).classList.contains('loop-handle')) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
                                const t = x / pixelsPerSecond;
                                if(e.shiftKey) { isCreatingLoopRef.current = true; loopStartAnchorRef.current = t; setAudioState(p => ({...p, loop: {...p.loop, active: true, start: t, end: t}})); } 
                                else { isScrubbingRef.current = true; wasPlayingRef.current = audioState.isPlaying; if (audioState.isPlaying) togglePlay(); setAudioState(p => ({...p, currentTime: t})); }
                            }}
                        >
                            {Ruler}
                            
                            {/* Loop Region Visualization & Handles */}
                            {audioState.loop.active && (
                                <>
                                    {/* Region Highlight */}
                                    <div className="absolute top-0 h-full bg-[var(--accent)]/10 border-t-2 border-[var(--accent)] pointer-events-none" style={{ left: audioState.loop.start * pixelsPerSecond, width: (audioState.loop.end - audioState.loop.start) * pixelsPerSecond }} />
                                    
                                    {/* Loop Start Handle */}
                                    <div 
                                        className="absolute top-0 h-6 w-4 -ml-2 cursor-ew-resize z-50 group loop-handle" 
                                        style={{ left: audioState.loop.start * pixelsPerSecond }}
                                        onMouseDown={(e) => { e.stopPropagation(); isDraggingLoopStartRef.current = true; }}
                                    >
                                        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[var(--accent)] hover:scale-110 transition-transform"></div>
                                        <div className="w-[1px] h-full bg-[var(--accent)] mx-auto"></div>
                                    </div>

                                    {/* Loop End Handle */}
                                    <div 
                                        className="absolute top-0 h-6 w-4 -ml-2 cursor-ew-resize z-50 group loop-handle" 
                                        style={{ left: audioState.loop.end * pixelsPerSecond }}
                                        onMouseDown={(e) => { e.stopPropagation(); isDraggingLoopEndRef.current = true; }}
                                    >
                                        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[var(--accent)] hover:scale-110 transition-transform"></div>
                                        <div className="w-[1px] h-full bg-[var(--accent)] mx-auto"></div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Tracks Lane */}
                        <div className="space-y-[1px] relative z-10">
                            {tracks.map(track => (
                                <div key={track.id} className={`h-28 flex-shrink-0 relative border-b border-[var(--border-color)] group ${track.muted ? 'opacity-40 grayscale' : ''}`}>
                                    {track.clips.map(clip => (
                                        <div key={clip.id} onMouseDown={(e) => handleClipMouseDown(e, track.id, clip.id)} className={`absolute top-2 bottom-2 rounded-md overflow-hidden cursor-move border transition-all shadow-md ${selectedClipId === clip.id ? 'border-[var(--text-main)] bg-[var(--waveform-bg)] z-30 shadow-xl' : 'border-[var(--border-color)] bg-[var(--bg-element)] z-10 hover:border-[var(--text-muted)]'}`} style={{ left: `${clip.startTime * pixelsPerSecond}px`, width: `${clip.duration * pixelsPerSecond}px` }}>
                                            <div className="w-full h-full opacity-80 pointer-events-none p-1"><Waveform buffer={clip.buffer} color={selectedClipId === clip.id ? "bg-[var(--waveform-wave)]" : "bg-[var(--text-muted)]"} start={clip.audioOffset} duration={clip.duration} /></div>
                                            <div className="absolute top-0 left-0 w-full px-2 py-0.5 bg-gradient-to-b from-black/50 to-transparent text-[9px] font-bold text-white truncate pointer-events-none">{clip.name}</div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Playhead */}
                        <div className="absolute top-0 bottom-0 z-50 pointer-events-none" style={{ left: `${audioState.currentTime * pixelsPerSecond}px` }}>
                            <div className="w-[1px] bg-[var(--text-main)] h-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                            <div className="w-3 h-3 bg-[var(--text-main)] rotate-45 transform -translate-x-[5px] -translate-y-[6px] absolute top-6" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Sidebar (Mixer) */}
        {isSidebarOpen && (
            <div className="w-80 bg-[var(--bg-panel)] border-l border-[var(--border-color)] flex flex-col shrink-0 z-20 shadow-2xl">
                <div className="h-10 border-b border-[var(--border-color)] flex items-center justify-between px-4 font-bold text-[10px] tracking-widest text-[var(--text-muted)] bg-[var(--bg-panel)] uppercase">
                    <span className="flex items-center gap-2"><Settings2 className="w-3 h-3" /> Channel Strip</span>
                    <button onClick={() => setIsSidebarOpen(false)} className="hover:text-[var(--text-main)]"><PanelRightClose className="w-3 h-3" /></button>
                </div>
                
                {selectedTrack ? (
                    <div className="flex-1 p-6 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                        <div className="text-center pb-6 border-b border-[var(--border-color)]">
                            <h2 className="text-2xl font-black text-[var(--text-main)] mb-1 truncate cursor-pointer hover:text-[var(--accent)] transition-colors tracking-tight" onClick={() => editTrackName(selectedTrack.id)}>{selectedTrack.name}</h2>
                            <span className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest px-2 py-1 bg-[var(--accent)]/10 rounded border border-[var(--accent)]/20">{selectedTrack.type} TRACK</span>
                        </div>
                        
                        {/* Basic Controls */}
                        <div className="space-y-8">
                            <div className="flex justify-center">
                                <Knob label="PAN" min={-1} max={1} value={selectedTrack.pan} onChange={(val) => updateTrack(selectedTrack.id, { pan: val })} />
                            </div>
                            <div className="space-y-2 bg-[var(--bg-element)] p-4 rounded-lg border border-[var(--border-color)]">
                                <div className="flex justify-between text-xs text-[var(--text-muted)] font-bold tracking-wider"><span>FADER</span><span>{(selectedTrack.volume * 100).toFixed(0)}%</span></div>
                                <input type="range" min="0" max="1" step="0.01" value={selectedTrack.volume} onChange={(e) => updateTrack(selectedTrack.id, { volume: parseFloat(e.target.value) })} className="w-full accent-[var(--text-main)] h-1 bg-[var(--bg-main)] rounded-lg appearance-none cursor-pointer" />
                            </div>
                        </div>

                        {/* Inserts Rack */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1"><Disc className="w-3 h-3" /> INSERTS CHAIN</h3>
                                <button 
                                    onClick={() => { setEffectSelectorTrackId(selectedTrack.id); setShowEffectSelector(true); }}
                                    className="text-[10px] bg-[var(--accent)] text-black font-bold px-3 py-1 rounded-full flex gap-1 items-center hover:bg-white transition-colors shadow-lg shadow-[var(--accent)]/20"
                                >
                                    <Plus className="w-3 h-3" /> FX
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-2 min-h-[100px]">
                                {selectedTrack.activeEffects.length === 0 && (
                                    <div className="text-center py-8 border-2 border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest">
                                        Empty Chain
                                    </div>
                                )}
                                {selectedTrack.activeEffects.map((effectId, index) => (
                                    <div key={`${effectId}-${index}`} className="group bg-[var(--bg-element)] border border-[var(--border-color)] rounded-md p-2 pl-3 flex items-center justify-between hover:border-[var(--text-muted)] transition-all shadow-sm relative overflow-hidden">
                                        {/* Status Indicator Bar */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent)]"></div>
                                        
                                        <span className="text-xs font-bold text-[var(--text-main)] uppercase cursor-pointer flex-1 truncate hover:text-[var(--accent)]" onClick={() => setOpenedEffect({ trackId: selectedTrack.id, effectId })}>
                                            {/* Try to resolve name from registry, else use ID */}
                                            {EffectRegistry.get(effectId)?.name || effectId}
                                        </span>
                                        <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setOpenedEffect({ trackId: selectedTrack.id, effectId })} className="p-1 hover:bg-[var(--bg-main)] rounded"><SlidersHorizontal className="w-3 h-3 text-[var(--text-muted)]" /></button>
                                            <button onClick={() => { 
                                                setTracks(p => p.map(t => {
                                                    if (t.id === selectedTrack.id) {
                                                        const updatedTrack = {...t, activeEffects: t.activeEffects.filter((_, i) => i !== index)};
                                                        audioEngine.rebuildTrackEffects(updatedTrack);
                                                        return updatedTrack;
                                                    }
                                                    return t;
                                                }));
                                            }} className="p-1 hover:bg-red-900/30 rounded"><Trash2 className="w-3 h-3 text-[var(--text-muted)] hover:text-red-500" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
                        <div className="w-16 h-16 rounded-full bg-[var(--bg-element)] flex items-center justify-center mb-4">
                            <Settings2 className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-xs uppercase font-bold tracking-widest">No Track Selected</p>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
}