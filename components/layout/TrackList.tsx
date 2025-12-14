import React from 'react';
import { Volume2, Copy, XCircle } from 'lucide-react';
import { Track } from '../../types';

interface TrackListProps {
  tracks: Track[];
  selectedTrackId: string | null;
  setSelectedTrackId: (id: string | null) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  addNewTrack: () => void;
  handleImportBeat: (e: React.ChangeEvent<HTMLInputElement>) => void;
  duplicateTrack: (id: string) => void;
  deleteTrack: (id: string) => void;
  editTrackName: (id: string) => void;
  
  // Responsive State
  isOpen: boolean;
  isMobile: boolean;
  closeOnMobile: () => void;
  scrollTop: number;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks, selectedTrackId, setSelectedTrackId, updateTrack,
  addNewTrack, handleImportBeat, duplicateTrack, deleteTrack, editTrackName,
  isOpen, isMobile, closeOnMobile, scrollTop
}) => {
  return (
    <div 
        className={`
            fixed inset-y-0 left-0 z-30 w-64 bg-[var(--bg-panel)] border-r border-[var(--border-color)] transform transition-all duration-300 ease-in-out shadow-2xl flex flex-col
            lg:relative lg:shadow-none
            ${isOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:w-0 lg:overflow-hidden lg:border-r-0 lg:translate-x-0'}
        `}
        style={{ top: isMobile ? '4rem' : '0', height: isMobile ? 'calc(100% - 4rem)' : '100%' }}
    >
         {/* Track List Header */}
         <div className="h-10 border-b border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-shrink-0 items-center justify-between px-3">
             <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Tracks</span>
             <div className="flex gap-2">
                 <button onClick={addNewTrack} className="bg-[var(--text-main)] text-[var(--bg-main)] px-2 py-0.5 rounded text-[10px] font-bold hover:bg-[var(--accent)] hover:text-black">+ NEW</button>
                 <label className="bg-[var(--bg-element)] border border-[var(--border-color)] px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer text-[var(--text-main)] hover:border-[var(--text-muted)] transition-colors">IMP<input type="file" accept="audio/*" className="hidden" onChange={handleImportBeat} /></label>
             </div>
         </div>

         {/* Track Items */}
         <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ transform: `translateY(-${scrollTop}px)` }}>
            
            {/* SPACER FOR RULER ALIGNMENT */}
            <div className="h-6 bg-[var(--bg-panel)] border-b border-[var(--border-color)] shrink-0 flex items-center justify-center">
                <div className="text-[8px] text-[var(--text-muted)] opacity-50 font-mono tracking-widest">TIMELINE SYNC</div>
            </div>

            {tracks.map(track => (
                <div key={track.id} onClick={() => { setSelectedTrackId(track.id); closeOnMobile(); }} className={`h-28 flex-shrink-0 px-3 py-3 flex flex-col justify-between border-b border-[var(--border-color)] cursor-pointer group transition-colors relative ${selectedTrackId === track.id ? 'bg-[var(--bg-element)] border-l-4 border-l-[var(--accent)]' : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-element)] border-l-4 border-l-transparent'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col overflow-hidden">
                            <span className={`font-bold text-sm truncate w-24 ${selectedTrackId === track.id ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`} onDoubleClick={() => editTrackName(track.id)}>{track.name}</span>
                            <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">{track.type}</span>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); duplicateTrack(track.id) }} className="opacity-100 lg:opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-white transition-opacity"><Copy className="w-3 h-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); deleteTrack(track.id) }} className="opacity-100 lg:opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-opacity"><XCircle className="w-3 h-3" /></button>
                        </div>
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
  );
};