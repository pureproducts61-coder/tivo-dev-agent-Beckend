/**
 * TIVO — WORLD FOUNDATION (Blueprint Step 1)
 * ---------------------------------------------------------------------------
 * Brain Proposes → World Describes → Control Authorizes → TDEF Interacts.
 * This file covers "World Describes" and "Control Authorizes" only.
 * Pure contracts + validation. NO execution, NO side effects happen here.
 */
import type { Capability } from "./capabilities";

export const PRIMITIVES = [
  "PERCEIVE", "UNDERSTAND", "ACCESS", "TRANSFORM", "EXECUTE",
  "GENERATE", "COMPOSE", "OBSERVE", "VERIFY", "RECOVER",
] as const;
export type Primitive = (typeof PRIMITIVES)[number];

export type ResourceKind =
  | "project" | "file" | "runtime" | "model" | "conversation" | "artifact" | "web";

/** A stable, secret-free reference to something in TIVO's world. */
export interface ResourceRef {
  kind: ResourceKind;
  id: string;
  label?: string;
  /** Owner scope — always resolved server-side; never trusted from client input. */
  ownerId?: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/** An action that is genuinely possible on a resource. */
export interface Affordance {
  id: string;
  resourceKind: ResourceKind;
  primitive: Primitive;
  capability: Capability;
  description: string;
  /** Minimal JSON-schema-like input description. */
  inputSchema: Record<string, { type: "string" | "number" | "boolean" | "object"; required?: boolean }>;
  risk: RiskLevel;
  /** Has an external side effect (writes, runs, deploys). */
  sideEffect: boolean;
  /** How completion must be proven. Without PASS, nothing is "done". */
  verifyHint: string;
}

export type ControlDecision = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export interface ControlResult {
  decision: ControlDecision;
  reasons: string[];
}

export interface InteractionRequest {
  resource: ResourceRef;
  affordanceId: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  correlationId: string;
  createdAt: string;
  control: ControlResult;
}

/** Built-in affordance catalog. Only actions TIVO can honestly route. */
export const AFFORDANCES: Affordance[] = [
  { id: "project.inspect", resourceKind: "project", primitive: "PERCEIVE", capability: "file_read",
    description: "Read project files and metadata", inputSchema: {}, risk: "LOW", sideEffect: false,
    verifyHint: "Files returned for the owned project" },
  { id: "project.write_file", resourceKind: "project", primitive: "TRANSFORM", capability: "file_write",
    description: "Create or update a file", inputSchema: { path: { type: "string", required: true }, content: { type: "string", required: true } },
    risk: "MEDIUM", sideEffect: true, verifyHint: "File re-read matches written content" },
  { id: "project.build", resourceKind: "project", primitive: "EXECUTE", capability: "build",
    description: "Build the project on an execution runtime", inputSchema: { target: { type: "string" } },
    risk: "MEDIUM", sideEffect: true, verifyHint: "Job reaches done with an artifact" },
  { id: "project.deploy", resourceKind: "project", primitive: "EXECUTE", capability: "deploy",
    description: "Publish the project", inputSchema: {}, risk: "HIGH", sideEffect: true,
    verifyHint: "Public URL responds 200" },
  { id: "runtime.health", resourceKind: "runtime", primitive: "OBSERVE", capability: "command_execute",
    description: "Check runtime /health", inputSchema: {}, risk: "LOW", sideEffect: false,
    verifyHint: "Health endpoint returns ok" },
  { id: "web.fetch", resourceKind: "web", primitive: "ACCESS", capability: "research",
    description: "Fetch a public web page (SSRF-safe)", inputSchema: { url: { type: "string", required: true } },
    risk: "LOW", sideEffect: false, verifyHint: "Content returned with source URL" },
  { id: "model.activate", resourceKind: "model", primitive: "TRANSFORM", capability: "model_management",
    description: "Activate a registered model", inputSchema: {}, risk: "MEDIUM", sideEffect: true,
    verifyHint: "Registry shows model as active" },
];

export function discoverAffordances(resource: ResourceRef): Affordance[] {
  return AFFORDANCES.filter((a) => a.resourceKind === resource.kind);
}

export function findAffordance(id: string): Affordance | undefined {
  return AFFORDANCES.find((a) => a.id === id);
}

export interface ControlContext {
  userId: string | null;
  isAdmin?: boolean;
  /** Capabilities currently AVAILABLE (truthful, from runtime registry). */
  availableCapabilities?: Capability[];
}

/** Control Authorizes — deterministic policy, no AI involved. */
export function authorize(
  resource: ResourceRef,
  affordance: Affordance,
  input: Record<string, unknown>,
  ctx: ControlContext,
): ControlResult {
  const reasons: string[] = [];
  if (!ctx.userId) return { decision: "DENY", reasons: ["not_authenticated"] };
  if (affordance.resourceKind !== resource.kind) return { decision: "DENY", reasons: ["affordance_resource_mismatch"] };
  if (resource.ownerId && resource.ownerId !== ctx.userId && !ctx.isAdmin)
    return { decision: "DENY", reasons: ["not_owner"] };

  for (const [key, spec] of Object.entries(affordance.inputSchema)) {
    const v = input[key];
    if (spec.required && (v === undefined || v === null || v === "")) reasons.push(`missing_input:${key}`);
    else if (v !== undefined && typeof v !== spec.type) reasons.push(`invalid_type:${key}`);
  }
  if (reasons.length) return { decision: "DENY", reasons };

  if (ctx.availableCapabilities && !ctx.availableCapabilities.includes(affordance.capability))
    return { decision: "DENY", reasons: [`capability_unavailable:${affordance.capability}`] };

  if (affordance.risk === "HIGH" || (affordance.sideEffect && affordance.risk === "MEDIUM"))
    return { decision: "REQUIRE_APPROVAL", reasons: [`risk:${affordance.risk}`] };

  return { decision: "ALLOW", reasons: [] };
}

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Stable key: same resource + affordance + input → same key (prevents duplicate runs). */
export function idempotencyKeyFor(resource: ResourceRef, affordanceId: string, input: Record<string, unknown>): string {
  const keys = Object.keys(input).sort();
  const raw = `${resource.kind}:${resource.id}:${affordanceId}:${JSON.stringify(input, keys)}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `idem_${h.toString(16)}`;
}

/** Brain proposes → returns an InteractionRequest with its control decision. Never executes. */
export function proposeInteraction(
  resource: ResourceRef,
  affordanceId: string,
  input: Record<string, unknown>,
  ctx: ControlContext,
  correlationId: string = uuid(),
): InteractionRequest {
  const aff = findAffordance(affordanceId);
  const control: ControlResult = aff
    ? authorize(resource, aff, input, ctx)
    : { decision: "DENY", reasons: ["unknown_affordance"] };
  return {
    resource, affordanceId, input,
    idempotencyKey: idempotencyKeyFor(resource, affordanceId, input),
    correlationId, createdAt: new Date().toISOString(), control,
  };
}
