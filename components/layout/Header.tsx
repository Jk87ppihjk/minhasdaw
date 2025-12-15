
import React from 'react';
import { Play, Pause, Square, Music, Settings2, Download, Save, Palette, Menu, PanelLeftClose, PanelRightClose, Undo2, Redo2, Maximize, Minimize, MoreVertical, FolderOpen, Ear, HardDrive } from 'lucide-react';
import { AudioEngineState } from '../../types';

interface HeaderProps {
  audioState: AudioEngineState;
  setAudioState: React.Dispatch<React.SetStateAction<AudioEngineState>>;
  togglePlay: () => void;
  handleStop: () => void;
  toggleRecord: () => void;
  formatTime: (seconds: number) => string;
  
  // Monitoring
  isMonitoring: boolean;
  toggleMonitoring: () => void;
  
  // Actions
  undoTracks: () => void;
  redoTracks: () => void;
  canUndo: boolean;
  canRedo: boolean;
  
  // New File System Actions
  saveProjectToDisk: () => void;
  openProjectFromDisk: () => void;
  
  // Legacy Actions (kept for export)
  exportWav: () => void;
  
  toggleTheme: () => void;
  toggleFullScreen: () => void;
  isFullScreen: boolean;
  
  // Sidebar Toggles
  isTrackListOpen: boolean;
  setIsTrackListOpen: (v: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  
  // Project State
  currentProjectName?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  audioState, setAudioState, togglePlay, handleStop, toggleRecord, formatTime,
  isMonitoring, toggleMonitoring,
  undoTracks, redoTracks, canUndo, canRedo, 
  saveProjectToDisk, openProjectFromDisk, exportWav,
  toggleTheme, toggleFullScreen, isFullScreen,
  isTrackListOpen, setIsTrackListOpen, isSidebarOpen, setIsSidebarOpen,
  currentProjectName
}) => {
  return (
    <header className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-4 bg-[var(--bg-panel)] shrink-0 z-40 shadow-md relative">
        {/* Left: Mobile Menu / Branding */}
        <div className="flex items-center gap-3 w-auto md:w-1/4">
          <button 
             onClick={() => setIsTrackListOpen(!isTrackListOpen)} 
             className="lg:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
             {isTrackListOpen ? <PanelLeftClose className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          
          <div className="w-8 h-8 bg-[var(--accent)] rounded flex items-center justify-center shadow-lg hidden md:flex border border-zinc-700">
            <Music className="text-[var(--bg-main)] w-5 h-5 fill-current" />
          </div>
          <div className="flex flex-col justify-center hidden md:flex">
              <h1 className="font-bold text-lg tracking-tight text-[var(--text-main)] font-sans leading-none">MONOCHROME</h1>
              {currentProjectName && <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest">{currentProjectName}</span>}
          </div>
        </div>
        
        {/* Central Transport Capsule */}
        <div className="flex flex-col items-center justify-center flex-1">
            <div className="flex items-center gap-4">
                
                {/* Master Volume - Moved here per request */}
                <div className="hidden lg:flex flex-col items-center group mr-2">
                    <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Master</span>
                    <input 
                        type="range" 
                        min="0" max="1" step="0.01" 
                        value={audioState.masterVolume} 
                        onChange={(e) => setAudioState(p => ({...p, masterVolume: parseFloat(e.target.value)}))}
                        className="w-20 h-1 bg-[var(--bg-element)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                </div>

                {/* BPM */}
                <div className="hidden md:flex items-center gap-2 bg-[var(--bg-element)] rounded-lg px-2 py-1 border border-[var(--border-color)]">
                    <div className="flex flex-col items-center">
                        <span className="text-[8px] font-bold text-[var(--text-muted)] tracking-wider">BPM</span>
                        <input 
                            type="number" 
                            value={audioState.bpm} 
                            onChange={(e) => setAudioState(p => ({ ...p, bpm: Math.max(40, Math.min(300, parseInt(e.target.value))) }))}
                            className="w-10 bg-transparent text-[var(--accent)] font-mono text-center text-xs font-bold outline-none"
                        />
                    </div>
                </div>

                <div className="bg-[var(--bg-element)] rounded-full px-3 py-2 flex items-center gap-3 border border-[var(--border-color)] shadow-xl">
                    <button onClick={handleStop} className="p-2 hover:bg-[var(--bg-main)] rounded-full text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors border border-transparent hover:border-[var(--border-color)]"><Square className="w-4 h-4 fill-current" /></button>
                    <button onClick={() => togglePlay()} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border ${audioState.isPlaying ? 'bg-[var(--accent)] text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'bg-[var(--bg-panel)] text-[var(--text-main)] hover:bg-[var(--bg-main)] border-[var(--border-color)]'}`}>
                        {audioState.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                    </button>
                    <button onClick={toggleRecord} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${audioState.isRecording ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-[var(--bg-element)] border-[var(--border-color)] text-red-500 hover:text-red-400 hover:border-red-900'}`}>
                        <div className={`w-3 h-3 rounded-full ${audioState.isRecording ? 'bg-white' : 'bg-current'}`}></div>
                    </button>
                    {/* Live Monitoring Button */}
                    <button 
                        onClick={toggleMonitoring} 
                        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${isMonitoring ? 'bg-green-500/20 text-green-500 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-[var(--bg-element)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        title="Live FX Monitor"
                    >
                        <Ear className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex flex-col items-center justify-center h-10 w-24 md:w-28 bg-[var(--bg-main)] border border-[var(--border-color)] rounded text-center shadow-inner relative overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-element)] to-transparent opacity-50 pointer-events-none"></div>
                     <span className="font-mono text-lg md:text-xl text-[var(--accent)] leading-none mt-1 z-10">{formatTime(audioState.currentTime)}</span>
                </div>
            </div>
        </div>

        {/* Right: Tools / Mixer Toggle */}
        <div className="flex items-center gap-3 justify-end w-auto md:w-1/4">
            
            <div className="hidden md:flex items-center gap-2">
                <button 
                    onClick={() => canUndo && undoTracks()} 
                    className={`p-2 rounded border border-transparent text-[var(--text-muted)] transition-colors ${canUndo ? 'hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] hover:border-[var(--border-color)]' : 'opacity-30 cursor-default'}`}
                    title="Undo (Ctrl+Z)"
                >
                    <Undo2 className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => canRedo && redoTracks()} 
                    className={`p-2 rounded border border-transparent text-[var(--text-muted)] transition-colors ${canRedo ? 'hover:text-[var(--text-main)] hover:bg-[var(--bg-element)] hover:border-[var(--border-color)]' : 'opacity-30 cursor-default'}`}
                    title="Redo (Ctrl+Y)"
                >
                    <Redo2 className="w-5 h-5" />
                </button>
                <div className="h-6 w-[1px] bg-[var(--border-color)] mx-1"></div>

                <button onClick={toggleFullScreen} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                    {isFullScreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
                
                {/* NEW FILE SYSTEM ACTIONS */}
                <button onClick={openProjectFromDisk} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Open Project Folder">
                    <FolderOpen className="w-5 h-5" />
                </button>
                <button onClick={saveProjectToDisk} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title={currentProjectName ? "Save Project (Ctrl+S)" : "Save As..."}>
                    <HardDrive className={`w-5 h-5 ${currentProjectName ? 'text-[var(--accent)]' : ''}`} />
                </button>
                
                <div className="h-6 w-[1px] bg-[var(--border-color)] mx-1"></div>
                <button onClick={exportWav} className="p-2 hover:bg-[var(--bg-element)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" title="Export WAV"><Download className="w-5 h-5" /></button>
            </div>
            
            <button className="md:hidden p-2 text-[var(--text-muted)]"><MoreVertical className="w-5 h-5" /></button>

            <div className="h-6 w-[1px] bg-[var(--border-color)] mx-1 hidden md:block"></div>
            
            <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className={`p-2 border border-[var(--border-color)] rounded ${isSidebarOpen ? 'bg-[var(--bg-element)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}
            >
                {isSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
            </button>
        </div>
    </header>
  );
};
