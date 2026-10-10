import { useState } from "react";
import { ChevronDown, ChevronUp, CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import type { GoalDissection } from "@/lib/tivo/cognition";

const PRIMITIVE_BN: Record<string, string> = {
  PERCEIVE: "দেখা", UNDERSTAND: "বোঝা", ACCESS: "পৌঁছানো", TRANSFORM: "বদলানো", EXECUTE: "চালানো",
  GENERATE: "তৈরি", COMPOSE: "জোড়া", OBSERVE: "লক্ষ্য রাখা", VERIFY: "যাচাই", RECOVER: "সারানো",
};

/** Is this dissection worth surfacing? Plain conversation stays silent. */
export function shouldSurface(d: GoalDissection): boolean {
  return d.gaps.length > 0 || d.taskKind !== "general_chat";
}

/** Shows how the Brain is thinking about the goal — only what is true right now. */
export function CognitionTrace({ d }: { d: GoalDissection }) {
  const [open, setOpen] = useState(!d.composable);
  return (
    <div className="mb-2 rounded-lg border border-border/60 bg-muted/20 text-[11px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
      >
        {d.composable
          ? <CircleCheck className="w-3.5 h-3.5 text-primary" />
          : <TriangleAlert className="w-3.5 h-3.5 text-destructive" />}
        <span className="truncate">
          {d.primitives.map((p) => PRIMITIVE_BN[p] ?? p).join(" → ")}
        </span>
        <span className="ml-auto shrink-0">
          {d.composable ? "সব প্রস্তুত" : `${d.gaps.length}টি ঘাটতি`}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {d.steps.map((s, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                  s.ready ? "border-primary/40 text-foreground" : "border-border text-muted-foreground"
                }`}
                title={s.affordance?.description ?? s.capability ?? ""}
              >
                {s.ready ? <CircleCheck className="w-3 h-3 text-primary" /> : <CircleDashed className="w-3 h-3" />}
                {PRIMITIVE_BN[s.primitive] ?? s.primitive}
              </span>
            ))}
          </div>
          {d.gaps.map((g, i) => (
            <div key={i} className="text-muted-foreground">
              <span className="text-destructive">নেই:</span> {g.need} — {g.remedy}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
