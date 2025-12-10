import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  color?: string;
}

export const Modal: React.FC<ModalProps> = ({ title, onClose, children, color = "bg-zinc-900" }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`relative w-[400px] ${color} rounded-xl border border-zinc-700 shadow-2xl shadow-black overflow-hidden flex flex-col animate-in zoom-in-95 duration-200`}>
        {/* Header (Rack Screw Look) */}
        <div className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 select-none">
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-zinc-700 shadow-inner"></div>
             <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{title}</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 relative">
           {/* Decorative Rack Screws in corners */}
           <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-zinc-800 shadow-inner border border-zinc-950"></div>
           <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-zinc-800 shadow-inner border border-zinc-950"></div>
           <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-zinc-800 shadow-inner border border-zinc-950"></div>
           <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-zinc-800 shadow-inner border border-zinc-950"></div>
           
           {children}
        </div>
      </div>
    </div>
  );
};