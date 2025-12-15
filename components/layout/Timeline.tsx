import React, { useMemo, useEffect } from 'react';
import { Layers, MousePointer2, Scissors, Magnet, Repeat, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Track, AudioEngineState } from '../../types';
import { Waveform } from '../Waveform';

interface TimelineProps {
  tracks: Track[];
  audioState: AudioEngineState;
  setAudioState: React.Dispatch<React.SetStateAction<AudioEngineState>>;
  
  // UI State
  zoomLevel: number;
  pixelsPerSecond: number;
  handleZoom: (dir: 'in' | 'out') => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  setScrollTop: (val: number) => void;
  
  // Tools
  activeTool: 'cursor' | 'split';
  setActiveTool: (t: 'cursor' | 'split') => void;
  toggleLoop: () => void;
  togglePlay: () => void;
  
  // Selection
  selectedClipId: string | null;
  deleteSelectedClip: () => void;
  splitTrack: () => void;
  
  // Handlers (Passed from App for complex logic)
  handleClipInteractionStart: (e: React.MouseEvent | React.TouchEvent, trackId: string, clipId: string, action: 'move' | 'resize-left' | 'resize-right') => void;
  handleContextMenu: (e: React.MouseEvent, trackId: string, clipId: string) => void;
  
  // Dragging States (To update Playhead/Loop visual in real time)
  isCreatingLoop: boolean;
  loopStartAnchor: number;
  isDraggingLoopStart: boolean;
  isDraggingLoopEnd: boolean;
  isScrubbing: boolean;
  currentScrubTime: number | null;
  
  // Refs
  wasPlayingRef: React.MutableRefObject<boolean>;
  isCreatingLoopRef: React.MutableRefObject<boolean>;
  isDraggingLoopStartRef: React.MutableRefObject<boolean>;
  isDraggingLoopEndRef: React.MutableRefObject<boolean>;
  isScrubbingRef: React.MutableRefObject<boolean>;
  loopStartAnchorRef: React.MutableRefObject<number>;
}

