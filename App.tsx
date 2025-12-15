
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Music, FolderOpen, ArrowLeft, TrendingUp, Sparkles, VolumeX, Radio, Mic2, ScissorsLineDashed, ArrowLeftRight, Volume2, Trash2 } from 'lucide-react';
import saveAs from 'file-saver';
import { audioEngine } from './services/AudioEngine';
import { Track, TrackType, AudioEngineState, Clip, EffectSettings, ContextMenuState } from './types';
import { EffectRegistry } from './services/EffectRegistry';
import { Knob } from './components/Knob';
import { EffectSelector } from './components/EffectSelector';

// Effects Components
import { ParametricEQ } from './components/effects/ParametricEQ';
import { CompressorEffect } from './components/effects/CompressorEffect';
import { ReverbEffect } from './components/effects/ReverbEffect';
import { TunerEffect } from './components/effects/TunerEffect';
import { DistortionEffect } from './components/effects/DistortionEffect'; 

// Hooks
import { useUndoRedo } from './hooks/useUndoRedo';

// Layout Modules
import { ReleaseNotes } from './components/ReleaseNotes';
import { Header } from './components/layout/Header';
import { TrackList } from './components/layout/TrackList';
import { Timeline } from './components/layout/Timeline';
import { MixerSidebar } from './components/layout/MixerSidebar';
import { ProjectManager } from './components/ProjectManager';
import { Dashboard } from './components/Dashboard';
import { AiAssistantModal } from './components/AiAssistantModal';

// --- Constants ---
const BASE_PX_PER_SEC = 50;

