import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Music, FolderOpen, ArrowLeft, TrendingUp, Sparkles, VolumeX, Radio, Mic2, ScissorsLineDashed, ArrowLeftRight, Volume2, Trash2, LogOut, X } from 'lucide-react';
import saveAs from 'file-saver';
import JSZip from 'jszip'; 
import { audioEngine } from './services/AudioEngine';
import { Track, TrackType, AudioEngineState, Clip, EffectSettings, ContextMenuState } from './types';
import { EffectRegistry } from './services/EffectRegistry';
import { Knob } from './components/Knob';
import { EffectSelector } from './components/EffectSelector';

import { api } from './services/api';

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
import { CompositionAssistant } from './components/CompositionAssistant';
import { ProjectManager } from './components/ProjectManager';
import { Dashboard } from './components/Dashboard';
import { AiAssistantModal } from './components/AiAssistantModal';
import { BeatGeneratorModal } from './components/BeatGeneratorModal';

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
    '--accent': '#eab308', // Amarelo Ouro para destaque profissional
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
  phaser: { rate: 0.5, depth: 0.5, active: false },
  // Master Defaults
  proLimiter: { threshold: -3.0, ceiling: -0.1, release: 0.1, active: true },
  multibandComp: { lowThresh: -20, midThresh: -20, highThresh: -20, active: true }
};