export const Timeline: React.FC<TimelineProps> = ({
  tracks, audioState, setAudioState, zoomLevel, pixelsPerSecond, handleZoom, scrollRef, setScrollTop,
  activeTool, setActiveTool, toggleLoop, togglePlay, selectedClipId, deleteSelectedClip, splitTrack,
  handleClipInteractionStart, handleContextMenu,
  isCreatingLoop, loopStartAnchor, isDraggingLoopStart, isDraggingLoopEnd, isScrubbing, currentScrubTime, 
  wasPlayingRef, isCreatingLoopRef, isDraggingLoopStartRef, isDraggingLoopEndRef, isScrubbingRef, loopStartAnchorRef
}) => {

  // --- Zoom with Ctrl + Scroll & Horizontal Scroll with Shift + Scroll ---
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
        // Zoom: Ctrl + Scroll
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) handleZoom('in');
            else handleZoom('out');
        } 
        // Horizontal Scroll: Shift + Scroll
        else if (e.shiftKey) {
            e.preventDefault();
            // Ajusta o scrollLeft com base no movimento da roda (deltaY)
            // Multiplicamos por um fator para acelerar um pouco o scroll horizontal se necessário
            container.scrollLeft += e.deltaY;
        }
    };

    // Passive: false é necessário para usar preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
        container.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoom, scrollRef]);

  // --- Ruler & Grid Memoization ---
  const { Ruler, GridLines } = useMemo(() => {
      const secondsPerBeat = 60 / audioState.bpm;
      const secondsPerBar = secondsPerBeat * 4; 
      const totalBars = Math.ceil(Math.max(120, audioState.totalDuration) / secondsPerBar);
      
      const markers = []; 
      const gridLines = [];
      const trackHeight = 112; // 28 * 4 (h-28 class)

      // Horizontal Lines (Tracks)
      for(let t = 0; t < tracks.length; t++) {
        gridLines.push(
            <div 
                key={`hgrid-${t}`} 
                className="absolute left-0 right-0 border-b border-[var(--border-color)] opacity-20 pointer-events-none" 
                style={{ top: (t + 1) * trackHeight, height: 1 }} 
            />
        );
      }

      for(let i = 0; i < totalBars; i++) {
          const left = i * secondsPerBar * pixelsPerSecond;
          
          // Main Bar Line
          markers.push(
            <div key={i} className="absolute top-0 bottom-0 border-l border-[var(--border-color)] text-[10px] text-[var(--text-muted)] pl-1 select-none flex items-center h-1/2 font-mono z-10 font-bold" style={{ left }}>
                {i + 1}
            </div>
          );
          gridLines.push(
            <div key={`grid-${i}`} className="absolute top-0 bottom-0 border-l border-[var(--border-color)] opacity-30 pointer-events-none" style={{ left }} />
          );
          
          // Beats (1.2, 1.3, 1.4)
          for(let j=1; j<4; j++) {
             const beatLeft = left + (j * secondsPerBeat * pixelsPerSecond);
             markers.push(
                <div key={`${i}-${j}`} className="absolute top-0 bottom-0 text-[8px] text-[var(--text-muted)] opacity-50 pl-1 select-none flex items-center h-1/2 font-mono z-10" style={{ left: beatLeft }}>
                    {`${i + 1}.${j + 1}`}
                </div>
             );
             gridLines.push(
                <div key={`grid-${i}-${j}`} className="absolute top-0 bottom-0 border-l border-[var(--border-color)] opacity-10 pointer-events-none" style={{ left: beatLeft }} />
             );
          }
      }
      return { Ruler: markers, GridLines: gridLines };
  }, [audioState.bpm, audioState.totalDuration, pixelsPerSecond, tracks.length]);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-main)] relative overflow-hidden min-w-0">
         
         {/* Timeline Toolbar */}
         <div className="h-10 border-b border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-shrink-0 items-center justify-between px-2 md:px-4">
             <div className="hidden md:flex text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase items-center gap-2">
                <Layers className="w-3 h-3" /> Arrangement
             </div>
             
             {/* Mobile Toolbar - Condensed */}
             <div className="flex items-center gap-1 bg-[var(--bg-element)] p-1 rounded-lg border border-[var(--border-color)] overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveTool('cursor')} className={`p-1.5 rounded ${activeTool === 'cursor' ? 'bg-[var(--bg-main)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><MousePointer2 className="w-4 h-4" /></button>
                <button onClick={() => { setActiveTool('split'); splitTrack(); setTimeout(()=>setActiveTool('cursor'), 200); }} className={`p-1.5 rounded ${activeTool === 'split' ? 'bg-[var(--bg-main)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Scissors className="w-4 h-4" /></button>
                <div className="w-[1px] h-4 bg-[var(--border-color)] mx-1"></div>
                <button onClick={() => setAudioState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }))} className={`p-1.5 rounded ${audioState.snapToGrid ? 'bg-[var(--accent)] text-black shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Magnet className="w-4 h-4" /></button>
                <button onClick={toggleLoop} className={`p-1.5 rounded ${audioState.loop.active ? 'bg-[var(--accent)] text-black shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Repeat className="w-4 h-4" /></button>
                {selectedClipId && <button onClick={deleteSelectedClip} className="p-1.5 rounded text-red-500 hover:bg-red-900/20 ml-2"><Trash2 className="w-4 h-4" /></button>}
             </div>
             
             <div className="flex items-center gap-2">
                <button onClick={() => handleZoom('out')} className="p-1 hover:text-[var(--text-main)] text-[var(--text-muted)]"><ZoomOut className="w-4 h-4" /></button>
                <button onClick={() => handleZoom('in')} className="p-1 hover:text-[var(--text-main)] text-[var(--text-muted)]"><ZoomIn className="w-4 h-4" /></button>
             </div>
         </div>

         <div className="flex-1 overflow-auto bg-[var(--bg-main)] relative custom-scrollbar touch-pan-x" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                <div className="relative" style={{ minWidth: `${audioState.totalDuration * pixelsPerSecond}px`, minHeight: '100%' }}>
                    <div className="absolute inset-0 z-0 opacity-40">{GridLines}</div>
                    
                    {/* Ruler */}
                    <div className="h-6 w-full border-b border-[var(--border-color)] bg-[var(--bg-panel)]/95 backdrop-blur-sm sticky top-0 z-20 flex items-center" 
                        onMouseDown={(e) => {
                            if ((e.target as HTMLElement).classList.contains('loop-handle')) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const t = x / pixelsPerSecond;
                            
                            if(e.shiftKey) { 
                                isCreatingLoopRef.current = true;
                                loopStartAnchorRef.current = t;
                            } else {
                                isScrubbingRef.current = true;
                                if (audioState.isPlaying) {
                                    wasPlayingRef.current = true;
                                    togglePlay(); 
                                } else {
                                    wasPlayingRef.current = false;
                                }
                                setAudioState(prev => ({ ...prev, currentTime: t }));
                            }
                        }}
                    >
                        {Ruler}
                        {audioState.loop.active && (
                            <>
                                <div className="absolute top-0 h-full bg-[var(--accent)]/10 border-t-2 border-[var(--accent)] pointer-events-none" style={{ left: audioState.loop.start * pixelsPerSecond, width: (audioState.loop.end - audioState.loop.start) * pixelsPerSecond }} />
                                {/* Loop Handles */}
                                <div 
                                    className="absolute top-0 h-6 w-4 -ml-2 cursor-ew-resize z-50 group loop-handle touch-none flex items-center justify-center" 
                                    style={{ left: audioState.loop.start * pixelsPerSecond }}
                                    onMouseDown={(e) => { e.stopPropagation(); isDraggingLoopStartRef.current = true; }}
                                >
                                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[var(--accent)] pointer-events-none drop-shadow-sm"></div>
                                </div>
                                <div 
                                    className="absolute top-0 h-6 w-4 -ml-2 cursor-ew-resize z-50 group loop-handle touch-none flex items-center justify-center" 
                                    style={{ left: audioState.loop.end * pixelsPerSecond }}
                                    onMouseDown={(e) => { e.stopPropagation(); isDraggingLoopEndRef.current = true; }}
                                >
                                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[var(--accent)] pointer-events-none drop-shadow-sm"></div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Tracks Lane */}
                    <div className="space-y-[1px] relative z-10">
                        {tracks.map(track => (
                            <div key={track.id} className={`h-28 flex-shrink-0 relative border-b border-[var(--border-color)] group ${track.muted ? 'opacity-40 grayscale' : ''}`}>
                                {track.clips.map(clip => (
                                    <div 
                                        key={clip.id} 
                                        onMouseDown={(e) => handleClipInteractionStart(e, track.id, clip.id, 'move')} 
                                        onTouchStart={(e) => handleClipInteractionStart(e, track.id, clip.id, 'move')}
                                        onContextMenu={(e) => handleContextMenu(e, track.id, clip.id)}
                                        className={`absolute top-2 bottom-2 rounded-md overflow-hidden border transition-all shadow-md group/clip touch-none ${selectedClipId === clip.id ? 'border-[var(--text-main)] bg-[var(--waveform-bg)] z-30 shadow-xl' : 'border-[var(--border-color)] bg-[var(--bg-element)] z-10 hover:border-[var(--text-muted)]'}`} 
                                        style={{ left: `${clip.startTime * pixelsPerSecond}px`, width: `${clip.duration * pixelsPerSecond}px` }}
                                    >
                                        <div className="absolute top-0 bottom-0 left-0 w-8 cursor-ew-resize hover:bg-[var(--accent)]/50 z-20 opacity-0 group-hover/clip:opacity-100 transition-opacity flex items-center justify-center touch-none" 
                                            onMouseDown={(e) => handleClipInteractionStart(e, track.id, clip.id, 'resize-left')}
                                            onTouchStart={(e) => handleClipInteractionStart(e, track.id, clip.id, 'resize-left')}
                                        ></div>
                                        <div className="absolute top-0 bottom-0 right-0 w-8 cursor-ew-resize hover:bg-[var(--accent)]/50 z-20 opacity-0 group-hover/clip:opacity-100 transition-opacity flex items-center justify-center touch-none" 
                                            onMouseDown={(e) => handleClipInteractionStart(e, track.id, clip.id, 'resize-right')}
                                            onTouchStart={(e) => handleClipInteractionStart(e, track.id, clip.id, 'resize-right')}
                                        ></div>
                                        <div className="w-full h-full opacity-80 pointer-events-none p-1"><Waveform buffer={clip.buffer} color={selectedClipId === clip.id ? "bg-[var(--waveform-wave)]" : "bg-[var(--text-muted)]"} start={clip.audioOffset} duration={clip.duration} dataPoints={clip.liveData} /></div>
                                        <div className="absolute top-0 left-0 w-full px-2 py-0.5 bg-gradient-to-b from-black/50 to-transparent text-[9px] font-bold text-white truncate pointer-events-none">{clip.name}</div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Playhead (Agulha) - Z-Index 50 e pointer-events-none para não atrapalhar */}
                    <div className="absolute top-0 bottom-0 z-50 pointer-events-none transition-none" style={{ left: `${audioState.currentTime * pixelsPerSecond}px` }}>
                        <div className="w-[1px] bg-[var(--text-main)] h-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                        {/* Cabeça da Agulha */}
                        <div className="w-3 h-3 bg-[var(--text-main)] rotate-45 transform -translate-x-[5px] -translate-y-[6px] absolute top-6 shadow-md" />
                    </div>
                </div>
         </div>
    </div>
  );
};