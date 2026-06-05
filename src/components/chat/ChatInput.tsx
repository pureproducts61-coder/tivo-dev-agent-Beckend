import { useEffect, useRef, useState } from "react";
import {
  ArrowUp, Square, Paperclip, MoreHorizontal, X,
  Upload, RefreshCw, History, Share2, Folder, Download, Eye, ShieldCheck, Wand2, Globe
} from "lucide-react";

export interface InputAction {
  id: string;
  label: string;
  icon: any;
  desc?: string;
  onClick: () => void;
  tone?: "default" | "danger" | "primary";
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  streaming?: boolean;
  files: File[];
  onFilesChange: (f: File[]) => void;
  actions?: InputAction[]; // three-dot menu items
  placeholder?: string;
}

export function ChatInput({
  value, onChange, onSend, onStop, streaming, files, onFilesChange, actions = [], placeholder
}: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-grow
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 280) + "px";
  }, [value]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const h = () => setMenuOpen(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menuOpen]);

  return (
    <div className="sticky bottom-0 z-20 px-2 sm:px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-[11px] bg-zinc-900 border border-zinc-800 rounded-full pl-2 pr-1 py-1 animate-fade-in"
            >
              <Paperclip className="w-3 h-3 text-amber-500" />
              <span className="truncate max-w-[140px]">{f.name}</span>
              <button
                onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
                className="w-4 h-4 rounded-full bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 flex items-center justify-center transition"
                aria-label="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative rounded-3xl bg-gradient-to-b from-zinc-900/95 to-zinc-900/80 border border-zinc-800 focus-within:border-amber-700/70 focus-within:ring-2 focus-within:ring-amber-700/20 transition-all shadow-xl shadow-black/40 backdrop-blur-md">
        <textarea
          ref={ta}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 640) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder || "যা করতে চান লিখুন... (Shift+Enter for newline)"}
          rows={1}
          disabled={streaming}
          className="w-full resize-none bg-transparent border-0 outline-none px-4 pt-3.5 pb-1 text-sm placeholder:text-zinc-500 leading-relaxed max-h-[280px]"
        />

        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div className="flex items-center gap-1">
            {/* File attach */}
            <label
              className="cursor-pointer w-9 h-9 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition active:scale-95"
              title="Attach files"
            >
              <Paperclip className="w-4 h-4" />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onFilesChange([...files, ...Array.from(e.target.files || [])])}
              />
            </label>

            {/* Three-dot menu */}
            {actions.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((v) => !v);
                  }}
                  className={`w-9 h-9 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition active:scale-95 ${
                    menuOpen ? "bg-zinc-800 text-amber-400" : ""
                  }`}
                  title="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 bottom-12 w-64 rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-lg shadow-2xl shadow-black/60 p-1.5 z-50 animate-scale-in origin-bottom-left"
                  >
                    {actions.map((a) => {
                      const Icon = a.icon;
                      return (
                        <button
                          key={a.id}
                          onClick={() => {
                            setMenuOpen(false);
                            a.onClick();
                          }}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition ${
                            a.tone === "danger"
                              ? "text-red-400 hover:bg-red-950/30"
                              : a.tone === "primary"
                              ? "text-amber-300 hover:bg-amber-950/30"
                              : "text-zinc-200 hover:bg-zinc-900"
                          }`}
                        >
                          <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium">{a.label}</div>
                            {a.desc && <div className="text-[11px] text-zinc-500 mt-0.5">{a.desc}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit / Stop */}
          {streaming ? (
            <button
              onClick={onStop}
              className="w-10 h-10 rounded-full bg-red-700 hover:bg-red-600 text-white flex items-center justify-center transition active:scale-95 shadow-md shadow-red-900/40"
              aria-label="Stop"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim() && !files.length}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-700 hover:from-amber-300 hover:to-amber-600 disabled:from-zinc-700 disabled:to-zinc-800 disabled:opacity-50 text-white flex items-center justify-center transition active:scale-95 shadow-md shadow-amber-900/40"
              aria-label="Send"
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.8} />
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 text-center mt-1.5 hidden sm:block">
        Enter to send · Shift+Enter newline · TIVO Agent ready
      </div>
    </div>
  );
}

// Re-export icons for menu builders
export const ActionIcons = {
  Upload, RefreshCw, History, Share2, Folder, Download, Eye, ShieldCheck, Wand2, Globe,
};
