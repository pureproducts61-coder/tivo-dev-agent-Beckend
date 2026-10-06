/**
 * TIVO — DYNAMIC RUNTIME CONNECTIONS
 * ---------------------------------------------------------------------------
 * Core Constitution:  Credential != Runtime != Capability.
 *
 *   Primitive capability -> composition / power -> reusable recipe.
 *   A runtime/provider (Lovable Cloud, Replit, a VPS, GitHub Actions…) is only
 *   an implementation ENVIRONMENT — never a capability itself.
 *   The TIVO Brain selects the capability first, then a HEALTHY runtime.
 *
 * Connections live in `runtime_connections` (backend-only). Rows reference a
 * `system_credentials` key; tokens never reach the browser, events or prompts.
 * Health is probed server-side via backend-api `runtimes/test`.
 *
 * This adapter does NOT execute anything. Until a generic, contract-verified
 * proxy exists, it exposes no execute/build/test/deploy methods, so the
 * registry reports such runtimes as DEGRADED for execution — never AVAILABLE.
 */

import type { Capability } from "./capabilities";
import type { RuntimeAdapter, RuntimeClass, RuntimeHealth, RuntimeKind } from "./runtimes";

/** Canonical TIVO runtime contract (tivo/v1). Documented only; remote runtimes implement it. */
export const TIVO_RUNTIME_CONTRACT = {
  version: "tivo/v1",
  operations: {
    health: "GET /health",
    capabilities: "GET /capabilities", // { contract: "tivo/v1", capabilities: string[] }
    createTask: "POST /tasks",
    getTask: "GET /tasks/:id",
    events: "GET /events",
    artifacts: "GET /artifacts",
    cancel: "POST /cancel",
    // optional
    build: "POST /build",
    test: "POST /test",
    deploy: "POST /deploy",
    publish: "POST /publish",
  },
} as const;

/** Secret-free descriptor as returned by backend-api `runtimes/list`. */
export interface RuntimeConnectionDescriptor {
  id: string;
  name: string;
  endpoint: string;
  auth_type: "none" | "token" | "api_key";
  has_credential: boolean;
  enabled: boolean;
  capabilities: string[];
  runtime_class: RuntimeClass;
  priority: number;
  local: boolean;
  execution_contract: boolean;
}

interface BackendOpts {
  backend: string;
  masterSecret: string;
}

async function call(o: BackendOpts, action: string, body?: unknown) {
  const res = await fetch(`${o.backend}/functions/v1/backend-api/${action}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-master-secret": o.masterSecret },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || `${action} failed (${res.status})`);
  return j;
}

export class RuntimeConnectionAdapter implements RuntimeAdapter {
  id: string;
  label: string;
  kind: RuntimeKind;
  runtimeClass: RuntimeClass;
  capabilities: Capability[];
  priority: number;
  private cache: { at: number; h: RuntimeHealth } | null = null;

  constructor(private d: RuntimeConnectionDescriptor, private o: BackendOpts) {
    this.id = `conn:${d.id}`;
    this.label = d.name;
    this.runtimeClass = d.runtime_class;
    this.kind = (d.runtime_class === "model" ? "local_server" : d.runtime_class) as RuntimeKind;
    this.capabilities = d.capabilities as Capability[];
    this.priority = d.priority;
  }

  async health(): Promise<RuntimeHealth> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.h;
    let h: RuntimeHealth;
    if (!this.d.enabled) h = { online: false, checkedAt: Date.now(), error: "connection disabled" };
    else {
      try {
        const j = await call(this.o, "runtimes/test", { id: this.d.id });
        h = j.online
          ? {
              online: true,
              checkedAt: Date.now(),
              version: j.version ?? null,
              // Reachable, but no generic execution proxy exists yet.
              degraded: this.runtimeClass === "execution",
              error:
                this.runtimeClass === "execution"
                  ? j.execution_contract
                    ? "advertises tivo/v1 but the execution proxy is not enabled yet"
                    : "reachable but does not advertise the tivo/v1 execution contract"
                  : undefined,
              detail: { endpoint: this.d.endpoint, discovered: j.discovered_capabilities },
            }
          : { online: false, checkedAt: Date.now(), error: j.reason || "health check failed" };
      } catch (e: any) {
        h = { online: false, checkedAt: Date.now(), error: String(e?.message || e) };
      }
    }
    this.cache = { at: Date.now(), h };
    return h;
  }
}

/** Loads backend-provided descriptors. Returns [] when unavailable — never invents runtimes. */
export async function loadRuntimeConnections(o: BackendOpts): Promise<RuntimeConnectionAdapter[]> {
  if (!o.masterSecret) return [];
  try {
    const j = await call(o, "runtimes/list");
    return (j.runtimes || [])
      .filter((d: RuntimeConnectionDescriptor) => d.enabled)
      .map((d: RuntimeConnectionDescriptor) => new RuntimeConnectionAdapter(d, o));
  } catch {
    return [];
  }
}
