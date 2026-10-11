/**
 * TIVO — OBSERVATION + EVIDENCE + STATE (Blueprint Step 3)
 * ---------------------------------------------------------------------------
 * OBSERVE collects real facts from a runtime result. Nothing here judges
 * success — that is VERIFY (Step 4). Evidence is only what was actually
 * returned: exit codes, HTTP status, hashes, artifacts, health. Never invented.
 */
import type { Primitive } from "./world";

export type EvidenceKind = "exit_code" | "http_status" | "content_hash" | "artifact" | "health" | "output" | "error";

export interface EvidenceItem {
  kind: EvidenceKind;
  value: string | number | boolean;
  source: string; // runtime id or URL that produced it
}

export interface EvidenceRecord {
  correlationId: string;
  affordanceId: string;
  primitive: Primitive;
  runtime: string | null;
  observedAt: string;
  items: EvidenceItem[];
  /** True when at least one real, non-error fact was observed. */
  hasProof: boolean;
}

/** Stable, dependency-free content hash (FNV-1a 32-bit) for change detection. */
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Extract only facts that are really present in a runtime output. */
export function observe(args: {
  correlationId: string;
  affordanceId: string;
  primitive: Primitive;
  runtime: string | null;
  output?: unknown;
  error?: string;
}): EvidenceRecord {
  const src = args.runtime ?? "none";
  const items: EvidenceItem[] = [];
  const o = (args.output ?? {}) as Record<string, any>;

  if (typeof o.exitCode === "number") items.push({ kind: "exit_code", value: o.exitCode, source: src });
  if (typeof o.status === "number") items.push({ kind: "http_status", value: o.status, source: o.url || src });
  if (typeof o.online === "boolean") items.push({ kind: "health", value: o.online && !o.degraded, source: src });
  const text = typeof o.output === "string" ? o.output : typeof o.content === "string" ? o.content : typeof o.text === "string" ? o.text : null;
  if (text) {
    items.push({ kind: "content_hash", value: contentHash(text), source: src });
    items.push({ kind: "output", value: text.slice(0, 500), source: src });
  }
  if (Array.isArray(o.artifacts)) {
    for (const a of o.artifacts) if (a?.name) items.push({ kind: "artifact", value: a.url || a.name, source: src });
  }
  if (args.error) items.push({ kind: "error", value: args.error, source: src });

  return {
    correlationId: args.correlationId,
    affordanceId: args.affordanceId,
    primitive: args.primitive,
    runtime: args.runtime,
    observedAt: new Date().toISOString(),
    items,
    hasProof: items.some((i) => i.kind !== "error"),
  };
}

/** Session state store of evidence, keyed by correlationId (the task). */
const store = new Map<string, EvidenceRecord[]>();
export function recordEvidence(r: EvidenceRecord) {
  const list = store.get(r.correlationId) ?? [];
  list.push(r);
  store.set(r.correlationId, list);
}
export function evidenceFor(correlationId: string): EvidenceRecord[] {
  return store.get(correlationId) ?? [];
}
export function _resetEvidence() { store.clear(); }
