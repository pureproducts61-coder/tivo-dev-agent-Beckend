/**
 * TIVO — CANONICAL EXECUTION EVENT CONTRACT
 * ---------------------------------------------------------------------------
 * Direction is always: real backend/runtime operation → canonical event →
 * (audit persistence + in-app bus) → Chat renderer.
 *
 * Rules enforced here:
 *  - No secrets, tokens, keys or credentials in event metadata (sanitized).
 *  - No chain-of-thought / hidden reasoning fields.
 *  - Events are emitted only by code that actually performed the operation.
 */

import { logAudit } from "@/lib/audit";

export type TivoEventType =
  | "task.created"
  | "task.started"
  | "task.waiting_permission"
  | "research.started"
  | "research.completed"
  | "file.read"
  | "file.created"
  | "file.updated"
  | "command.started"
  | "command.output"
  | "command.completed"
  | "build.started"
  | "build.completed"
  | "test.started"
  | "test.completed"
  | "security.started"
  | "security.completed"
  | "artifact.created"
  | "deployment.started"
  | "deployment.completed"
  | "runtime.selected"
  | "runtime.unavailable"
  | "task.failed"
  | "task.completed";

export interface TivoEvent {
  id: string;
  type: TivoEventType;
  /** Task/job correlation id (job_queue id where a real job exists). */
  taskId?: string;
  projectId?: string | null;
  /** Chat conversation this event belongs to (public.conversations.id). */
  conversationId?: string | null;
  runtime?: string;
  capability?: string;
  message?: string;
  /** Structured, secret-free metadata. */
  meta?: Record<string, unknown>;
  ts: number;
}


const SECRET_KEY = /(secret|token|key|password|passwd|credential|authorization|cookie|jwt|bearer)/i;

/** Recursively drops secret-looking keys and redacts secret-looking values. */
export function sanitizeMeta(input: unknown, depth = 0): any {
  if (depth > 4) return "[truncated]";
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((v) => sanitizeMeta(v, depth + 1));
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeMeta(v, depth + 1);
    }
    return out;
  }
  if (typeof input === "string") {
    // Redact obvious JWT / long opaque tokens accidentally passed through.
    if (/^ey[A-Za-z0-9_-]{10,}\./.test(input)) return "[redacted]";
    if (/^[A-Za-z0-9_-]{40,}$/.test(input)) return "[redacted]";
    return input.length > 2000 ? input.slice(0, 2000) + "…" : input;
  }
  return input;
}

type Listener = (e: TivoEvent) => void;
const listeners = new Set<Listener>();

export function onTivoEvent(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Emit a canonical event. Call this ONLY after the described operation really
 * happened (or really failed). Never call it to animate progress.
 */
export function emitTivoEvent(
  type: TivoEventType,
  init: Omit<TivoEvent, "id" | "type" | "ts"> = {},
): TivoEvent {
  const event: TivoEvent = {
    id: Math.random().toString(36).slice(2, 11),
    type,
    ts: Date.now(),
    ...init,
    meta: init.meta ? sanitizeMeta(init.meta) : undefined,
  };
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* a broken renderer must not break execution */
    }
  }
  // Persist the trail in the existing audit_logs table (best effort).
  logAudit(`event.${type}`, event.taskId || event.projectId || undefined, {
    runtime: event.runtime,
    capability: event.capability,
    message: event.message,
    ...(event.meta || {}),
  });
  return event;
}
