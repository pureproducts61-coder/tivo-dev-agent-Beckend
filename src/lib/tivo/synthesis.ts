/**
 * TIVO — DYNAMIC SYNTHESIS & GAP NEGOTIATION (Blueprint Step 5)
 * ---------------------------------------------------------------------------
 * When a goal has gaps, the Brain NEVER invents tools and NEVER fakes progress.
 * It composes honest alternatives ONLY from affordances that exist in the
 * World catalog, and presents them to the user to choose. Nothing executes.
 */
import type { Gap, GoalDissection, WorldSnapshot } from "./cognition";
import { AFFORDANCES, type Affordance } from "./world";

export type PathKind = "connect" | "provide" | "sign_in" | "substitute" | "partial";

export interface AlternativePath {
  id: string;
  kind: PathKind;
  /** Which gap this resolves. */
  resolves: string;
  description: string;
  /** Existing affordance used (substitute/partial) — never invented. */
  affordanceId?: string;
  /** User must choose/approve; the Brain never self-selects. */
  requiresUser: true;
}

export interface GapNegotiation {
  gap: Gap;
  options: AlternativePath[];
}

export interface SynthesisResult {
  goal: string;
  ready: boolean;
  negotiations: GapNegotiation[];
}

function substitutesFor(need: string, world: WorldSnapshot): Affordance[] {
  const avail = new Set(world.availableCapabilities);
  const kinds = new Set(world.resources.map((r) => r.kind));
  // Same resource kind, capability actually available, no side-effect escalation.
  return AFFORDANCES.filter(
    (a) => a.capability !== need && avail.has(a.capability) && (kinds.has(a.resourceKind) || a.resourceKind === "web") && a.risk !== "HIGH",
  );
}

export function negotiateGap(gap: Gap, world: WorldSnapshot): GapNegotiation {
  const options: AlternativePath[] = [];
  const base = `${gap.kind}:${gap.need}`;
  if (gap.kind === "authority") {
    options.push({ id: `${base}:sign_in`, kind: "sign_in", resolves: base, description: gap.remedy, requiresUser: true });
  } else if (gap.kind === "resource") {
    options.push({ id: `${base}:provide`, kind: "provide", resolves: base, description: gap.remedy, requiresUser: true });
  } else {
    options.push({ id: `${base}:connect`, kind: "connect", resolves: base, description: gap.remedy, requiresUser: true });
    for (const a of substitutesFor(gap.need, world).slice(0, 2)) {
      options.push({
        id: `${base}:sub:${a.id}`, kind: "partial", resolves: base, affordanceId: a.id,
        description: `Partial alternative: ${a.description} (does not fully replace "${gap.need}")`, requiresUser: true,
      });
    }
  }
  return { gap, options };
}

export function synthesizeAlternatives(d: GoalDissection, world: WorldSnapshot): SynthesisResult {
  return {
    goal: d.goal,
    ready: d.composable,
    negotiations: d.composable ? [] : d.gaps.map((g) => negotiateGap(g, world)),
  };
}
