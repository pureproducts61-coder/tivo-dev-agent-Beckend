/**
 * TIVO — COGNITION (Blueprint: "Brain Proposes", goal-driven, not tool-driven)
 * ---------------------------------------------------------------------------
 * Dissects a user goal into four honest answers:
 *   1. What is the goal?            → intent + primitive chain
 *   2. What resources exist now?    → resources + truthful capability availability
 *   3. What is the gap?             → missing capability / resource / authority
 *   4. Which interactions compose it?→ affordances from the World catalog
 *
 * The Brain may supply its own intent (from the AI model). When it does not,
 * a zero-cost keyword hint is used. Nothing executes here; no fake progress.
 */
import { capabilityForTask, classifyTask, type Capability, type TaskKind } from "./capabilities";
import { AFFORDANCES, type Affordance, type Primitive, type ResourceRef } from "./world";

export interface BrainIntent {
  /** Primitive chain the Brain chose (e.g. PERCEIVE → UNDERSTAND → GENERATE). */
  primitives?: Primitive[];
  /** Capabilities the Brain believes the goal needs. */
  capabilities?: Capability[];
  summary?: string;
}

export interface WorldSnapshot {
  resources: ResourceRef[];
  availableCapabilities: Capability[];
  userId: string | null;
}

export type GapKind = "capability" | "resource" | "authority";
export interface Gap {
  kind: GapKind;
  need: string;
  /** Honest next step (connect a runtime, sign in, pick a project...). */
  remedy: string;
}

export interface CompositionStep {
  primitive: Primitive;
  affordance: Affordance | null;
  capability: Capability | null;
  ready: boolean;
}

export interface GoalDissection {
  goal: string;
  source: "brain" | "hint";
  taskKind: TaskKind;
  primitives: Primitive[];
  requiredCapabilities: Capability[];
  resources: ResourceRef[];
  steps: CompositionStep[];
  gaps: Gap[];
  /** True only when every step is ready and no gap exists. */
  composable: boolean;
}

/** Default primitive chains per task kind (used only without a Brain intent). */
const HINT_CHAIN: Record<TaskKind, Primitive[]> = {
  general_chat: ["UNDERSTAND", "GENERATE"],
  reasoning: ["UNDERSTAND", "COMPOSE", "GENERATE"],
  coding: ["PERCEIVE", "UNDERSTAND", "GENERATE", "TRANSFORM", "VERIFY"],
  research: ["ACCESS", "PERCEIVE", "UNDERSTAND", "GENERATE"],
  build: ["PERCEIVE", "EXECUTE", "OBSERVE", "VERIFY"],
  test: ["EXECUTE", "OBSERVE", "VERIFY"],
  security: ["PERCEIVE", "UNDERSTAND", "VERIFY"],
  deploy: ["EXECUTE", "OBSERVE", "VERIFY"],
  model_management: ["PERCEIVE", "TRANSFORM", "VERIFY"],
};

/** Inference-only primitives: served by the model itself, no world affordance. */
const COGNITIVE: Primitive[] = ["UNDERSTAND", "GENERATE", "COMPOSE", "RECOVER"];

function pickAffordance(p: Primitive, caps: Capability[], resources: ResourceRef[]): Affordance | null {
  const kinds = new Set(resources.map((r) => r.kind));
  const pool = AFFORDANCES.filter((a) => a.primitive === p);
  return (
    pool.find((a) => caps.includes(a.capability) && kinds.has(a.resourceKind)) ??
    pool.find((a) => caps.includes(a.capability)) ??
    pool.find((a) => kinds.has(a.resourceKind)) ??
    null
  );
}

export function dissectGoal(goal: string, world: WorldSnapshot, brain?: BrainIntent): GoalDissection {
  const taskKind = classifyTask(goal);
  const fromBrain = !!(brain?.primitives?.length || brain?.capabilities?.length);
  const primitives = brain?.primitives?.length ? brain.primitives : HINT_CHAIN[taskKind];
  const required = new Set<Capability>(brain?.capabilities?.length ? brain.capabilities : [capabilityForTask(taskKind)]);
  const avail = new Set(world.availableCapabilities);
  const gaps: Gap[] = [];

  const steps: CompositionStep[] = primitives.map((p) => {
    if (COGNITIVE.includes(p)) {
      const ok = avail.has("chat") || avail.has("reasoning") || avail.has("coding");
      return { primitive: p, affordance: null, capability: "reasoning", ready: ok };
    }
    // VERIFY/OBSERVE without a catalog match are proven by evidence of prior steps.
    const a = pickAffordance(p, [...required], world.resources);
    if (!a) return { primitive: p, affordance: null, capability: null, ready: p === "VERIFY" || p === "OBSERVE" };
    required.add(a.capability);
    const hasResource = world.resources.some((r) => r.kind === a.resourceKind) || a.resourceKind === "web";
    if (!hasResource) gaps.push({ kind: "resource", need: a.resourceKind, remedy: `Select or create a ${a.resourceKind}` });
    return { primitive: p, affordance: a, capability: a.capability, ready: hasResource && avail.has(a.capability) };
  });

  if (!world.userId) gaps.push({ kind: "authority", need: "signed-in user", remedy: "Sign in" });
  for (const c of required) {
    if (!avail.has(c)) gaps.push({ kind: "capability", need: c, remedy: `Connect a runtime that provides "${c}"` });
  }
  if (steps.some((s) => COGNITIVE.includes(s.primitive) && !s.ready) && !gaps.some((g) => g.need === "reasoning")) {
    gaps.push({ kind: "capability", need: "reasoning", remedy: "Connect an AI model runtime" });
  }

  const uniqueGaps = gaps.filter((g, i) => gaps.findIndex((x) => x.kind === g.kind && x.need === g.need) === i);
  return {
    goal,
    source: fromBrain ? "brain" : "hint",
    taskKind,
    primitives,
    requiredCapabilities: [...required],
    resources: world.resources,
    steps,
    gaps: uniqueGaps,
    composable: uniqueGaps.length === 0 && steps.every((s) => s.ready),
  };
}