// --- THEME CONFIGURATION ---
const THEMES: Record<string, React.CSSProperties> = {
  monochrome: { 
    '--bg-main': '#050505',  
    '--bg-panel': '#0a0a0a', 
    '--bg-element': '#1a1a1a', 
    '--text-main': '#ffffff', 
    '--text-muted': '#a1a1aa', 
    '--border-color': '#3f3f46', 
    '--accent': '#ffffff', 
    '--waveform-bg': '#27272a', 
    '--waveform-wave': '#e4e4e7' 
  } as React.CSSProperties,
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
  const [theme, setTheme] = useState<string>('monochrome');
  const [tracks, setTracks, undoTracks, redoTracks, canUndo, canRedo] = useUndoRedo<Track[]>([]);
  
  // Project Management State
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [projectManagerMode, setProjectManagerMode] = useState<'save' | 'open'>('open');
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);

  // Refs for tracking state inside animation frames without stale closures
  const tracksRef = useRef<Track[]>(tracks);
  
  useEffect(() => {
      tracksRef.current = tracks;
  }, [tracks]);

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Responsive UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTrackListOpen, setIsTrackListOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  const [activeTool, setActiveTool] = useState<'cursor' | 'split'>('cursor');
  
  // Monitoring State
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  
  const [showEffectSelector, setShowEffectSelector] = useState(false);
  const [effectSelectorTrackId, setEffectSelectorTrackId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  
  // AI Mixing State
  const [showAiModal, setShowAiModal] = useState(false);

  const [audioState, setAudioState] = useState<AudioEngineState>({
    isPlaying: false, currentTime: 0, totalDuration: 120, isRecording: false, bpm: 120, snapToGrid: true, metronomeOn: false, masterVolume: 0.8,
    loop: { active: false, start: 0, end: 4 }
  });

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, trackId: null, clipId: null });
  const [openedEffect, setOpenedEffect] = useState<{ trackId: string, effectId: string } | null>(null);

  // References
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const playbackAnchorTimeRef = useRef<number>(0); 
  const rafRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);
  const playStartCursorRef = useRef<number>(0);
  
  const recordingWaveformRef = useRef<number[]>([]);
  const recordingTrackIdRef = useRef<string | null>(null);
  const recordingClipIdRef = useRef<string | null>(null);

  // Dragging / Navigation State
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null); 
  const dragStartXRef = useRef<number>(0);
  const dragOriginalStartTimeRef = useRef<number>(0);
  
  const [resizingState, setResizingState] = useState<{ isResizing: boolean; direction: 'left' | 'right' | null; clipId: string | null; trackId: string | null; initialX: number; initialStartTime: number; initialDuration: number; initialOffset: number; }>({
      isResizing: false, direction: null, clipId: null, trackId: null, initialX: 0, initialStartTime: 0, initialDuration: 0, initialOffset: 0
  });

  const currentScrubTimeRef = useRef<number | null>(null);
  const dragConstraintsRef = useRef<{ min: number; max: number }>({ min: 0, max: Infinity });

  // Timeline Interaction Refs
  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const isDraggingLoopStartRef = useRef(false);
  const isDraggingLoopEndRef = useRef(false);
  const isCreatingLoopRef = useRef(false);
  const loopStartAnchorRef = useRef(0);

  // --- Helpers ---
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const pixelsPerSecond = BASE_PX_PER_SEC * zoomLevel;

  // --- Responsive Logic ---
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) { setIsTrackListOpen(false); setIsSidebarOpen(false); } else { setIsTrackListOpen(true); setIsSidebarOpen(true); }
    };
    handleResize(); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
      const handleFullScreenChange = () => { setIsFullScreen(!!document.fullscreenElement); };
      document.addEventListener('fullscreenchange', handleFullScreenChange); return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const toggleFullScreen = async () => {
      try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (err) { console.error(err); }
  };

  const toggleTheme = () => {
    setTheme('monochrome');
  };

  // --- Real-time Mixing ---
  useEffect(() => {
    const anySolo = tracks.some(t => t.solo);
    tracks.forEach(track => {
        let effectiveVolume = track.volume;
        if (track.muted || (anySolo && !track.solo)) effectiveVolume = 0;
        audioEngine.setTrackVolume(track.id, effectiveVolume);
        if(audioState.isPlaying || isMonitoring) audioEngine.updateTrackSettings(track);
    });
    // Master Volume Update
    audioEngine.setMasterVolume(audioState.masterVolume);
  }, [tracks, audioState.isPlaying, isMonitoring, audioState.masterVolume]);

  // --- FILE SYSTEM API (PROJECT MANAGER) ---
  
  const handleSelectRootFolder = async () => {
      try {
          if (!('showDirectoryPicker' in window)) {
              alert("Your browser does not support the File System Access API.");
              return;
          }
          // Request access to a directory (The user should pick 'C:\Users\Desktop\Downloads\projeto' or similar)
          const handle = await (window as any).showDirectoryPicker({
              mode: 'readwrite',
              startIn: 'documents'
          });
          setRootHandle(handle);
      } catch (err) {
          console.warn("Folder selection cancelled or failed", err);
      }
  };

  const toggleProjectManager = (mode: 'save' | 'open') => {
      setProjectManagerMode(mode);
      setProjectManagerOpen(true);
  };

  const handleSaveProject = async (projectName: string) => {
      if (!rootHandle) return;
      setProjectManagerOpen(false);
      setIsProcessing(true);
      setProcessingMessage("SAVING PROJECT...");

      try {
          // 1. Create/Get the specific project folder inside the root handle
          // @ts-ignore
          const projectDir = await rootHandle.getDirectoryHandle(projectName, { create: true });

          // 2. Prepare JSON Data
          const projectState = {
              audioState,
              tracks: tracks.map(t => ({
                  ...t,
                  clips: t.clips.map(c => ({
                      ...c,
                      buffer: null,
                      blob: null,
                      fileName: `${c.id}.wav`
                  }))
              }))
          };

          // 3. Save JSON File
          // @ts-ignore
          const jsonHandle = await projectDir.getFileHandle('project.monochrome', { create: true });
          // @ts-ignore
          const writable = await jsonHandle.createWritable();
          await writable.write(JSON.stringify(projectState));
          await writable.close();

          // 4. Save Audio Assets in 'samples' subfolder
          // @ts-ignore
          const samplesDir = await projectDir.getDirectoryHandle('samples', { create: true });
          
          for (const track of tracks) {
              for (const clip of track.clips) {
                  if (clip.buffer) {
                      let blobToWrite = clip.blob;
                      if (!blobToWrite) {
                          blobToWrite = audioEngine.bufferToWave(clip.buffer, clip.buffer.length);
                      }
                      // @ts-ignore
                      const fileHandle = await samplesDir.getFileHandle(`${clip.id}.wav`, { create: true });
                      // @ts-ignore
                      const fileWritable = await fileHandle.createWritable();
                      await fileWritable.write(blobToWrite);
                      await fileWritable.close();
                  }
              }
          }
          
          // UPDATE CURRENT PROJECT NAME
          setCurrentProjectName(projectName);

          setTimeout(() => {
              setIsProcessing(false);
              alert(`Projeto "${projectName}" salvo com sucesso!`);
          }, 500);

      } catch (err) {
          console.error(err);
          setIsProcessing(false);
          alert("Erro ao salvar projeto. Verifique as permissões.");
      }
  };

  const handleLoadProject = async (projectName: string) => {
      if (!rootHandle) return;
      
      await audioEngine.resumeContext();
      handleStop();
      setProjectManagerOpen(false);
      setIsProcessing(true);
      setProcessingMessage("LOADING PROJECT...");

      try {
          // 1. Get Project Folder
          // @ts-ignore
          const projectDir = await rootHandle.getDirectoryHandle(projectName);

          // 2. Load JSON
          let jsonHandle;
          try {
              // @ts-ignore
              jsonHandle = await projectDir.getFileHandle('project.monochrome');
          } catch(e) {
              throw new Error("Arquivo de projeto inválido.");
          }

          // @ts-ignore
          const file = await jsonHandle.getFile();
          const text = await file.text();
          const projectData = JSON.parse(text);

          // 3. Load Samples
          const loadedTracks: Track[] = [];
          let samplesDir: any;
          try {
              // @ts-ignore
              samplesDir = await projectDir.getDirectoryHandle('samples');
          } catch(e) {
              console.warn("Samples folder missing");
          }

          for (const trackData of projectData.tracks) {
              const clips: Clip[] = [];
              for (const clipData of trackData.clips) {
                  if (clipData.fileName && samplesDir) {
                      try {
                          // @ts-ignore
                          const audioHandle = await samplesDir.getFileHandle(clipData.fileName);
                          // @ts-ignore
                          const audioFile = await audioHandle.getFile();
                          const arrayBuffer = await audioFile.arrayBuffer();
                          
                          if (arrayBuffer.byteLength > 0) {
                              const buffer = await audioEngine.decodeAudioData(arrayBuffer);
                              clips.push({ 
                                  ...clipData, 
                                  buffer: buffer,
                                  blob: new Blob([arrayBuffer], { type: 'audio/wav' }) 
                              });
                          }
                      } catch(e) {
                          console.warn(`Missing file: ${clipData.fileName}`);
                      }
                  }
              }
              loadedTracks.push({ ...trackData, clips });
          }

          setTracks(loadedTracks);
          setAudioState(prev => ({ ...prev, ...projectData.audioState, isPlaying: false }));
          
          // UPDATE CURRENT PROJECT NAME (This switches view from Dashboard to DAW)
          setCurrentProjectName(projectName);
          
          setTimeout(() => setIsProcessing(false), 500);

      } catch (err) {
          console.error(err);
          setIsProcessing(false);
          alert("Erro ao abrir projeto: " + (err as Error).message);
      }
  };

  const handleCreateNewProject = async () => {
      // Prompt user for name immediately
      const name = prompt("Nome do Novo Projeto:", "Sem Titulo");
      if (!name) return;
      
      // Reset state for new project
      setTracks([]);
      setAudioState({
        isPlaying: false, currentTime: 0, totalDuration: 120, isRecording: false, bpm: 120, snapToGrid: true, metronomeOn: false, masterVolume: 0.8,
        loop: { active: false, start: 0, end: 4 }
      });
      
      await audioEngine.resumeContext();
      
      // Save empty project to establish folder
      await handleSaveProject(name);
  };

  // --- SMART SAVE LOGIC ---
  const handleQuickSave = () => {
      // 1. Se não tem pasta raiz definida, forçar abrir gerenciador
      if (!rootHandle) {
          toggleProjectManager('save');
          return;
      }

      // 2. Se já tem nome, salva direto (Quick Save)
      if (currentProjectName) {
          handleSaveProject(currentProjectName);
      } else {
          // 3. Se não tem nome (primeira vez), abre gerenciador para nomear (Save As)
          toggleProjectManager('save');
      }
  };

  const handleGoHome = () => {
      handleStop();
      setCurrentProjectName(null);
  };

  const exportWav = async () => {
      audioEngine.resumeContext(); if(tracks.length === 0) return;
      saveAs(await audioEngine.renderOffline(tracks, audioState.totalDuration), "mixdown.wav");
  };

  // --- Audio Actions ---
  const handleImportBeat = async (e: React.ChangeEvent<HTMLInputElement>, trackIdToAdd?: string) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
        audioEngine.resumeContext();
        const audioBuffer = await audioEngine.decodeAudioData((await file.arrayBuffer()).slice(0));
        const newClip: Clip = { id: crypto.randomUUID(), name: file.name.replace(/\.[^/.]+$/, ""), blob: file, buffer: audioBuffer, duration: audioBuffer.duration, audioOffset: 0, startTime: 0 };
        if (trackIdToAdd) {
            setTracks(prev => prev.map(t => { if (t.id === trackIdToAdd) { const maxEnd = t.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0); newClip.startTime = maxEnd > 0 ? maxEnd + 1 : 0; return { ...t, clips: [...t.clips, newClip] } } return t; }));
        } else {
            setTracks(prev => [...prev, { id: crypto.randomUUID(), name: file.name.replace(/\.[^/.]+$/, ""), type: TrackType.BEAT, volume: 0.8, pan: 0, muted: false, solo: false, clips: [newClip], effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, activeEffects: [] }]);
            setAudioState(prev => ({ ...prev, totalDuration: Math.max(prev.totalDuration, audioBuffer.duration + 10) }));
        }
    } catch (err) { alert("Failed to decode audio file."); }
  };

  const addNewTrack = () => {
      setTracks(prev => [...prev, { id: crypto.randomUUID(), name: `Track ${tracks.length + 1}`, type: TrackType.VOCAL, volume: 0.8, pan: 0, muted: false, solo: false, clips: [], effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, activeEffects: [] }]);
      if (isMobile) setIsTrackListOpen(false);
  };

  const deleteTrack = (id: string) => { setTracks(prev => prev.filter(t => t.id !== id)); if (selectedTrackId === id) setSelectedTrackId(null); };
  const duplicateTrack = (id: string) => {
      const track = tracks.find(t => t.id === id); if (!track) return;
      setTracks(prev => [...prev, { ...track, id: crypto.randomUUID(), name: `${track.name} (Copy)`, clips: track.clips.map(c => ({ ...c, id: crypto.randomUUID() })) }]);
  };
  const editTrackName = (id: string) => {
      const track = tracks.find(t => t.id === id); if (!track) return;
      const newName = prompt("Track Name:", track.name); if (newName) updateTrack(id, { name: newName });
  };

  const splitTrack = () => {
    if (!selectedTrackId) return; const track = tracks.find(t => t.id === selectedTrackId); if (!track) return;
    const splitTime = audioState.currentTime;
    const clip = track.clips.find(c => splitTime > c.startTime && splitTime < (c.startTime + c.duration)); if (!clip) return;
    if (audioState.isPlaying) audioEngine.stopClip(clip.id);
    const relativeSplit = splitTime - clip.startTime; if (relativeSplit < 0.05 || (clip.duration - relativeSplit) < 0.05) return;
    const rightClip: Clip = { ...clip, id: crypto.randomUUID(), startTime: splitTime, duration: clip.duration - relativeSplit, audioOffset: clip.audioOffset + relativeSplit, name: `${clip.name} (Part)` };
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, clips: [...t.clips.filter(c => c.id !== clip.id), { ...clip, duration: relativeSplit }, rightClip] } : t));
    setSelectedClipId(rightClip.id);
  };

  const deleteSelectedClip = useCallback(() => {
      if (!selectedClipId || !selectedTrackId) return;
      if (audioState.isPlaying) audioEngine.stopClip(selectedClipId);
      setTracks(prev => prev.map(t => t.id === selectedTrackId ? { ...t, clips: t.clips.filter(c => c.id !== selectedClipId) } : t));
      setSelectedClipId(null);
  }, [selectedClipId, selectedTrackId, audioState.isPlaying, setTracks]);

  // --- RECORDING LOGIC ---
  const toggleRecord = async () => {
    audioEngine.resumeContext();
    if (audioState.isRecording) {
      const blob = await audioEngine.stopRecording();
      if (blob.size === 0) {
        setAudioState(prev => ({ ...prev, isRecording: false }));
        return;
      }
      try {
        const audioBuffer = await audioEngine.processRecordedBlob(blob);
        if (recordingClipIdRef.current && recordingTrackIdRef.current) {
            const newClip: Clip = { 
                id: recordingClipIdRef.current, 
                name: "Rec Take", 
                blob, 
                buffer: audioBuffer,
                duration: audioBuffer.duration, 
                audioOffset: 0, 
                startTime: recordingStartTimeRef.current 
            };
            
            // CRITICAL FIX: Update tracksRef IMMEDIATELY before setting state.
            const updatedTracks = tracksRef.current.map(t => 
                t.id === recordingTrackIdRef.current 
                ? { ...t, clips: t.clips.map(c => c.id === recordingClipIdRef.current ? newClip : c) } 
                : t
            );
            tracksRef.current = updatedTracks;
            setTracks(updatedTracks);
        }
      } catch (error) {
          console.error("Failed to process recording:", error);
      }
      recordingClipIdRef.current = null; recordingTrackIdRef.current = null; recordingWaveformRef.current = [];
      setAudioState(prev => ({ ...prev, isRecording: false }));

    } else {
      try {
        // Prepare track for recording
        let recTrackId = selectedTrackId;
        if (!tracks.find(t => t.id === selectedTrackId)?.type.includes('VOCAL')) {
            const newTrack: Track = { id: crypto.randomUUID(), name: `Vocal Rec`, type: TrackType.VOCAL, volume: 1.0, pan: 0, muted: false, solo: false, clips: [], effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, activeEffects: [] };
            setTracks(prev => [...prev, newTrack]); 
            recTrackId = newTrack.id; 
            setSelectedTrackId(newTrack.id);
            // Small delay to ensure track is in state before Engine tries to access it
            await new Promise(r => setTimeout(r, 100));
        }
        
        recordingTrackIdRef.current = recTrackId;
        const tempClipId = crypto.randomUUID(); 
        recordingClipIdRef.current = tempClipId;
        recordingStartTimeRef.current = audioState.currentTime; 
        recordingWaveformRef.current = [];

        // Update UI with placeholder clip
        setTracks(prev => prev.map(t => t.id === recTrackId ? { ...t, clips: [...t.clips, { id: tempClipId, name: "Recording...", duration: 0, audioOffset: 0, startTime: recordingStartTimeRef.current, liveData: [] }] } : t));

        // Start Recording in Engine
        await audioEngine.startRecording(); 
        setAudioState(prev => ({ ...prev, isRecording: true })); 
        
        if (!audioState.isPlaying) togglePlay();
      } catch (err) { alert("Microphone error or permission denied."); }
    }
  };

  // --- MONITORING LOGIC ---
  const toggleMonitoring = async () => {
      if (!selectedTrackId) {
          alert("Select a track to monitor.");
          return;
      }
      
      const newStatus = !isMonitoring;
      setIsMonitoring(newStatus);
      
      try {
          await audioEngine.toggleMonitor(selectedTrackId, newStatus);
      } catch (e) {
          console.error("Failed to toggle monitoring", e);
          setIsMonitoring(false);
      }
  };

  // Auto-update monitoring if selected track changes while monitoring is active
  useEffect(() => {
      if (isMonitoring && selectedTrackId) {
          audioEngine.toggleMonitor(selectedTrackId, true).catch(() => setIsMonitoring(false));
      } else if (!selectedTrackId && isMonitoring) {
          setIsMonitoring(false);
          audioEngine.toggleMonitor("", false);
      }
  }, [selectedTrackId]);


  const toggleLoop = () => setAudioState(prev => ({ ...prev, loop: { ...prev.loop, active: !prev.loop.active } }));

  const togglePlay = useCallback((startTime?: number) => {
    audioEngine.resumeContext();
    if (audioState.isRecording) toggleRecord();
    setAudioState(prev => {
        if (prev.isPlaying && startTime === undefined) {
            audioEngine.stopAll(); cancelAnimationFrame(rafRef.current);
            return { ...prev, isPlaying: false, currentTime: playStartCursorRef.current };
        } else {
            const startCursor = startTime !== undefined ? startTime : prev.currentTime;
            playStartCursorRef.current = startCursor; playbackAnchorTimeRef.current = audioEngine.currentTime - startCursor;
            audioEngine.startTransport(startCursor); return { ...prev, isPlaying: true };
        }
    });
  }, [audioState.isRecording]);

  const handleStop = () => { if (audioState.isRecording) toggleRecord(); audioEngine.stopAll(); cancelAnimationFrame(rafRef.current); setAudioState(prev => ({ ...prev, isPlaying: false, currentTime: 0 })); };

  const playActiveSegments = (startCursor: number) => {
    if (!Number.isFinite(startCursor)) return;
    // Use tracksRef.current to get the latest tracks state without closure staleness
    tracksRef.current.forEach(track => track.clips.forEach(clip => {
        if (clip.startTime + clip.duration > startCursor) {
            audioEngine.playClip(clip, track, clip.startTime >= startCursor ? playbackAnchorTimeRef.current + clip.startTime : audioEngine.currentTime, clip.startTime >= startCursor ? 0 : startCursor - clip.startTime);
        }
    }));
  };

  // --- Play Loop Animation ---
  useEffect(() => {
    if (audioState.isPlaying || isMonitoring || audioState.isRecording) {
        const loop = () => {
            const now = audioEngine.currentTime;
            let visualTime = now - playbackAnchorTimeRef.current;
            
            // Handle Recording Visuals
            if (audioState.isRecording && recordingClipIdRef.current && recordingTrackIdRef.current) {
                const peak = audioEngine.getRecordingPeak();
                recordingWaveformRef.current.push(peak);
                setTracks(prev => prev.map(t => t.id === recordingTrackIdRef.current ? { ...t, clips: t.clips.map(c => c.id === recordingClipIdRef.current ? { ...c, duration: Math.max(0, visualTime - c.startTime), liveData: [...recordingWaveformRef.current] } : c) } : t));
            } else if (isMonitoring && !audioState.isPlaying) {
                // If only monitoring (not playing/recording), we still need to pump the loop for visuals (e.g. EQ analyzer)
                // but we don't update currentTime
            }

            if (audioState.isPlaying) {
                if (audioState.loop.active && visualTime >= audioState.loop.end) {
                    audioEngine.stopAll(); visualTime = audioState.loop.start; playbackAnchorTimeRef.current = now - audioState.loop.start;
                    audioEngine.startTransport(visualTime); playActiveSegments(visualTime);
                } else if (visualTime >= audioState.totalDuration) {
                   audioEngine.stopAll(); setAudioState(prev => ({ ...prev, currentTime: 0, isPlaying: false })); if (audioState.isRecording) toggleRecord(); cancelAnimationFrame(rafRef.current); return;
                }
                if (!Number.isFinite(visualTime)) visualTime = 0;
                setAudioState(prev => ({ ...prev, currentTime: Math.max(0, visualTime) })); 
            }
            
            rafRef.current = requestAnimationFrame(loop);
        };
        // Initial playback trigger if playing
        if(audioState.isPlaying) playActiveSegments(audioState.currentTime);
        
        rafRef.current = requestAnimationFrame(loop);
    } else { 
        cancelAnimationFrame(rafRef.current); 
        audioEngine.stopAll(); 
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioState.isPlaying, audioState.loop, audioState.isRecording, isMonitoring]); 

  // Sync BPM
  useEffect(() => { audioEngine.setBpm(audioState.bpm); audioEngine.setMetronomeStatus(audioState.metronomeOn); }, [audioState.bpm, audioState.metronomeOn]);

  // --- ZOOM & KEYBOARD SHORTCUTS ---

  // 1. Smooth Exponential Zoom
  const handleZoom = useCallback((direction: 'in' | 'out') => {
      setZoomLevel(prev => {
          const factor = 1.2;
          let newZoom = direction === 'in' ? prev * factor : prev / factor;
          return Math.max(0.1, Math.min(10, newZoom));
      });
  }, []);

  // 2. Zoom Focus on Playhead (Needle)
  useLayoutEffect(() => {
      if (scrollContainerRef.current) {
          const containerWidth = scrollContainerRef.current.offsetWidth;
          const pxPerSec = BASE_PX_PER_SEC * zoomLevel;
          // Calculate where the playhead is
          const playheadPos = audioState.currentTime * pxPerSec;
          // Center the view on the playhead
          const newScroll = playheadPos - (containerWidth / 2);
          scrollContainerRef.current.scrollLeft = Math.max(0, newScroll);
      }
  }, [zoomLevel]); // Trigger only on zoom change

  // 3. Global Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
          
          if (e.code === 'Space') {
              e.preventDefault();
              togglePlay();
          }
          if (e.code === 'Delete' || e.code === 'Backspace') {
              if (selectedClipId && !audioState.isPlaying) {
                  e.preventDefault();
                  deleteSelectedClip();
              }
          }
          if (e.code === 'Home' || e.code === 'Enter') {
              e.preventDefault();
              setAudioState(prev => ({ ...prev, currentTime: 0 }));
              if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft = 0;
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, selectedClipId, deleteSelectedClip, audioState.isPlaying]);


  const updateTrack = (id: string, updates: Partial<Track>) => setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  const updateEffects = (id: string, updates: Partial<Track['effects']>) => setTracks(prev => prev.map(t => { if (t.id === id) { const updated = { ...t, effects: { ...t.effects, ...updates } }; audioEngine.updateTrackSettings(updated); return updated; } return t; }));
  const addEffect = (trackId: string, effectName: string) => {
       setTracks(prev => prev.map(t => { if (t.id === trackId && !t.activeEffects.includes(effectName)) { const updated = { ...t, activeEffects: [...t.activeEffects, effectName] }; audioEngine.rebuildTrackEffects(updated); return updated; } return t; }));
       setOpenedEffect({ trackId, effectId: effectName }); setShowEffectSelector(false); 
  };

  // --- Context Menu Logic ---
  const handleContextMenu = (e: React.MouseEvent, trackId: string, clipId: string) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300), trackId, clipId }); };
  const closeContextMenu = () => setContextMenu(prev => ({ ...prev, visible: false }));
  useEffect(() => { window.addEventListener('click', closeContextMenu); return () => window.removeEventListener('click', closeContextMenu); }, []);

  const processClipBuffer = async (action: 'noise' | 'fadein' | 'fadeout' | 'reverse' | 'normalize' | 'neural' | 'silence' | 'removesilence' | 'invert' | 'gain' | 'lofi' | 'deesser') => {
      if (!contextMenu.clipId || !contextMenu.trackId) return; closeContextMenu(); setIsProcessing(true);
      setProcessingMessage(action.toUpperCase() + '...');
      setTimeout(async () => {
          const track = tracks.find(t => t.id === contextMenu.trackId); const clip = track?.clips.find(c => c.id === contextMenu.clipId);
          if (clip && clip.buffer) {
              let newBuffer: AudioBuffer | null = null;
              if (action === 'noise') newBuffer = await audioEngine.applyNoiseReduction(clip.buffer);
              else if (action === 'fadein') newBuffer = await audioEngine.applyFade(clip.buffer, 'in', 1.0);
              else if (action === 'fadeout') newBuffer = await audioEngine.applyFade(clip.buffer, 'out', 1.0);
              else if (action === 'reverse') newBuffer = await audioEngine.reverseBuffer(clip.buffer);
              else if (action === 'normalize') newBuffer = await audioEngine.normalizeBuffer(clip.buffer);
              else if (action === 'neural') newBuffer = await audioEngine.applyNeuralEnhance(clip.buffer);
              else if (action === 'silence') newBuffer = await audioEngine.applySilence(clip.buffer);
              else if (action === 'removesilence') newBuffer = await audioEngine.removeSilence(clip.buffer);
              else if (action === 'invert') newBuffer = await audioEngine.applyInvertPhase(clip.buffer);
              else if (action === 'gain') newBuffer = await audioEngine.applyGain(clip.buffer, 3.0); 
              else if (action === 'lofi') newBuffer = await audioEngine.applyLoFi(clip.buffer);
              else if (action === 'deesser') newBuffer = await audioEngine.applyDeEsser(clip.buffer);
              if (newBuffer) setTracks(prev => prev.map(t => t.id === contextMenu.trackId ? { ...t, clips: t.clips.map(c => c.id === contextMenu.clipId ? { ...c, buffer: newBuffer!, duration: newBuffer!.duration, blob: undefined } : c) } : t));
          }
          setIsProcessing(false);
      }, 50);
  };

  // --- Interaction Handlers (Move/Resize) ---
  const handleClipInteractionStart = (e: React.MouseEvent | React.TouchEvent, trackId: string, clipId: string, action: 'move' | 'resize-left' | 'resize-right') => {
      if (e.type !== 'touchstart' && (e as React.MouseEvent).button !== 0) return;
      e.stopPropagation(); if (activeTool === 'split') return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const track = tracks.find(t => t.id === trackId); const clip = track?.clips.find(c => c.id === clipId);
      if (!track || !clip) return;
      setSelectedTrackId(trackId); setSelectedClipId(clipId);
      if (action === 'move') {
          const otherClips = track.clips.filter(c => c.id !== clipId).sort((a, b) => a.startTime - b.startTime);
          const prevClip = otherClips.filter(c => c.startTime + c.duration <= clip.startTime).pop();
          const nextClip = otherClips.find(c => c.startTime >= clip.startTime + clip.duration);
          dragConstraintsRef.current = { min: prevClip ? prevClip.startTime + prevClip.duration : 0, max: nextClip ? nextClip.startTime - clip.duration : Infinity };
          setDraggingClipId(clipId); setDraggingTrackId(trackId); dragStartXRef.current = clientX; dragOriginalStartTimeRef.current = clip.startTime;
      } else {
          setResizingState({ isResizing: true, direction: action === 'resize-left' ? 'left' : 'right', clipId, trackId, initialX: clientX, initialStartTime: clip.startTime, initialDuration: clip.duration, initialOffset: clip.audioOffset });
      }
  };

  useEffect(() => {
      const handleMove = (clientX: number) => {
          if (!scrollContainerRef.current) return;
          const x = clientX - scrollContainerRef.current.getBoundingClientRect().left + scrollContainerRef.current.scrollLeft;
          const t = Math.max(0, x / pixelsPerSecond);

          if (isDraggingLoopStartRef.current) { 
              let s = Math.min(t, audioState.loop.end - 0.1); if (audioState.snapToGrid) s = Math.round(s / (60 / audioState.bpm / 4)) * (60 / audioState.bpm / 4);
              setAudioState(p => ({ ...p, loop: { ...p.loop, start: Math.min(s, audioState.loop.end - 0.1), active: true } })); return; 
          }
          if (isDraggingLoopEndRef.current) { 
              let e = Math.max(t, audioState.loop.start + 0.1); if (audioState.snapToGrid) e = Math.round(e / (60 / audioState.bpm / 4)) * (60 / audioState.bpm / 4);
              setAudioState(p => ({ ...p, loop: { ...p.loop, end: Math.max(e, audioState.loop.start + 0.1), active: true } })); return; 
          }
          if (isCreatingLoopRef.current) { 
            setAudioState(p => ({ ...p, loop: { ...p.loop, start: Math.min(loopStartAnchorRef.current, t), end: Math.max(loopStartAnchorRef.current, t), active: true } })); return; 
          }
          if (isScrubbingRef.current) { 
              let s = t; if (audioState.snapToGrid) s = Math.round(t / (60 / audioState.bpm / 4)) * (60 / audioState.bpm / 4);
              currentScrubTimeRef.current = Math.max(0, s); setAudioState(prev => ({ ...prev, currentTime: Math.max(0, s) })); return; 
          }
          if (resizingState.isResizing && resizingState.trackId && resizingState.clipId) {
              const deltaSeconds = (clientX - resizingState.initialX) / pixelsPerSecond;
              setTracks(prev => prev.map(trk => {
                  if (trk.id !== resizingState.trackId) return trk;
                  return { ...trk, clips: trk.clips.map(c => {
                          if (c.id !== resizingState.clipId) return c;
                          const maxDur = c.buffer ? c.buffer.duration : c.duration;
                          let newClip = { ...c };
                          if (resizingState.direction === 'right') {
                              let d = resizingState.initialDuration + deltaSeconds;
                              if (d + c.audioOffset > maxDur) d = maxDur - c.audioOffset;
                              if (audioState.snapToGrid) d = Math.round((c.startTime + d) / (60/audioState.bpm/4))*(60/audioState.bpm/4) - c.startTime;
                              newClip.duration = Math.max(0.1, d);
                          } else {
                              let s = resizingState.initialStartTime + deltaSeconds;
                              if (audioState.snapToGrid) s = Math.round(s / (60/audioState.bpm/4))*(60/audioState.bpm/4);
                              const diff = s - resizingState.initialStartTime;
                              let d = resizingState.initialDuration - diff;
                              let o = resizingState.initialOffset + diff;
                              if (o < 0) { o = 0; s = resizingState.initialStartTime - resizingState.initialOffset; d = resizingState.initialDuration + resizingState.initialOffset; }
                              newClip.startTime = s; newClip.duration = Math.max(0.1, d); newClip.audioOffset = o;
                          }
                          return newClip;
                      })};
              })); return;
          }
          if (draggingClipId && draggingTrackId && activeTool === 'cursor') {
              let s = dragOriginalStartTimeRef.current + (clientX - dragStartXRef.current) / pixelsPerSecond;
              if (audioState.snapToGrid) s = Math.round(s / (60/audioState.bpm/4))*(60/audioState.bpm/4);
              setTracks(prev => prev.map(t => t.id === draggingTrackId ? { ...t, clips: t.clips.map(c => c.id === draggingClipId ? { ...c, startTime: Math.max(Math.max(0, dragConstraintsRef.current.min), Math.min(s, dragConstraintsRef.current.max)) } : c) } : t));
          }
      };

      const handleEnd = () => {
          if (isScrubbingRef.current) { 
              isScrubbingRef.current = false; 
              if (wasPlayingRef.current && currentScrubTimeRef.current !== null) togglePlay(currentScrubTimeRef.current);
              currentScrubTimeRef.current = null;
          }
          isDraggingLoopStartRef.current = false; isDraggingLoopEndRef.current = false; isCreatingLoopRef.current = false;
          if (resizingState.isResizing) setResizingState({ isResizing: false, direction: null, clipId: null, trackId: null, initialX: 0, initialStartTime: 0, initialDuration: 0, initialOffset: 0 });
          if (draggingClipId) {
              if (audioState.isPlaying && draggingTrackId) {
                   audioEngine.stopClip(draggingClipId); const track = tracks.find(t => t.id === draggingTrackId); const clip = track?.clips.find(c => c.id === draggingClipId);
                   if (track && clip && audioState.currentTime >= clip.startTime && audioState.currentTime < clip.startTime + clip.duration) audioEngine.playClip(clip, track, audioEngine.currentTime, audioState.currentTime - clip.startTime);
              }
              setDraggingClipId(null); setDraggingTrackId(null);
          }
      };

      const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
      const handleTouchMove = (e: TouchEvent) => { if (draggingClipId || resizingState.isResizing || isDraggingLoopStartRef.current || isDraggingLoopEndRef.current || isScrubbingRef.current) e.preventDefault(); handleMove(e.touches[0].clientX); };
      
      window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleEnd); window.addEventListener('touchmove', handleTouchMove, { passive: false }); window.addEventListener('touchend', handleEnd);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleEnd); window.removeEventListener('touchmove', handleTouchMove); window.removeEventListener('touchend', handleEnd); };
  }, [draggingClipId, draggingTrackId, pixelsPerSecond, audioState.isPlaying, audioState.snapToGrid, audioState.bpm, tracks, togglePlay, resizingState]);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  // --- RENDER CONDITION: DASHBOARD VS DAW ---
  if (!currentProjectName) {
      return (
          <Dashboard 
              rootHandle={rootHandle}
              onSelectRoot={handleSelectRootFolder}
              onOpenProject={handleLoadProject}
              onNewProject={handleCreateNewProject}
          />
      );
  }

  // AI Mixing Handler
  const handleApplyAiMix = (newChain: string[], newSettings: any) => {
      if (!selectedTrackId) return;
      
      setTracks(prev => prev.map(t => {
          if (t.id === selectedTrackId) {
              // Merge existing settings with new AI settings
              const mergedEffects = { ...t.effects };
              Object.keys(newSettings).forEach(key => {
                  mergedEffects[key] = { ...(mergedEffects[key] || {}), ...newSettings[key] };
              });

              const updatedTrack = {
                  ...t,
                  activeEffects: newChain,
                  effects: mergedEffects
              };
              
              // Apply audio changes
              audioEngine.rebuildTrackEffects(updatedTrack);
              return updatedTrack;
          }
          return t;
      }));
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--bg-main)] text-[var(--text-main)] font-sans selection:bg-[var(--accent)] selection:text-black overflow-hidden relative transition-colors duration-300" style={THEMES[theme] as React.CSSProperties} onContextMenu={(e) => e.preventDefault()}>
      
      <ReleaseNotes />

      {/* Modals */}
      <ProjectManager 
          isOpen={projectManagerOpen}
          mode={projectManagerMode}
          onClose={() => setProjectManagerOpen(false)}
          rootHandle={rootHandle}
          onSelectRoot={handleSelectRootFolder}
          onConfirmAction={projectManagerMode === 'save' ? handleSaveProject : handleLoadProject}
      />

      {showAiModal && selectedTrack && (
          <AiAssistantModal 
              track={selectedTrack}
              onApplyMix={handleApplyAiMix}
              onClose={() => setShowAiModal(false)}
          />
      )}

      {isProcessing && (
          <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center cursor-wait animate-in fade-in duration-300">
              <div className="w-16 h-16 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-6"></div>
              <h2 className="text-[var(--accent)] text-xl font-black tracking-[0.3em] uppercase animate-pulse">{processingMessage}</h2>
              <p className="text-[var(--text-muted)] text-xs mt-2 uppercase tracking-widest">Please Wait</p>
          </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
          <div className="fixed z-[100] bg-[#111] border border-[#333] rounded-sm shadow-xl py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100 flex flex-col" style={{ top: contextMenu.y, left: contextMenu.x }}>
              {/* ... (Existing Context Menu) ... */}
              <div className="px-3 py-2 text-[10px] text-[#555] font-bold uppercase tracking-wider border-b border-[#333]">Clip Operations</div>
              <button onClick={() => processClipBuffer('removesilence')} className="w-full text-left px-4 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--bg-element)] flex items-center gap-2 group"><ScissorsLineDashed className="w-3 h-3" /> Remove Silence <span className="bg-[var(--accent)] text-black text-[9px] px-1 rounded ml-auto">PRO</span></button>
              <button onClick={() => processClipBuffer('neural')} className="w-full text-left px-4 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--bg-element)] flex items-center gap-2 group"><Sparkles className="w-3 h-3" /> Neural Enhance <span className="bg-[var(--accent)] text-black text-[9px] px-1 rounded ml-auto">PRO</span></button>
              <button onClick={() => processClipBuffer('lofi')} className="w-full text-left px-4 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--bg-element)] flex items-center gap-2 group"><Radio className="w-3 h-3" /> Lo-Fi Crusher <span className="bg-[var(--accent)] text-black text-[9px] px-1 rounded ml-auto">PRO</span></button>
              <button onClick={() => processClipBuffer('deesser')} className="w-full text-left px-4 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--bg-element)] flex items-center gap-2 group"><Mic2 className="w-3 h-3" /> Vocal De-Esser <span className="bg-[var(--accent)] text-black text-[9px] px-1 rounded ml-auto">PRO</span></button>
              <div className="h-[1px] bg-[#333] my-1"></div>
              <button onClick={() => processClipBuffer('normalize')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2"><TrendingUp className="w-3 h-3" /> Normalize</button>
              <button onClick={() => processClipBuffer('gain')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2"><Volume2 className="w-3 h-3" /> Gain +3dB</button>
              <button onClick={() => processClipBuffer('silence')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2"><VolumeX className="w-3 h-3" /> Silence</button>
              <button onClick={() => processClipBuffer('invert')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2"><ArrowLeftRight className="w-3 h-3 rotate-90" /> Invert Phase</button>
              <button onClick={() => processClipBuffer('reverse')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2"><ArrowLeftRight className="w-3 h-3" /> Reverse</button>
              <div className="h-[1px] bg-[#333] my-1"></div>
              <button onClick={() => processClipBuffer('fadein')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2">Fade In</button>
              <button onClick={() => processClipBuffer('fadeout')} className="w-full text-left px-4 py-2 text-xs font-bold text-white hover:bg-[#222] flex items-center gap-2">Fade Out</button>
              <button onClick={deleteSelectedClip} className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-900/20 flex items-center gap-2"><Trash2 className="w-3 h-3" /> Delete Clip</button>
          </div>
      )}

      {showEffectSelector && effectSelectorTrackId && (
          <EffectSelector onSelect={(effectId) => addEffect(effectSelectorTrackId, effectId)} onClose={() => { setShowEffectSelector(false); setEffectSelectorTrackId(null); }} />
      )}

      {/* FULL SCREEN EFFECT OVERLAY */}
      {openedEffect && tracks.find(t => t.id === openedEffect.trackId) && (
          <div className="fixed inset-0 z-50 bg-[var(--bg-main)] flex flex-col animate-in fade-in duration-200">
              <div className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-6 bg-[var(--bg-panel)] shrink-0">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setOpenedEffect(null)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors uppercase text-xs font-bold tracking-widest border border-[var(--border-color)] px-3 py-1.5 rounded hover:border-[var(--text-muted)]"><ArrowLeft className="w-4 h-4" /> Back</button>
                      <div className="h-6 w-[1px] bg-[var(--border-color)]"></div>
                      <div className="flex flex-col"><span className="text-lg font-bold text-[var(--text-main)] uppercase tracking-tight leading-none">{openedEffect.effectId}</span><span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">{tracks.find(t => t.id === openedEffect.trackId)?.name}</span></div>
                  </div>
              </div>
              <div className="flex-1 overflow-auto md:overflow-hidden relative p-4 bg-black">
                  {(() => {
                      const track = tracks.find(t => t.id === openedEffect.trackId)!; const fx = openedEffect.effectId; const plugin = EffectRegistry.get(fx);
                      if (plugin) { const PluginComponent = plugin.component; return <PluginComponent trackId={track.id} settings={track.effects[fx] || plugin.defaultSettings} onChange={(newSettings) => updateEffects(track.id, { [fx]: newSettings })} />; }
                      if (fx === 'parametricEQ') return <ParametricEQ trackId={track.id} settings={track.effects.parametricEQ} onChange={(newSettings) => updateEffects(track.id, { parametricEQ: { ...track.effects.parametricEQ, ...newSettings } })} />;
                      if (fx === 'compressor') return <CompressorEffect trackId={track.id} settings={track.effects.compressor} onChange={(newSettings) => updateEffects(track.id, { compressor: newSettings })} />;
                      if (fx === 'reverb') return <ReverbEffect trackId={track.id} settings={track.effects.reverb} onChange={(newSettings) => updateEffects(track.id, { reverb: newSettings })} />;
                      if (fx === 'autoPitch') return <TunerEffect trackId={track.id} settings={track.effects.autoPitch} onChange={(newSettings) => updateEffects(track.id, { autoPitch: newSettings })} />;
                      if (fx === 'distortion') return <div className="w-full h-full flex items-center justify-center bg-black"><DistortionEffect value={track.effects.distortion} onChange={(v) => updateEffects(track.id, { distortion: v })} /></div>;
                      if (fx === 'delay') return <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-8 border border-zinc-800 m-8 rounded-sm"><h2 className="text-2xl text-zinc-500 tracking-widest font-bold">DIGITAL DELAY</h2><div className="flex gap-12"><Knob value={track.effects.delay.time} min={0} max={1} onChange={(v) => updateEffects(track.id, { delay: { ...track.effects.delay, time: v } })} label="TIME" /><Knob value={track.effects.delay.feedback} min={0} max={0.9} onChange={(v) => updateEffects(track.id, { delay: { ...track.effects.delay, feedback: v } })} label="FEEDBACK" /><Knob value={track.effects.delay.mix} min={0} max={1} onChange={(v) => updateEffects(track.id, { delay: { ...track.effects.delay, mix: v } })} label="MIX" /></div></div>;
                      return <div className="w-full h-full flex items-center justify-center text-zinc-600">Effect GUI Not Available</div>;
                  })()}
              </div>
          </div>
      )}

      {/* --- MODULAR LAYOUT --- */}
      
      {/* 1. Header (Transport & Tools) */}
      <Header 
        audioState={audioState} setAudioState={setAudioState} togglePlay={togglePlay} handleStop={handleStop} toggleRecord={toggleRecord} formatTime={formatTime}
        isMonitoring={isMonitoring} toggleMonitoring={toggleMonitoring}
        undoTracks={undoTracks} redoTracks={redoTracks} canUndo={canUndo} canRedo={canRedo} 
        
        saveProjectToDisk={handleQuickSave} 
        openProjectFromDisk={() => toggleProjectManager('open')} 
        onGoHome={handleGoHome}
        exportWav={exportWav}
        
        toggleTheme={toggleTheme} toggleFullScreen={toggleFullScreen} isFullScreen={isFullScreen}
        isTrackListOpen={isTrackListOpen} setIsTrackListOpen={setIsTrackListOpen} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
        
        currentProjectName={currentProjectName}
      />

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* 2. Track List Sidebar */}
        <TrackList 
            tracks={tracks} selectedTrackId={selectedTrackId} setSelectedTrackId={setSelectedTrackId} updateTrack={updateTrack}
            addNewTrack={addNewTrack} handleImportBeat={handleImportBeat} duplicateTrack={duplicateTrack} deleteTrack={deleteTrack} editTrackName={editTrackName}
            isOpen={isTrackListOpen} isMobile={isMobile} closeOnMobile={() => isMobile && setIsTrackListOpen(false)} scrollTop={scrollTop}
        />

        {/* 3. Main Timeline */}
        <Timeline 
            tracks={tracks} audioState={audioState} setAudioState={setAudioState} zoomLevel={zoomLevel} pixelsPerSecond={pixelsPerSecond} handleZoom={handleZoom} scrollRef={scrollContainerRef} setScrollTop={setScrollTop}
            activeTool={activeTool} setActiveTool={setActiveTool} toggleLoop={toggleLoop} togglePlay={togglePlay} selectedClipId={selectedClipId} deleteSelectedClip={deleteSelectedClip} splitTrack={splitTrack}
            handleClipInteractionStart={handleClipInteractionStart} handleContextMenu={handleContextMenu}
            
            // Interaction State
            isCreatingLoop={isCreatingLoopRef.current} 
            loopStartAnchor={loopStartAnchorRef.current} 
            isDraggingLoopStart={isDraggingLoopStartRef.current} 
            isDraggingLoopEnd={isDraggingLoopEndRef.current} 
            isScrubbing={isScrubbingRef.current} 
            currentScrubTime={currentScrubTimeRef.current} 
            wasPlayingRef={wasPlayingRef}
            
            // Pass refs for interaction
            isDraggingLoopStartRef={isDraggingLoopStartRef}
            isDraggingLoopEndRef={isDraggingLoopEndRef}
            isCreatingLoopRef={isCreatingLoopRef}
            isScrubbingRef={isScrubbingRef}
            loopStartAnchorRef={loopStartAnchorRef}
        />

        {/* 4. Mixer Sidebar */}
        <MixerSidebar 
            isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} isMobile={isMobile} selectedTrack={selectedTrack} updateTrack={updateTrack} updateEffects={updateEffects}
            setEffectSelectorTrackId={setEffectSelectorTrackId} setShowEffectSelector={setShowEffectSelector} setOpenedEffect={setOpenedEffect} setTracks={setTracks}
            onOpenAiAssistant={() => setShowAiModal(true)}
        />

        {/* Backdrop for Mobile Sidebar */}
        {isMobile && (isTrackListOpen || isSidebarOpen) && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20" onClick={() => { setIsTrackListOpen(false); setIsSidebarOpen(false); }} />
        )}
      </div>
    </div>
  );
}
