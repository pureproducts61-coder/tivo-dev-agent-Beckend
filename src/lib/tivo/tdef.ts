/**
 * TIVO — TDEF (Blueprint Step 2: Real Interaction Execution)
 * ---------------------------------------------------------------------------
 * Control Authorizes → TDEF Interacts. Takes an InteractionRequest produced by
 * world.ts and dispatches it to a REAL runtime selected by capability.
 *  - DENY never runs.
 *  - REQUIRE_APPROVAL runs only with an explicit user approval.
 *  - Same idempotencyKey never runs twice in a session (returns prior result).
 *  - No runtime ⇒ honest "unavailable", never a fabricated result.
 */
import { emitTivoEvent } from "./events";
import { findAffordance, type InteractionRequest } from "./world";
import type { RuntimeAdapter } from "./runtimes";

export type TdefStatus = "succeeded" | "failed" | "denied" | "needs_approval" | "unavailable";

export interface TdefResult {
  status: TdefStatus;
  correlationId: string;
  idempotencyKey: string;
  runtime?: string;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface RuntimeSelector {
  select(capability: any): Promise<{ runtime: RuntimeAdapter | null; reason: string }>;
}

const completed = new Map<string, TdefResult>();
export function _resetTdefCache() { completed.clear(); }

async function dispatch(rt: any, affordanceId: string, req: InteractionRequest): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const i = req.input as Record<string, any>;
  const projectId = req.resource.id;
  switch (affordanceId) {
    case "web.fetch": {
      if (typeof rt.fetchUrl !== "function") return { ok: false, error: "runtime cannot fetch pages" };
      const r = await rt.fetchUrl(String(i.url));
      return { ok: true, output: r };
    }
    case "runtime.health": {
      const h = await rt.health();
      return { ok: !!h.online && !h.degraded, output: h, error: h.online ? h.error : h.error || "offline" };
    }
    case "project.build":
    case "project.deploy": {
      const fn = affordanceId === "project.build" ? rt.build : rt.deploy;
      if (typeof fn !== "function") return { ok: false, error: "runtime cannot perform this action" };
      const r = await fn.call(rt, { projectId, target: i.target });
      return { ok: !!r.ok, output: r, error: r.error };
    }
    default:
      return { ok: false, error: `no TDEF binding for ${affordanceId} yet` };
  }
}

export async function executeInteraction(
  req: InteractionRequest,
  registry: RuntimeSelector,
  opts: { approved?: boolean } = {},
): Promise<TdefResult> {
  const startedAt = new Date().toISOString();
  const base = { correlationId: req.correlationId, idempotencyKey: req.idempotencyKey, startedAt };
  const done = (r: Partial<TdefResult> & { status: TdefStatus }): TdefResult => ({ ...base, ...r, finishedAt: new Date().toISOString() });

  const prior = completed.get(req.idempotencyKey);
  if (prior && prior.status === "succeeded") return prior;

  if (req.control.decision === "DENY") return done({ status: "denied", error: req.control.reasons.join(", ") });
  if (req.control.decision === "REQUIRE_APPROVAL" && !opts.approved) {
    emitTivoEvent("task.waiting_permission", { taskId: req.correlationId, message: req.affordanceId });
    return done({ status: "needs_approval", error: req.control.reasons.join(", ") });
  }

  const aff = findAffordance(req.affordanceId);
  if (!aff) return done({ status: "denied", error: "unknown_affordance" });

  const { runtime, reason } = await registry.select(aff.capability);
  if (!runtime) {
    emitTivoEvent("runtime.unavailable", { capability: aff.capability, message: reason });
    return done({ status: "unavailable", error: reason });
  }

  emitTivoEvent("task.started", { taskId: req.correlationId, runtime: runtime.id, capability: aff.capability, message: aff.id });
  let result: TdefResult;
  try {
    const r = await dispatch(runtime, aff.id, req);
    result = done({ status: r.ok ? "succeeded" : "failed", runtime: runtime.id, output: r.output, error: r.ok ? undefined : r.error });
  } catch (e: any) {
    result = done({ status: "failed", runtime: runtime.id, error: String(e?.message || e) });
  }
  emitTivoEvent(result.status === "succeeded" ? "task.completed" : "task.failed", {
    taskId: req.correlationId, runtime: runtime.id, capability: aff.capability, message: result.error || aff.id,
  });
  if (result.status === "succeeded") completed.set(req.idempotencyKey, result);
  return result;
}
