/**
 * TIVO — EXECUTION + RESEARCH ADAPTERS
 * ---------------------------------------------------------------------------
 * The Brain (Cloud/local inference) never executes anything. Real work goes
 * through these adapters:
 *
 *   ReplitExecutionAdapter — job_queue "Hands". A job is only reported as done
 *     when the queue row itself says so. No worker evidence ⇒ UNAVAILABLE.
 *   ResearchFetchAdapter  — the existing SSRF-safe backend-api research/fetch.
 *     It can fetch a real https page (citable), but there is no live search
 *     index behind it, so it is honestly reported as DEGRADED.
 *
 * Nothing here fabricates state, output or citations.
 */

import type { Capability } from "./capabilities";
import type {
  ExecutionRunResult,
  ExecutionRuntimeAdapter,
  RuntimeAdapter,
  RuntimeHealth,
  RuntimeKind,
  RuntimeClass,
} from "./runtimes";

interface BackendOpts {
  backend: string;
  masterSecret: string;
}

async function callBackend(
  o: BackendOpts,
  action: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<any> {
  const res = await fetch(`${o.backend}/functions/v1/backend-api/${action}`, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json", "x-master-secret": o.masterSecret },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `backend-api ${action} failed (${res.status})`);
  return json;
}

export interface JobRow {
  id: string;
  kind: string;
  status: "pending" | "claimed" | "running" | "done" | "failed" | "cancelled";
  result?: any;
  error?: string | null;
  claimed_by?: string | null;
  finished_at?: string | null;
}

/** Execution runtime = the real worker(s) draining `public.job_queue`. */
export class ReplitExecutionAdapter implements ExecutionRuntimeAdapter {
  id = "replit";
  label = "Execution Runtime (job queue worker)";
  kind: RuntimeKind = "execution";
  runtimeClass: "execution" = "execution";
  capabilities: Capability[] = [
    "file_read",
    "file_write",
    "command_execute",
    "build",
    "apk_build",
    "exe_build",
    "test",
    "deploy",
    "artifact",
  ];
  priority = 20;

  /** How long a chat turn is willing to wait for a real result. */
  private waitMs = 60_000;

  constructor(private o: BackendOpts) {}

  async health(): Promise<RuntimeHealth> {
    if (!this.o.masterSecret) {
      return { online: false, checkedAt: Date.now(), error: "not authenticated for the execution bridge" };
    }
    try {
      const j = await callBackend(this.o, "runtime/status");
      const r = j?.execution_runtime || {};
      if (r.state === "active") {
        return {
          online: true,
          checkedAt: Date.now(),
          detail: { workers: r.workers, pending_jobs: r.pending_jobs },
          resources: { pending_jobs: r.pending_jobs, workers: (r.workers || []).length },
        };
      }
      if (r.state === "stale") {
        return {
          online: true,
          checkedAt: Date.now(),
          degraded: true,
          error: `no worker heartbeat in the last ${Math.round((r.fresh_window_ms || 0) / 60000)} min (last seen ${r.last_seen_at})`,
          detail: { pending_jobs: r.pending_jobs },
        };
      }
      return {
        online: false,
        checkedAt: Date.now(),
        error: "no execution worker has ever claimed a job on this queue",
      };
    } catch (e: any) {
      return { online: false, checkedAt: Date.now(), error: String(e?.message || e) };
    }
  }

  /** Enqueues a genuine job row and returns its id. */
  async enqueue(kind: string, payload: Record<string, unknown>): Promise<string> {
    const j = await callBackend(this.o, "jobs/enqueue", { method: "POST", body: { kind, payload } });
    return j.job.id as string;
  }

  async getJob(id: string): Promise<JobRow> {
    const j = await callBackend(this.o, `jobs/get?id=${encodeURIComponent(id)}`);
    return j.job as JobRow;
  }

  /** Polls the real row. Never invents a terminal state. */
  private async awaitJob(id: string, signal?: AbortSignal): Promise<ExecutionRunResult> {
    const deadline = Date.now() + this.waitMs;
    let last: JobRow | null = null;
    while (Date.now() < deadline) {
      if (signal?.aborted) return { ok: false, error: "cancelled by the user", runId: id };
      await new Promise((r) => setTimeout(r, 2500));
      try {
        last = await this.getJob(id);
      } catch (e: any) {
        return { ok: false, error: String(e?.message || e), runId: id };
      }
      if (last.status === "done") {
        const res = last.result || {};
        return {
          ok: true,
          runId: id,
          exitCode: typeof res.exitCode === "number" ? res.exitCode : null,
          output: typeof res.stdout === "string" ? res.stdout : typeof res.output === "string" ? res.output : undefined,
          artifacts: Array.isArray(res.artifacts) ? res.artifacts : undefined,
        };
      }
      if (last.status === "failed" || last.status === "cancelled") {
        return { ok: false, runId: id, error: last.error || `job ${last.status}` };
      }
    }
    return {
      ok: false,
      runId: id,
      error: `job is still ${last?.status || "pending"} after ${Math.round(this.waitMs / 1000)}s — no result yet`,
    };
  }

  private async run(kind: string, payload: Record<string, unknown>, signal?: AbortSignal) {
    const id = await this.enqueue(kind, payload);
    return this.awaitJob(id, signal);
  }

  execute(req: { command: string; cwd?: string; signal?: AbortSignal }) {
    return this.run("command.execute", { command: req.command, cwd: req.cwd ?? null }, req.signal);
  }

  build(req: { projectId: string; target?: string; signal?: AbortSignal }) {
    const kind = req.target === "android" ? "apk.build" : req.target === "windows" ? "exe.build" : "project.build";
    return this.run(kind, { project_id: req.projectId, target: req.target ?? null }, req.signal);
  }

  test(req: { projectId: string; signal?: AbortSignal }) {
    return this.run("project.test", { project_id: req.projectId }, req.signal);
  }

  deploy(req: { projectId: string; signal?: AbortSignal }) {
    return this.run("project.deploy", { project_id: req.projectId }, req.signal);
  }

  async artifacts(runId: string) {
    const job = await this.getJob(runId);
    const arr = job?.result?.artifacts;
    return Array.isArray(arr) ? arr : [];
  }

  async getLogs(runId: string) {
    const job = await this.getJob(runId);
    const r = job?.result || {};
    return typeof r.stdout === "string" ? r.stdout : typeof r.output === "string" ? r.output : job.error || "";
  }
}

/**
 * Research runtime = backend-api `research/fetch` (real https page fetch with
 * SSRF guards). Honest limitation: URL fetch only, no search engine.
 */
export class ResearchFetchAdapter implements RuntimeAdapter {
  id = "research-fetch";
  label = "Research Runtime (page fetch)";
  kind: RuntimeKind = "research";
  runtimeClass: RuntimeClass = "research";
  capabilities: Capability[] = ["research"];
  priority = 40;

  constructor(private o: BackendOpts) {}

  async health(): Promise<RuntimeHealth> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { online: false, checkedAt: Date.now(), error: "device is offline" };
    }
    if (!this.o.masterSecret) {
      return { online: false, checkedAt: Date.now(), error: "not authenticated for the research endpoint" };
    }
    try {
      await callBackend(this.o, "health");
      return {
        online: true,
        checkedAt: Date.now(),
        degraded: true,
        error: "URL fetch only — no live search index, so a source URL must be supplied",
      };
    } catch (e: any) {
      return { online: false, checkedAt: Date.now(), error: String(e?.message || e) };
    }
  }

  /** Real fetch with a citation, or a thrown error. Never a synthesized page. */
  async fetchUrl(url: string, maxChars = 20000) {
    const j = await callBackend(this.o, "research/fetch", { method: "POST", body: { url, max_chars: maxChars } });
    return j as { citation: { url: string; title: string; fetched_at: string }; text: string; truncated: boolean };
  }
}
