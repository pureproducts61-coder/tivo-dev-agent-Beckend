import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { GROUP_LABEL, GROUP_ORDER, type InputAction } from "@/components/chat/ChatInput";

/**
 * ⋮ menu for a project card. Presentation only — every item comes from
 * `buildProjectActions()` so Chat and Projects invoke the exact same handlers.
 */
export function ProjectActionsMenu({ actions }: { actions: InputAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`w-8 h-8 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition active:scale-95 ${
          open ? "bg-zinc-800 text-amber-400" : ""
        }`}
        aria-label="Project actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-9 w-56 max-h-[60vh] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-lg shadow-2xl shadow-black/60 p-1 z-50 animate-scale-in origin-top-right"
        >
          {GROUP_ORDER.map((g) => {
            const items = actions.filter((a) => (a.group ?? "project") === g);
            if (!items.length) return null;
            return (
              <div key={g} className="pt-1 first:pt-0">
                <div className="px-2.5 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                  {GROUP_LABEL[g]}
                </div>
                {items.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        setOpen(false);
                        a.onClick();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-[12px] transition ${
                        a.tone === "danger"
                          ? "text-red-400 hover:bg-red-950/30"
                          : a.tone === "primary"
                          ? "text-amber-300 hover:bg-amber-950/30"
                          : "text-zinc-200 hover:bg-zinc-900"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-medium">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