export default function App() {
  // State
  const [theme, setTheme] = useState<string>('monochrome');
  const [tracks, setTracks, undoTracks, redoTracks, canUndo, canRedo] = useUndoRedo<Track[]>([]);
  
  // MASTER TRACK STATE
  const [masterTrack, setMasterTrack] = useState<Track>({
      id: 'MASTER',
      name: 'Master Output',
      type: TrackType.MASTER,
      volume: 1.0,
      pan: 0,
      muted: false,
      solo: false,
      bypassFX: false,
      clips: [],
      effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() },
      activeEffects: ['proLimiter'] // Default limiter on master
  });

  // Project Management State
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);

  // Refs for tracking state inside animation frames without stale closures
  const tracksRef = useRef<Track[]>(tracks);
  
  useEffect(() => {
      tracksRef.current = tracks;
  }, [tracks]);

  // Master Track Effect Logic
  useEffect(() => {
      audioEngine.initializeMasterTrack(masterTrack);
      audioEngine.rebuildTrackEffects(masterTrack);
  }, []); // Run once on mount

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Responsive UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mixer
  const [isCompositionOpen, setIsCompositionOpen] = useState(false); // New Composition Assistant
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
  // AI Beat State
  const [showBeatModal, setShowBeatModal] = useState(false);

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
      if (mobile) { setIsTrackListOpen(false); setIsSidebarOpen(false); setIsCompositionOpen(false); } else { setIsTrackListOpen(true); setIsSidebarOpen(true); }
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
  
  // Toggle Sidebars Mutually Exclusive Logic
  const toggleMixer = () => {
      if (!isSidebarOpen) setIsCompositionOpen(false);
      setIsSidebarOpen(!isSidebarOpen);
  };
  
  const toggleComposition = () => {
      if (!isCompositionOpen) setIsSidebarOpen(false);
      setIsCompositionOpen(!isCompositionOpen);
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
    // Master Volume Update handled via AudioEngine state
    audioEngine.setMasterVolume(audioState.masterVolume);
    // Update Master Track Effects real-time
    audioEngine.updateTrackSettings(masterTrack);
  }, [tracks, audioState.isPlaying, isMonitoring, audioState.masterVolume, masterTrack]);

  // --- CLOUD SAVE/LOAD (ZIP) LOGIC ---

  const handleCloudSave = async (projectName: string) => {
      setProjectManagerOpen(false);
      setIsProcessing(true);
      setProcessingMessage("PACKING & UPLOADING...");

      try {
          const zip = new JSZip();
          
          // 1. Prepare JSON Data (Lightweight, no blobs)
          const projectState = {
              audioState,
              masterTrack: { ...masterTrack, clips: [] }, 
              tracks: tracks.map(t => ({
                  ...t,
                  clips: t.clips.map(c => ({
                      ...c,
                      buffer: null, // Don't save buffer in JSON
                      blob: null,   // Don't save blob in JSON
                      fileName: `${c.id}.wav` // Reference to file
                  }))
              }))
          };
          zip.file('project.monochrome', JSON.stringify(projectState));

          // 2. Add Samples to ZIP
          const samplesFolder = zip.folder("samples");
          if (samplesFolder) {
              for (const track of tracks) {
                  for (const clip of track.clips) {
                      if (clip.buffer) {
                          // Convert buffer to WAV Blob
                          let blobToWrite = clip.blob;
                          if (!blobToWrite) {
                              blobToWrite = audioEngine.bufferToWave(clip.buffer, clip.buffer.length);
                          }
                          samplesFolder.file(`${clip.id}.wav`, blobToWrite);
                      }
                  }
              }
          }

          // 3. Generate ZIP Blob
          const content = await zip.generateAsync({ type: "blob" });

          // 4. Upload to API
          const formData = new FormData();
          formData.append('name', projectName);
          formData.append('projectZip', content, `${projectName}.zip`);

          await api.post('/projects/cloud/save', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });

          setCurrentProjectName(projectName);
          setTimeout(() => {
              setIsProcessing(false);
              alert("Projeto salvo na nuvem com sucesso!");
          }, 500);

      } catch (err) {
          console.error("Cloud Save Error:", err);
          setIsProcessing(false);
          alert("Erro ao salvar na nuvem.");
      }
  };

  const handleCloudLoad = async (projectId: string) => {
      await audioEngine.resumeContext();
      handleStop();
      setIsProcessing(true);
      setProcessingMessage("DOWNLOADING & UNPACKING...");

      try {
          // 1. Get Project URL
          const { data: projectMeta } = await api.get(`/projects/${projectId}`);
          const zipUrl = projectMeta.zipUrl;

          // 2. Download ZIP
          const response = await fetch(zipUrl);
          const blob = await response.blob();

          // 3. Unzip
          const zip = await JSZip.loadAsync(blob);
          
          // 4. Load JSON State
          const jsonFile = zip.file('project.monochrome');
          if (!jsonFile) throw new Error("Invalid Project File");
          
          const jsonText = await jsonFile.async('string');
          const projectData = JSON.parse(jsonText);

          // 5. Load Audio Samples
          const loadedTracks: Track[] = [];
          
          for (const trackData of projectData.tracks) {
              const clips: Clip[] = [];
              for (const clipData of trackData.clips) {
                  if (clipData.fileName) {
                      const sampleFile = zip.file(`samples/${clipData.fileName}`);
                      if (sampleFile) {
                          const arrayBuffer = await sampleFile.async('arraybuffer');
                          if (arrayBuffer.byteLength > 0) {
                              const buffer = await audioEngine.decodeAudioData(arrayBuffer);
                              clips.push({
                                  ...clipData,
                                  buffer: buffer,
                                  blob: new Blob([arrayBuffer], { type: 'audio/wav' })
                              });
                          }
                      }
                  }
              }
              loadedTracks.push({ ...trackData, clips });
          }

          // 6. Restore State
          setTracks(loadedTracks);
          if (projectData.masterTrack) {
              const loadedMaster = { ...masterTrack, ...projectData.masterTrack };
              setMasterTrack(loadedMaster);
              audioEngine.rebuildTrackEffects(loadedMaster);
          }
          setAudioState(prev => ({ ...prev, ...projectData.audioState, isPlaying: false }));
          setCurrentProjectName(projectMeta.name);

          setTimeout(() => setIsProcessing(false), 500);

      } catch (err) {
          console.error("Cloud Load Error:", err);
          setIsProcessing(false);
          alert("Erro ao abrir projeto da nuvem.");
      }
  };

  const handleCreateNewProject = async () => {
      const name = prompt("Nome do Novo Projeto:", "Sem Titulo");
      if (!name) return;
      
      setTracks([]);
      setMasterTrack({ ...masterTrack, activeEffects: ['proLimiter'] });
      setAudioState({
        isPlaying: false, currentTime: 0, totalDuration: 120, isRecording: false, bpm: 120, snapToGrid: true, metronomeOn: false, masterVolume: 0.8,
        loop: { active: false, start: 0, end: 4 }
      });
      await audioEngine.resumeContext();
      
      // Initial cloud save to "reserve" the name/slot
      handleCloudSave(name);
  };

  const handleQuickSave = () => {
      if (currentProjectName) {
          handleCloudSave(currentProjectName);
      } else {
          setProjectManagerOpen(true); // Open modal to ask for name
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
            setTracks(prev => [...prev, { id: crypto.randomUUID(), name: file.name.replace(/\.[^/.]+$/, ""), type: TrackType.BEAT, volume: 0.8, pan: 0, muted: false, solo: false, bypassFX: false, clips: [newClip], effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, activeEffects: [] }]);
            setAudioState(prev => ({ ...prev, totalDuration: Math.max(prev.totalDuration, audioBuffer.duration + 10) }));
        }
    } catch (err) { alert("Failed to decode audio file."); }
  };

  const addNewTrack = () => {
      setTracks(prev => [...prev, { id: crypto.randomUUID(), name: `Track ${tracks.length + 1}`, type: TrackType.VOCAL, volume: 0.8, pan: 0, muted: false, solo: false, bypassFX: false, clips: [], effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, activeEffects: [] }]);
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

  // --- IMPORT AI BEAT (New) ---
  const handleImportAiBeat = (audioBuffer: AudioBuffer, name: string) => {
      const newClip: Clip = { 
          id: crypto.randomUUID(), 
          name: name, 
          buffer: audioBuffer,
          duration: audioBuffer.duration, 
          audioOffset: 0, 
          startTime: 0 
      };
      
      const newTrack: Track = { 
          id: crypto.randomUUID(), 
          name: "AI Beat", 
          type: TrackType.BEAT, 
          volume: 0.8, 
          pan: 0, 
          muted: false, 
          solo: false, 
          bypassFX: false, 
          clips: [newClip], 
          effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, 
          activeEffects: [] 
      };

      setTracks(prev => [...prev, newTrack]);
      setAudioState(prev => ({ ...prev, totalDuration: Math.max(prev.totalDuration, audioBuffer.duration + 10) }));
  };

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
            const newTrack: Track = { id: crypto.randomUUID(), name: `Vocal Rec`, type: TrackType.VOCAL, volume: 1.0, pan: 0, muted: false, solo: false, bypassFX: false, clips: [], effects: { ...JSON.parse(JSON.stringify(BASE_DEFAULTS)), ...EffectRegistry.getDefaultSettings() }, activeEffects: [] };
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


  const updateTrack = (id: string, updates: Partial<Track>) => {
      if (id === 'MASTER') {
          const updated = { ...masterTrack, ...updates };
          setMasterTrack(updated);
          // If bypassing FX, rebuild chain to reflect graph change
          if (updates.bypassFX !== undefined) audioEngine.rebuildTrackEffects(updated);
          else audioEngine.updateTrackSettings(updated);
      } else {
          setTracks(prev => prev.map(t => { 
              if (t.id === id) { 
                  const updated = { ...t, ...updates };
                  // If bypassing FX or reordering, rebuild chain
                  if (updates.bypassFX !== undefined || updates.activeEffects) {
                      audioEngine.rebuildTrackEffects(updated);
                  } else {
                      audioEngine.updateTrackSettings(updated);
                  }
                  return updated;
              } 
              return t; 
          }));
      }
  };

  const updateEffects = (id: string, updates: Partial<Track['effects']>) => {
      if (id === 'MASTER') {
          const updated = { ...masterTrack, effects: { ...masterTrack.effects, ...updates } };
          setMasterTrack(updated);
          audioEngine.updateTrackSettings(updated);
      } else {
          setTracks(prev => prev.map(t => { if (t.id === id) { const updated = { ...t, effects: { ...t.effects, ...updates } }; audioEngine.updateTrackSettings(updated); return updated; } return t; }));
      }
  };

  const addEffect = (trackId: string, effectName: string) => {
       if (trackId === 'MASTER') {
           if (!masterTrack.activeEffects.includes(effectName)) {
               const updated = { ...masterTrack, activeEffects: [...masterTrack.activeEffects, effectName] };
               setMasterTrack(updated);
               audioEngine.rebuildTrackEffects(updated);
           }
           setOpenedEffect({ trackId: 'MASTER', effectId: effectName });
       } else {
           setTracks(prev => prev.map(t => { if (t.id === trackId && !t.activeEffects.includes(effectName)) { const updated = { ...t, activeEffects: [...t.activeEffects, effectName] }; audioEngine.rebuildTrackEffects(updated); return updated; } return t; }));
           setOpenedEffect({ trackId, effectId: effectName });
       }
       setShowEffectSelector(false); 
  };

  // --- Context Menu Logic ---
  const handleContextMenu = (e: React.MouseEvent, trackId: string, clipId: string) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300), trackId, clipId }); };
  const closeContextMenu = () => setContextMenu(prev => ({ ...prev, visible: false }));
  useEffect(() => { window.addEventListener('click', closeContextMenu); return () => window.removeEventListener('click', closeContextMenu); }, []);

  // --- PROCESSING UTILS ---
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

  const selectedTrack = selectedTrackId === 'MASTER' ? masterTrack : tracks.find(t => t.id === selectedTrackId);
  const selectedClip = selectedTrack && selectedClipId ? selectedTrack.clips.find(c => c.id === selectedClipId) : null;

  // --- RENDER CONDITION: DASHBOARD VS DAW ---
  if (!currentProjectName) {
      return (
          <Dashboard 
              onOpenProject={handleCloudLoad}
              onNewProject={handleCreateNewProject}
          />
      );
  }

  // AI Mixing Handler (Updates Tracks + Master)
  const handleApplyAiMix = (result: any) => {
      // 1. Update Tracks
      if (result.tracks && Array.isArray(result.tracks)) {
          setTracks(prev => prev.map(t => {
              // Find config for this track in the array
              const newConfig = result.tracks.find((tc: any) => tc.trackId === t.id);
              if (newConfig) {
                  const mergedEffects = { ...t.effects };
                  if (newConfig.settings) {
                      Object.keys(newConfig.settings).forEach(key => {
                          mergedEffects[key] = { ...(mergedEffects[key] || {}), ...newConfig.settings[key] };
                      });
                  }
                  const updated = { ...t, activeEffects: newConfig.chain || t.activeEffects, effects: mergedEffects };
                  audioEngine.rebuildTrackEffects(updated);
                  return updated;
              }
              return t;
          }));
      }

      // 2. Update Master
      if (result.master) {
          const newMasterConfig = result.master;
          const mergedMasterEffects = { ...masterTrack.effects };
          if (newMasterConfig.settings) {
              Object.keys(newMasterConfig.settings).forEach(key => {
                  mergedMasterEffects[key] = { ...(mergedMasterEffects[key] || {}), ...newMasterConfig.settings[key] };
              });
          }
          const updatedMaster = { ...masterTrack, activeEffects: newMasterConfig.chain || masterTrack.activeEffects, effects: mergedMasterEffects };
          setMasterTrack(updatedMaster);
          audioEngine.rebuildTrackEffects(updatedMaster);
      }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[var(--bg-main)] text-[var(--text-main)] font-sans selection:bg-[var(--accent)] selection:text-black overflow-hidden relative transition-colors duration-300" style={THEMES[theme] as React.CSSProperties} onContextMenu={(e) => e.preventDefault()}>
      
      <ReleaseNotes />

      {/* Modals */}
      <ProjectManager
        isOpen={projectManagerOpen}
        onClose={() => setProjectManagerOpen(false)}
        onConfirmAction={handleCloudSave}
      />

      {showAiModal && (
        <AiAssistantModal
            tracks={tracks}
            onApplyMix={handleApplyAiMix}
            onClose={() => setShowAiModal(false)}
        />
      )}

      {showBeatModal && (
        <BeatGeneratorModal
            onImport={handleImportAiBeat}
            onClose={() => setShowBeatModal(false)}
        />
      )}

      {showEffectSelector && (
          <EffectSelector 
              onSelect={(effectId) => {
                  if (effectSelectorTrackId) addEffect(effectSelectorTrackId, effectId);
              }}
              onClose={() => setShowEffectSelector(false)}
          />
      )}

      {/* Main Layout */}
      <Header 
        audioState={audioState}
        setAudioState={setAudioState}
        togglePlay={togglePlay}
        handleStop={handleStop}
        toggleRecord={toggleRecord}
        formatTime={formatTime}
        isMonitoring={isMonitoring}
        toggleMonitoring={toggleMonitoring}
        undoTracks={undoTracks}
        redoTracks={redoTracks}
        canUndo={canUndo}
        canRedo={canRedo}
        saveProjectToDisk={handleQuickSave}
        openProjectFromDisk={() => handleGoHome()}
        onGoHome={handleGoHome}
        exportWav={exportWav}
        toggleTheme={toggleTheme}
        toggleFullScreen={toggleFullScreen}
        isFullScreen={isFullScreen}
        isTrackListOpen={isTrackListOpen}
        setIsTrackListOpen={setIsTrackListOpen}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={toggleMixer} // Use the toggle function
        isCompositionOpen={isCompositionOpen}
        setIsCompositionOpen={toggleComposition} // Use the toggle function
        currentProjectName={currentProjectName}
        onSelectMaster={() => setSelectedTrackId('MASTER')}
        selectedTrackId={selectedTrackId}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <TrackList 
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            setSelectedTrackId={setSelectedTrackId}
            updateTrack={updateTrack}
            addNewTrack={addNewTrack}
            handleImportBeat={handleImportBeat}
            duplicateTrack={duplicateTrack}
            deleteTrack={deleteTrack}
            editTrackName={editTrackName}
            isOpen={isTrackListOpen}
            isMobile={isMobile}
            closeOnMobile={() => setIsTrackListOpen(false)}
            scrollTop={scrollTop}
            onOpenBeatGen={() => setShowBeatModal(true)}
        />

        <Timeline 
            tracks={tracks}
            audioState={audioState}
            setAudioState={setAudioState}
            zoomLevel={zoomLevel}
            pixelsPerSecond={pixelsPerSecond}
            handleZoom={handleZoom}
            scrollRef={scrollContainerRef}
            setScrollTop={setScrollTop}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            toggleLoop={toggleLoop}
            togglePlay={togglePlay}
            selectedClipId={selectedClipId}
            deleteSelectedClip={deleteSelectedClip}
            splitTrack={splitTrack}
            handleClipInteractionStart={handleClipInteractionStart}
            handleContextMenu={handleContextMenu}
            isCreatingLoop={isCreatingLoopRef.current}
            loopStartAnchor={loopStartAnchorRef.current}
            isDraggingLoopStart={isDraggingLoopStartRef.current}
            isDraggingLoopEnd={isDraggingLoopEndRef.current}
            isScrubbing={isScrubbingRef.current}
            currentScrubTime={currentScrubTimeRef.current}
            wasPlayingRef={wasPlayingRef}
            isCreatingLoopRef={isCreatingLoopRef}
            isDraggingLoopStartRef={isDraggingLoopStartRef}
            isDraggingLoopEndRef={isDraggingLoopEndRef}
            isScrubbingRef={isScrubbingRef}
            loopStartAnchorRef={loopStartAnchorRef}
        />

        <MixerSidebar 
            isOpen={isSidebarOpen}
            setIsOpen={setIsSidebarOpen}
            isMobile={isMobile}
            selectedTrack={selectedTrack}
            updateTrack={updateTrack}
            updateEffects={updateEffects}
            setEffectSelectorTrackId={setEffectSelectorTrackId}
            setShowEffectSelector={setShowEffectSelector}
            setOpenedEffect={setOpenedEffect}
            setTracks={setTracks}
            setMasterTrack={setMasterTrack}
            onOpenAiAssistant={() => setShowAiModal(true)}
        />

        <CompositionAssistant
            isOpen={isCompositionOpen}
            onClose={() => setIsCompositionOpen(false)}
            isMobile={isMobile}
            selectedClip={selectedClip}
        />
      </div>
      
      {/* Context Menus & Overlays */}
      {contextMenu.visible && (
        <div 
            className="fixed z-50 bg-[#111] border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
        >
            <button onClick={() => processClipBuffer('gain')} className="w-full text-left px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 hover:text-white">Normalize Gain</button>
            <button onClick={() => processClipBuffer('reverse')} className="w-full text-left px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 hover:text-white">Reverse Audio</button>
            <button onClick={() => processClipBuffer('fadein')} className="w-full text-left px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 hover:text-white">Fade In (1s)</button>
            <button onClick={() => processClipBuffer('fadeout')} className="w-full text-left px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 hover:text-white">Fade Out (1s)</button>
            <div className="h-[1px] bg-zinc-800 my-1"></div>
            <button onClick={() => deleteSelectedClip()} className="w-full text-left px-4 py-2 text-xs hover:bg-red-900/50 text-red-400">Delete Clip</button>
        </div>
      )}

      {/* Effect Rack Modal (When clicking specific effect to edit) */}
      {openedEffect && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpenedEffect(null)}>
              <div className="relative bg-[#050505] border border-zinc-700 rounded-lg shadow-2xl overflow-hidden max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center p-3 bg-[#0a0a0a] border-b border-zinc-800">
                      <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{openedEffect.effectId}</span>
                      <button onClick={() => setOpenedEffect(null)}><X className="w-4 h-4 text-zinc-500 hover:text-white" /></button>
                  </div>
                  <div className="p-0 bg-black overflow-y-auto custom-scrollbar" style={{ minHeight: '300px' }}>
                      {(() => {
                          const track = openedEffect.trackId === 'MASTER' ? masterTrack : tracks.find(t => t.id === openedEffect.trackId);
                          if (!track) return null;
                          const settings = track.effects[openedEffect.effectId];
                          const plugin = EffectRegistry.get(openedEffect.effectId);
                          
                          // Handle Plugin-based UI
                          if (plugin) {
                              return <plugin.component 
                                  trackId={track.id} 
                                  settings={settings || plugin.defaultSettings} 
                                  onChange={(newSettings: any) => updateEffects(track.id, { [openedEffect.effectId]: newSettings })} 
                              />;
                          }

                          // Handle Legacy UI
                          switch(openedEffect.effectId) {
                              case 'parametricEQ': return <ParametricEQ trackId={track.id} settings={settings} onChange={(s) => updateEffects(track.id, { parametricEQ: s })} />;
                              case 'compressor': return <CompressorEffect trackId={track.id} settings={settings} onChange={(s) => updateEffects(track.id, { compressor: s })} />;
                              case 'reverb': return <ReverbEffect trackId={track.id} settings={settings} onChange={(s) => updateEffects(track.id, { reverb: s })} />;
                              case 'autoPitch': return <TunerEffect trackId={track.id} settings={settings} onChange={(s) => updateEffects(track.id, { autoPitch: s })} />;
                              case 'distortion': return <DistortionEffect value={settings} onChange={(s) => updateEffects(track.id, { distortion: s })} />;
                              default: return <div className="p-8 text-center text-zinc-500">Generic Interface Not Implemented</div>;
                          }
                      })()}
                  </div>
              </div>
          </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
          <div className="fixed inset-0 z-[200] bg-black/80 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-white font-bold tracking-widest uppercase text-sm animate-pulse">{processingMessage}</span>
          </div>
      )}

    </div>
  );
}