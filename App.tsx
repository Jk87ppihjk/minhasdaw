import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Square, Mic, Upload, Music, Layers, Settings2, Trash2, Plus, ZoomIn, ZoomOut, Magnet, SlidersHorizontal, Scissors, PanelRightClose, PanelRightOpen, MousePointer2, XCircle, Download, Save, Edit2, ArrowLeft, MoreVertical, Volume2, Disc, Repeat } from 'lucide-react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { audioEngine } from './services/AudioEngine';
import { Track, TrackType, AudioEngineState, Clip, EffectSettings } from './types';
import { EffectRegistry } from './services/EffectRegistry'; // Import Registry
import { Waveform } from './components/Waveform';
import { Knob } from './components/Knob';
import { EffectSelector } from './components/EffectSelector'; // Importar o novo seletor
import { ParametricEQ } from './components/effects/ParametricEQ';
import { CompressorEffect } from './components/effects/CompressorEffect';
import { ReverbEffect } from './components/effects/ReverbEffect';
import { TunerEffect } from './components/effects/TunerEffect';
import { DistortionEffect } from './components/effects/DistortionEffect'; 

// --- Constants ---
const BASE_PX_PER_SEC = 50;

// Clean default effects, focusing on Desert Suite + Registry Merging
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
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<'cursor' | 'split'>('cursor');
  
  // New State for Effect Selector
  const [showEffectSelector, setShowEffectSelector] = useState(false);
  const [effectSelectorTrackId, setEffectSelectorTrackId] = useState<string | null>(null);
  
  // Scroll Sync State
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

  // Effect View State (Full Screen)
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
  
  const isDraggingTimelineRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  
  // Loop Handles Refs
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
    const projectState = {
        tracks: tracks.map(t => ({
            ...t,
            clips: t.clips.map(c => ({ ...c, buffer: null, blob: null })) 
        })),
        audioState
    };
    zip.file("project.json", JSON.stringify(projectState));
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "monochrome_project.zip");
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
      setDraggingClipId(clipId); setDraggingTrackId(trackId);
      dragStartXRef.current = e.clientX; dragOriginalStartTimeRef.current = clip.startTime;
      setSelectedTrackId(trackId); setSelectedClipId(clipId);
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!scrollContainerRef.current) return;
          const rect = scrollContainerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
          const t = Math.max(0, x / pixelsPerSecond);

          // Loop Dragging Logic (Now includes Snap)
          if (isDraggingLoopStartRef.current) { 
              let newStart = Math.min(t, audioState.loop.end - 0.1);
              if (audioState.snapToGrid) {
                 const spb = 60 / audioState.bpm;
                 newStart = Math.round(newStart / (spb/4)) * (spb/4);
                 // Ensure we don't snap past the end
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
                 // Ensure we don't snap before the start
                 newEnd = Math.max(newEnd, audioState.loop.start + 0.1);
              }
              setAudioState(p => ({ ...p, loop: { ...p.loop, end: newEnd, active: true } })); 
              return; 
          }

          if (isCreatingLoopRef.current) { const s = Math.min(loopStartAnchorRef.current, t); const end = Math.max(loopStartAnchorRef.current, t); setAudioState(p => ({ ...p, loop: { ...p.loop, start: s, end, active: true } })); return; }
          if (isScrubbingRef.current) { setAudioState(prev => ({ ...prev, currentTime: t })); return; }

          if (draggingClipId && draggingTrackId && activeTool === 'cursor') {
              const deltaX = e.clientX - dragStartXRef.current;
              const deltaSeconds = deltaX / pixelsPerSecond;
              let newStartTime = dragOriginalStartTimeRef.current + deltaSeconds;
              if (audioState.snapToGrid) { const spb = 60 / audioState.bpm; newStartTime = Math.round(newStartTime / (spb/4)) * (spb/4); }
              newStartTime = Math.max(0, newStartTime);
              setTracks(prev => prev.map(t => {
                  if (t.id === draggingTrackId) return { ...t, clips: t.clips.map(c => c.id === draggingClipId ? { ...c, startTime: newStartTime } : c) };
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
          markers.push(<div key={i} className="absolute top-0 bottom-0 border-l border-zinc-800 text-[10px] text-zinc-500 pl-2 select-none flex items-center h-1/2 font-mono z-10" style={{ left }}>{i + 1}</div>);
          gridLines.push(<div key={`grid-${i}`} className="absolute top-0 bottom-0 border-l border-zinc-900 pointer-events-none" style={{ left, height: '100%' }} />);
          // Sub-beats (fainter)
          for(let j=1; j<4; j++) {
             gridLines.push(<div key={`grid-${i}-${j}`} className="absolute top-0 bottom-0 border-l border-zinc-900/50 pointer-events-none" style={{ left: left + (j * secondsPerBeat * pixelsPerSecond), height: '100%' }} />);
          }
      }
      return { Ruler: markers, GridLines: gridLines };
  }, [audioState.bpm, audioState.totalDuration, pixelsPerSecond]);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  // --- Render ---
  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-zinc-200 font-sans selection:bg-desert-500 selection:text-black overflow-hidden relative">
      
      {/* Modals */}
      {showEffectSelector && effectSelectorTrackId && (
          <EffectSelector 
              onSelect={(effectId) => addEffect(effectSelectorTrackId, effectId)}
              onClose={() => { setShowEffectSelector(false); setEffectSelectorTrackId(null); }}
          />
      )}

      {/* Welcome Screen */}
      {welcomeScreen && (
          <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center animate-fade-in text-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black">
             <div className="w-24 h-24 bg-desert-500 rounded-full flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(230,194,0,0.3)] animate-pulse">
                <Music className="w-12 h-12 text-black" />
             </div>
             <h1 className="text-6xl font-black tracking-tighter mb-4 text-white">MONOCHROME</h1>
             <p className="text-xl text-zinc-500 font-light tracking-widest mb-12 uppercase">Professional Web DAW</p>
             <button onClick={() => setWelcomeScreen(false)} className="px-10 py-4 bg-white text-black font-bold tracking-widest hover:bg-desert-500 transition-colors shadow-2xl uppercase">
                 Enter Studio
             </button>
          </div>
      )}

      {/* FULL SCREEN EFFECT OVERLAY */}
      {openedEffect && tracks.find(t => t.id === openedEffect.trackId) && (
          <div className="fixed inset-0 z-50 bg-[#080808] flex flex-col animate-in fade-in duration-200">
              {/* Header */}
              <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#050505] shrink-0">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setOpenedEffect(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors uppercase text-xs font-bold tracking-widest border border-zinc-800 px-3 py-1.5 rounded hover:border-zinc-600">
                          <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <div className="h-6 w-[1px] bg-zinc-800"></div>
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-white uppercase tracking-tight leading-none">{openedEffect.effectId}</span>
                        <span className="text-[10px] text-desert-500 uppercase tracking-widest font-bold">
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
                      
                      // 1. CHECK REGISTRY FOR DYNAMIC PLUGIN UI
                      const plugin = EffectRegistry.get(fx);
                      if (plugin) {
                          const PluginComponent = plugin.component;
                          return (
                              <PluginComponent 
                                trackId={track.id} 
                                settings={track.effects[fx] || plugin.defaultSettings} 
                                onChange={(newSettings) => updateEffects(track.id, { [fx]: newSettings })} 
                              />
                          );
                      }

                      // 2. LEGACY UI HANDLERS
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
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-[#0a0a0a] shrink-0 z-20 shadow-md">
        <div className="flex items-center gap-3 w-1/4">
          <div className="w-8 h-8 bg-desert-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(230,194,0,0.2)]">
            <Music className="text-black w-5 h-5 fill-black" />
          </div>
          <h1 className="font-bold text-lg tracking-tight hidden md:block text-white font-sans">MONOCHROME</h1>
        </div>
        
        {/* Central Transport Capsule */}
        <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-center gap-6">
                <div className="bg-[#151515] rounded-full px-2 py-1.5 flex items-center gap-2 border border-zinc-800 shadow-inner">
                    <button onClick={handleStop} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"><Square className="w-4 h-4 fill-current" /></button>
                    <button onClick={togglePlay} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${audioState.isPlaying ? 'bg-desert-500 text-black shadow-[0_0_15px_rgba(230,194,0,0.4)]' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                        {audioState.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                    </button>
                    <button onClick={toggleRecord} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${audioState.isRecording ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-[#1a1a1a] border-zinc-800 text-red-500 hover:text-red-400 hover:border-red-900'}`}>
                        <div className={`w-3 h-3 rounded-full ${audioState.isRecording ? 'bg-white' : 'bg-current'}`}></div>
                    </button>
                </div>
                <div className="flex flex-col items-center justify-center h-10 w-28 bg-black border border-zinc-800 rounded text-center shadow-inner">
                     <span className="font-mono text-xl text-desert-500 leading-none mt-1">{formatTime(audioState.currentTime)}</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-3 justify-end w-1/4">
            <button onClick={saveProject} className="p-2 hover:bg-zinc-900 rounded text-zinc-500 hover:text-desert-500 transition-colors" title="Save Project"><Save className="w-5 h-5" /></button>
            <button onClick={exportWav} className="p-2 hover:bg-zinc-900 rounded text-zinc-500 hover:text-desert-500 transition-colors" title="Export WAV"><Download className="w-5 h-5" /></button>
            <div className="h-6 w-[1px] bg-zinc-800 mx-2"></div>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 border border-zinc-800 rounded ${isSidebarOpen ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}><PanelRightClose className="w-4 h-4" /></button>
            <label className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded text-xs font-bold cursor-pointer text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors">IMPORT<input type="file" accept="audio/*" className="hidden" onChange={(e) => handleImportBeat(e)} /></label>
            <button onClick={addNewTrack} className="bg-white text-black px-3 py-1.5 rounded text-xs font-bold hover:bg-desert-500 transition-colors shadow-lg">+ TRACK</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col bg-[#050505] relative overflow-hidden">
             
             {/* Timeline Toolbar */}
             <div className="h-10 border-b border-zinc-800 bg-[#0a0a0a] flex flex-shrink-0 items-center justify-between px-4">
                 <div className="w-48 text-[10px] text-zinc-500 font-bold tracking-widest uppercase flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Arrangement
                 </div>
                 <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                    <button onClick={() => setActiveTool('cursor')} className={`p-1.5 rounded ${activeTool === 'cursor' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Cursor Tool"><MousePointer2 className="w-4 h-4" /></button>
                    <button onClick={() => { setActiveTool('split'); splitTrack(); setTimeout(()=>setActiveTool('cursor'), 200); }} className={`p-1.5 rounded ${activeTool === 'split' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Split Tool"><Scissors className="w-4 h-4" /></button>
                    <div className="w-[1px] h-4 bg-zinc-800 mx-1"></div>
                    <button onClick={() => setAudioState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }))} className={`p-1.5 rounded ${audioState.snapToGrid ? 'bg-desert-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Snap to Grid"><Magnet className="w-4 h-4" /></button>
                    <button onClick={toggleLoop} className={`p-1.5 rounded ${audioState.loop.active ? 'bg-desert-500 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Loop Mode"><Repeat className="w-4 h-4" /></button>
                    
                    {selectedClipId && <button onClick={deleteSelectedClip} className="p-1.5 rounded text-red-500 hover:bg-red-900/20 ml-2"><Trash2 className="w-4 h-4" /></button>}
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => handleZoom('out')} className="p-1 hover:text-white text-zinc-500"><ZoomOut className="w-4 h-4" /></button>
                    <button onClick={() => handleZoom('in')} className="p-1 hover:text-white text-zinc-500"><ZoomIn className="w-4 h-4" /></button>
                 </div>
             </div>

             <div className="flex flex-1 relative overflow-hidden">
                {/* Track List (Left) */}
                <div className="w-48 bg-[#0a0a0a] border-r border-zinc-800 overflow-hidden shadow-2xl z-20 flex flex-col">
                    <div className="flex-1 space-y-[1px]" style={{ transform: `translateY(-${scrollTop}px)` }}>
                        {tracks.map(track => (
                            <div key={track.id} onClick={() => setSelectedTrackId(track.id)} className={`h-28 flex-shrink-0 px-3 py-3 flex flex-col justify-between border-b border-zinc-900 cursor-pointer group transition-colors relative ${selectedTrackId === track.id ? 'bg-[#151515] border-l-4 border-l-desert-500' : 'bg-[#0a0a0a] hover:bg-[#111] border-l-4 border-l-transparent'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col overflow-hidden">
                                        <span className={`font-bold text-sm truncate w-24 ${selectedTrackId === track.id ? 'text-white' : 'text-zinc-400'}`} onDoubleClick={() => editTrackName(track.id)}>{track.name}</span>
                                        <span className="text-[9px] text-zinc-600 uppercase tracking-widest">{track.type}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteTrack(track.id) }} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-500 transition-opacity"><XCircle className="w-3 h-3" /></button>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <Volume2 className="w-3 h-3 text-zinc-600" />
                                    <div className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-zinc-500" style={{ width: `${track.volume * 100}%` }}></div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-1">
                                    <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} className={`text-[9px] font-bold w-6 h-6 rounded flex items-center justify-center border transition-all ${track.muted ? 'bg-red-500/10 text-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.2)]' : 'bg-zinc-900 text-zinc-600 border-zinc-800 hover:border-zinc-600'}`}>M</button>
                                    <button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} className={`text-[9px] font-bold w-6 h-6 rounded flex items-center justify-center border transition-all ${track.solo ? 'bg-desert-500/10 text-desert-500 border-desert-500 shadow-[0_0_8px_rgba(230,194,0,0.2)]' : 'bg-zinc-900 text-zinc-600 border-zinc-800 hover:border-zinc-600'}`}>S</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Timeline Grid (Right) */}
                <div className="flex-1 overflow-auto bg-[#080808] relative custom-scrollbar" ref={scrollContainerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                    <div className="relative" style={{ minWidth: `${audioState.totalDuration * pixelsPerSecond}px`, minHeight: '100%' }}>
                        <div className="absolute inset-0 z-0 opacity-40">{GridLines}</div>
                        {/* Playhead Ruler */}
                        <div className="h-6 w-full border-b border-zinc-800 bg-[#0a0a0a]/95 backdrop-blur-sm sticky top-0 z-50 flex items-center" 
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
                                    <div className="absolute top-0 h-full bg-desert-500/10 border-t-2 border-desert-500 pointer-events-none" style={{ left: audioState.loop.start * pixelsPerSecond, width: (audioState.loop.end - audioState.loop.start) * pixelsPerSecond }} />
                                    
                                    {/* Loop Start Handle */}
                                    <div 
                                        className="absolute top-0 h-6 w-4 -ml-2 cursor-ew-resize z-50 group loop-handle" 
                                        style={{ left: audioState.loop.start * pixelsPerSecond }}
                                        onMouseDown={(e) => { e.stopPropagation(); isDraggingLoopStartRef.current = true; }}
                                    >
                                        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-desert-500 hover:scale-110 transition-transform"></div>
                                        <div className="w-[1px] h-full bg-desert-500 mx-auto"></div>
                                    </div>

                                    {/* Loop End Handle */}
                                    <div 
                                        className="absolute top-0 h-6 w-4 -ml-2 cursor-ew-resize z-50 group loop-handle" 
                                        style={{ left: audioState.loop.end * pixelsPerSecond }}
                                        onMouseDown={(e) => { e.stopPropagation(); isDraggingLoopEndRef.current = true; }}
                                    >
                                        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-desert-500 hover:scale-110 transition-transform"></div>
                                        <div className="w-[1px] h-full bg-desert-500 mx-auto"></div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Tracks Lane */}
                        <div className="space-y-[1px] relative z-10">
                            {tracks.map(track => (
                                <div key={track.id} className={`h-28 flex-shrink-0 relative border-b border-zinc-800/30 group ${track.muted ? 'opacity-40 grayscale' : ''}`}>
                                    {track.clips.map(clip => (
                                        <div key={clip.id} onMouseDown={(e) => handleClipMouseDown(e, track.id, clip.id)} className={`absolute top-2 bottom-2 rounded-md overflow-hidden cursor-move border transition-all shadow-md ${selectedClipId === clip.id ? 'border-zinc-200 bg-zinc-800 z-30 shadow-xl' : 'border-zinc-700 bg-zinc-900 z-10 hover:border-zinc-500'}`} style={{ left: `${clip.startTime * pixelsPerSecond}px`, width: `${clip.duration * pixelsPerSecond}px` }}>
                                            <div className="w-full h-full opacity-80 pointer-events-none p-1"><Waveform buffer={clip.buffer} color={selectedClipId === clip.id ? "bg-white" : "bg-zinc-400"} start={clip.audioOffset} duration={clip.duration} /></div>
                                            <div className="absolute top-0 left-0 w-full px-2 py-0.5 bg-gradient-to-b from-black/50 to-transparent text-[9px] font-bold text-zinc-200 truncate pointer-events-none">{clip.name}</div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Playhead */}
                        <div className="absolute top-0 bottom-0 z-50 pointer-events-none" style={{ left: `${audioState.currentTime * pixelsPerSecond}px` }}>
                            <div className="w-[1px] bg-white h-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                            <div className="w-3 h-3 bg-white rotate-45 transform -translate-x-[5px] -translate-y-[6px] absolute top-6" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Sidebar (Mixer) */}
        {isSidebarOpen && (
            <div className="w-80 bg-[#0a0a0a] border-l border-zinc-900 flex flex-col shrink-0 z-20 shadow-2xl">
                <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-4 font-bold text-[10px] tracking-widest text-zinc-500 bg-[#0a0a0a] uppercase">
                    <span className="flex items-center gap-2"><Settings2 className="w-3 h-3" /> Channel Strip</span>
                    <button onClick={() => setIsSidebarOpen(false)} className="hover:text-white"><PanelRightClose className="w-3 h-3" /></button>
                </div>
                
                {selectedTrack ? (
                    <div className="flex-1 p-6 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                        <div className="text-center pb-6 border-b border-zinc-800">
                            <h2 className="text-2xl font-black text-white mb-1 truncate cursor-pointer hover:text-desert-500 transition-colors tracking-tight" onClick={() => editTrackName(selectedTrack.id)}>{selectedTrack.name}</h2>
                            <span className="text-[10px] text-desert-500 font-bold uppercase tracking-widest px-2 py-1 bg-desert-500/10 rounded border border-desert-500/20">{selectedTrack.type} TRACK</span>
                        </div>
                        
                        {/* Basic Controls */}
                        <div className="space-y-8">
                            <div className="flex justify-center">
                                <Knob label="PAN" min={-1} max={1} value={selectedTrack.pan} onChange={(val) => updateTrack(selectedTrack.id, { pan: val })} />
                            </div>
                            <div className="space-y-2 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                                <div className="flex justify-between text-xs text-zinc-400 font-bold tracking-wider"><span>FADER</span><span>{(selectedTrack.volume * 100).toFixed(0)}%</span></div>
                                <input type="range" min="0" max="1" step="0.01" value={selectedTrack.volume} onChange={(e) => updateTrack(selectedTrack.id, { volume: parseFloat(e.target.value) })} className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        </div>

                        {/* Inserts Rack */}
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1"><Disc className="w-3 h-3" /> INSERTS CHAIN</h3>
                                <button 
                                    onClick={() => { setEffectSelectorTrackId(selectedTrack.id); setShowEffectSelector(true); }}
                                    className="text-[10px] bg-desert-500 text-black font-bold px-3 py-1 rounded-full flex gap-1 items-center hover:bg-white transition-colors shadow-lg shadow-desert-500/20"
                                >
                                    <Plus className="w-3 h-3" /> FX
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-2 min-h-[100px]">
                                {selectedTrack.activeEffects.length === 0 && (
                                    <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-lg text-zinc-700 text-xs font-bold uppercase tracking-widest">
                                        Empty Chain
                                    </div>
                                )}
                                {selectedTrack.activeEffects.map((effectId, index) => (
                                    <div key={`${effectId}-${index}`} className="group bg-[#111] border border-zinc-800 rounded-md p-2 pl-3 flex items-center justify-between hover:border-zinc-600 transition-all shadow-sm relative overflow-hidden">
                                        {/* Status Indicator Bar */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-desert-500"></div>
                                        
                                        <span className="text-xs font-bold text-zinc-300 uppercase cursor-pointer flex-1 truncate hover:text-white" onClick={() => setOpenedEffect({ trackId: selectedTrack.id, effectId })}>
                                            {/* Try to resolve name from registry, else use ID */}
                                            {EffectRegistry.get(effectId)?.name || effectId}
                                        </span>
                                        <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setOpenedEffect({ trackId: selectedTrack.id, effectId })} className="p-1 hover:bg-zinc-800 rounded"><SlidersHorizontal className="w-3 h-3 text-zinc-400" /></button>
                                            <button onClick={() => { 
                                                setTracks(p => p.map(t => {
                                                    if (t.id === selectedTrack.id) {
                                                        const updatedTrack = {...t, activeEffects: t.activeEffects.filter((_, i) => i !== index)};
                                                        audioEngine.rebuildTrackEffects(updatedTrack);
                                                        return updatedTrack;
                                                    }
                                                    return t;
                                                }));
                                            }} className="p-1 hover:bg-red-900/30 rounded"><Trash2 className="w-3 h-3 text-zinc-500 hover:text-red-500" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-700">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
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