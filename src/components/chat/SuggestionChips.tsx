import { useEffect, useRef, useState } from "react";
import { Check, X, Sparkles } from "lucide-react";

interface Props {
  chips: string[];
  loading?: boolean;
  onPick: (text: string) => void;
  onDismiss?: () => void;
}

/**
 * Horizontal scrollable smart-suggestion chips that float above the input bar.
 * - Compact, single-line titles
 * - Click → transfer to input
 * - Multi-select mode → "Send all" combines picked chips into input
 */
export function SuggestionChips({ chips, loading, onPick, onDismiss }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // reset selection when chips refresh
    setSelected(new Set());
  }, [chips]);

  if (!loading && (!chips || chips.length === 0)) return null;

  const multi = selected.size > 0;

  function toggle(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  function commitOne(text: string) {
    onPick(text);
  }

  function commitSelected() {
    const combined = Array.from(selected)
      .sort((a, b) => a - b)
      .map((i) => chips[i])
      .filter(Boolean)
      .join("\n\n");
    if (combined) onPick(combined);
    setSelected(new Set());
  }

  return (
    <div className="px-2 sm:px-4 pt-1 pb-1.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-[10px] text-amber-500/80 shrink-0 pl-1">
          <Sparkles className="w-3 h-3" />
          <span>Next</span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 pb-1 snap-x"
          style={{ scrollbarWidth: "thin" }}
        >
          {loading && chips.length === 0 && (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-7 w-32 rounded-full bg-zinc-900/70 border border-zinc-800 animate-pulse shrink-0"
                />
              ))}
            </>
          )}
          {chips.map((c, i) => {
            const isSel = selected.has(i);
            return (
              <button
                key={i}
                onClick={(e) => {
                  if (e.shiftKey || multi) {
                    toggle(i);
                  } else {
                    commitOne(c);
                  }
                }}
                onContextMenu={(e) => { e.preventDefault(); toggle(i); }}
                title={c}
                className={`snap-start shrink-0 max-w-[240px] h-7 px-3 rounded-full text-[11px] flex items-center gap-1.5 border transition active:scale-95 ${
                  isSel
                    ? "bg-amber-500/15 border-amber-600/60 text-amber-200"
                    : "bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-amber-700/60 hover:text-amber-300"
                }`}
              >
                {isSel && <Check className="w-3 h-3 shrink-0" />}
                <span className="truncate">{c}</span>
              </button>
            );
          })}
        </div>

        {multi ? (
          <button
            onClick={commitSelected}
            className="shrink-0 h-7 px-3 rounded-full text-[11px] bg-gradient-to-br from-amber-500 to-amber-700 text-white font-medium hover:from-amber-400"
          >
            Add {selected.size}
          </button>
        ) : onDismiss ? (
          <button
            onClick={onDismiss}
            className="shrink-0 w-6 h-6 rounded-full text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 flex items-center justify-center"
            aria-label="Hide suggestions"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
