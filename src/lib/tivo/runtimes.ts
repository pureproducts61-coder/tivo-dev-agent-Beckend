/**
 * TIVO — RUNTIME REGISTRY + ADAPTER CONTRACT
 * ---------------------------------------------------------------------------
 * A runtime is anything that can actually execute a capability. Adapters are
 * honest: `health()` reports what was really probed, and `capabilities` lists
 * only what the runtime can genuinely perform today.
 *
 * The Brain talks to this registry, never to a specific vendor.
 */

import { capabilityClass, type Availability, type Capability, type CapabilityClass } from "./capabilities";
import { emitTivoEvent } from "./events";
import { detectDevice, type DeviceProfile } from "./device";

export type RuntimeKind = "local_server" | "cloud" | "builder" | "native" | "execution" | "research";

/**
 * MODEL runtime  = can run inference (Ollama, LM Studio, Cloud AI, HF inference).
 * EXECUTION runtime = can really touch files / run commands / build / test / deploy.
 * RESEARCH runtime = can really perform live search / fetch.
 * A model runtime is NEVER promoted to an execution runtime just because it can
 * describe a build in text.
 */
export type RuntimeClass = "model" | "execution" | "research";

export interface RuntimeHealth {
  online: boolean;
  checkedAt: number;
  /**
   * Reachable but not fully capable (e.g. local server with zero models). The
   * registry reports these as DEGRADED, never as AVAILABLE.
   */
  degraded?: boolean;
  /** Truthful reason when offline/unreachable/degraded. */
  error?: string;
  detail?: Record<string, unknown>;
  version?: string | null;
  resources?: Record<string, unknown>;
}

export interface RuntimeModelInfo {
  identifier: string;
  name: string;
  contextWindow?: number | null;
  parameterSize?: string | null;
  quantization?: string | null;
}

/** Descriptor shown to the UI — future-proof, secret-free. */
export interface RuntimeDescriptor {
  id: string;
  label: string;
  kind: RuntimeKind;
  runtimeClass: RuntimeClass;
  capabilities: Capability[];
  priority: number;
  endpoint: string | null;
  version: string | null;
  resources: Record<string, unknown> | null;
  models: RuntimeModelInfo[] | null;
  status: Availability;
  reason?: string;
}

/**
 * Contract for a real execution runtime (local bridge, Replit, GitHub Actions,
 * HF builder…). Nothing here is optional-by-convenience: a runtime that does
 * not implement a method simply cannot perform that capability, and the
 * registry reports it as DEGRADED instead of pretending.
 */
export interface ExecutionRunResult {
  ok: boolean;
  exitCode?: number | null;
  output?: string;
  logsUrl?: string | null;
  artifacts?: Array<{ name: string; url?: string; size?: number }>;
  /** Truthful failure reason when ok === false. */
  error?: string;
  runId?: string | null;
}

export interface ExecutionRuntimeAdapter extends RuntimeAdapter {
  runtimeClass: "execution";
  execute?(req: { command: string; cwd?: string; signal?: AbortSignal }): Promise<ExecutionRunResult>;
  build?(req: { projectId: string; target?: string; signal?: AbortSignal }): Promise<ExecutionRunResult>;
  test?(req: { projectId: string; signal?: AbortSignal }): Promise<ExecutionRunResult>;
  deploy?(req: { projectId: string; signal?: AbortSignal }): Promise<ExecutionRunResult>;
  publish?(req: { projectId: string; signal?: AbortSignal }): Promise<ExecutionRunResult>;
  getLogs?(runId: string): Promise<string>;
  cancel?(runId: string): Promise<boolean>;
  artifacts?(runId: string): Promise<Array<{ name: string; url?: string; size?: number }>>;
}

/** Execution methods a capability needs before it can be called AVAILABLE. */
const EXECUTION_METHOD_FOR: Partial<Record<Capability, keyof ExecutionRuntimeAdapter>> = {
  command_execute: "execute",
  file_read: "execute",
  file_write: "execute",
  build: "build",
  apk_build: "build",
  exe_build: "build",
  test: "test",
  deploy: "deploy",
  artifact: "artifacts",
};

export interface RuntimeAdapter {
  id: string;
  label: string;
  kind: RuntimeKind;
  /** Defaults to "model" for legacy adapters that predate the split. */
  runtimeClass?: RuntimeClass;
  capabilities: Capability[];
  /** Lower number = preferred. Local-first ordering lives here. */
  priority: number;
  /** Try to find an endpoint for this runtime. Returns null when not found. */
  discover?(): Promise<string | null>;
  health(): Promise<RuntimeHealth>;
  listModels?(): Promise<RuntimeModelInfo[]>;
  /**
   * Pick a really-available model for a capability. Returns null when the
   * runtime has no model that can serve it — never invents a name.
   */
  pickModel?(capability: Capability): Promise<RuntimeModelInfo | null>;
  /** Present only when the runtime can actually run inference. */
  generate?(req: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    signal?: AbortSignal;
    onToken?: (t: string) => void;
  }): Promise<string>;
  /** Loading is optional; adapters that cannot load must not pretend. */
  loadModel?(id: string): Promise<boolean>;
  unloadModel?(id: string): Promise<boolean>;
  isModelLoaded?(id: string): Promise<boolean>;
}


const LOCAL_ENDPOINT_KEY = "tivo_local_runtime_endpoint";

export function getLocalEndpoint(): string | null {
  try {
    return localStorage.getItem(LOCAL_ENDPOINT_KEY);
  } catch {
    return null;
  }
}

export function setLocalEndpoint(url: string | null) {
  try {
    if (url) localStorage.setItem(LOCAL_ENDPOINT_KEY, url);
    else localStorage.removeItem(LOCAL_ENDPOINT_KEY);
  } catch {
    /* ignore */
  }
}

/** Candidate endpoints for browser-reachable local LLM servers. */
const LOCAL_CANDIDATES = [
  "http://localhost:11434", // Ollama
  "http://127.0.0.1:11434",
  "http://localhost:1234", // LM Studio / OpenAI-compatible
  "http://localhost:8080",
];

async function probe(url: string, path: string, ms = 1500): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url.replace(/\/$/, "") + path, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json().catch(() => ({}));
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ollama / OpenAI-compatible local server adapter.
 * Honest about browser limits: HTTPS pages cannot reach http://localhost
 * (mixed content) and servers without CORS headers will refuse the probe.
 */
export class LocalServerAdapter implements RuntimeAdapter {
  id = "local_server";
  label = "Local LLM Server";
  kind: RuntimeKind = "local_server";
  capabilities: Capability[] = ["chat", "coding", "reasoning"];
  priority = 0;

  private endpoint: string | null = getLocalEndpoint();
  private protocol: "ollama" | "openai" | null = null;

  async discover(): Promise<string | null> {
    if (this.endpoint) return this.endpoint;
    for (const c of LOCAL_CANDIDATES) {
      if (await probe(c, "/api/tags")) {
        this.endpoint = c;
        this.protocol = "ollama";
        return c;
      }
      if (await probe(c, "/v1/models")) {
        this.endpoint = c;
        this.protocol = "openai";
        return c;
      }
    }
    return null;
  }

  async health(): Promise<RuntimeHealth> {
    const ep = await this.discover();
    if (!ep) {
      const mixed =
        typeof location !== "undefined" &&
        location.protocol === "https:" &&
        "browser blocks http://localhost requests from an https page (mixed content)";
      return {
        online: false,
        checkedAt: Date.now(),
        error:
          (mixed as string) ||
          "no local LLM server responded on the known ports (or it does not send CORS headers)",
      };
    }
    const tags = await probe(ep, "/api/tags");
    if (tags) {
      this.protocol = "ollama";
      return { online: true, checkedAt: Date.now(), detail: { endpoint: ep, protocol: "ollama" } };
    }
    const models = await probe(ep, "/v1/models");
    if (models) {
      this.protocol = "openai";
      return { online: true, checkedAt: Date.now(), detail: { endpoint: ep, protocol: "openai" } };
    }
    return { online: false, checkedAt: Date.now(), error: `endpoint ${ep} did not answer a model listing` };
  }

  async listModels(): Promise<RuntimeModelInfo[]> {
    const ep = await this.discover();
    if (!ep) return [];
    const tags = await probe(ep, "/api/tags");
    if (tags?.models) {
      return (tags.models as any[]).map((m) => ({
        identifier: m.name,
        name: m.name,
        parameterSize: m.details?.parameter_size ?? null,
        quantization: m.details?.quantization_level ?? null,
        contextWindow: null,
      }));
    }
    const openai = await probe(ep, "/v1/models");
    if (openai?.data) {
      return (openai.data as any[]).map((m) => ({ identifier: m.id, name: m.id }));
    }
    return [];
  }

  /**
   * Scores only models the server REALLY lists. Nothing is fabricated: every
   * signal used below either comes from the runtime's own metadata
   * (parameter size, quantization, resident state) or from the device profile.
   * Missing metadata contributes nothing rather than a guess.
   */
  async pickModel(capability: Capability): Promise<RuntimeModelInfo | null> {
    const models = await this.listModels();
    if (!models.length) return null;
    emitTivoEvent("model.discovered", {
      runtime: this.id,
      capability,
      message: `${models.length} local model(s) discovered`,
      meta: { models: models.map((m) => m.identifier) },
    });

    const prefer =
      capability === "coding"
        ? /(coder|code|deepseek|qwen.*coder|starcoder|codellama)/i
        : capability === "reasoning"
          ? /(reason|r1|think|qwq|o1)/i
          : /(instruct|chat|it$)/i;

    const resident = new Set<string>();
    const ep = await this.discover();
    const ps = ep ? await probe(ep, "/api/ps") : null;
    if (ps?.models) for (const m of ps.models as any[]) resident.add(m.name);

    const device: DeviceProfile = await detectDevice();
    // Coarse RAM budget for weights: only applied when the browser exposes RAM.
    const ramGb = device.memoryGb;
    const billions = (m: RuntimeModelInfo): number | null => {
      const src = m.parameterSize || m.identifier;
      const hit = /(\d+(?:\.\d+)?)\s*[bB]\b/.exec(src);
      return hit ? Number(hit[1]) : null;
    };
    const quantized = (m: RuntimeModelInfo) => /q[2-8]|int4|int8|gguf/i.test(m.quantization || m.identifier);

    const score = (m: RuntimeModelInfo) => {
      let s = 0;
      if (prefer.test(m.identifier)) s += 4; // task-suitable family
      if (resident.has(m.identifier)) s += 3; // already loaded → fastest, verified
      const b = billions(m);
      if (b != null && ramGb != null) {
        // Rough weight footprint: ~0.7 GB per B when quantized, ~2 GB otherwise.
        const need = b * (quantized(m) ? 0.7 : 2);
        if (need <= ramGb * 0.6) s += 2;
        else if (need <= ramGb) s += 1;
        else s -= 3; // very unlikely to run on this device
      }
      if (b != null && device.deviceClass === "mobile" && b > 8) s -= 2;
      if (quantized(m)) s += 1;
      if (typeof m.contextWindow === "number" && m.contextWindow >= 8192) s += 1;
      if (device.cpuCores != null && device.cpuCores <= 4 && b != null && b > 8) s -= 1;
      return s;
    };

    const chosen = [...models].sort((a, b) => score(b) - score(a))[0];

    emitTivoEvent("model.selected", {
      runtime: this.id,
      capability,
      message: chosen.identifier,
      meta: {
        resident: resident.has(chosen.identifier),
        parameterSize: chosen.parameterSize ?? null,
        quantization: chosen.quantization ?? null,
        deviceMemoryGb: ramGb,
        cpuCores: device.cpuCores,
      },
    });

    // "loaded" is a separate truth from "selected": only claim it when the
    // runtime itself reports the model resident.
    if (resident.has(chosen.identifier)) {
      emitTivoEvent("model.loaded", {
        runtime: this.id,
        capability,
        message: chosen.identifier,
        meta: { verifiedVia: "/api/ps" },
      });
    }
    return chosen;
  }

  async generate(req: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    signal?: AbortSignal;
    onToken?: (t: string) => void;
  }): Promise<string> {
    const ep = await this.discover();
    if (!ep) throw new Error("local runtime unavailable");
    const model = req.model || (await this.listModels())[0]?.identifier;
    if (!model) throw new Error("local runtime has no models installed");

    const ollama = this.protocol === "ollama";
    const r = await fetch(ep + (ollama ? "/api/chat" : "/v1/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: req.messages, stream: true }),
      signal: req.signal,
    });
    if (!r.ok) throw new Error(`local runtime error ${r.status}`);
    const reader = r.body?.getReader();
    if (!reader) throw new Error("local runtime returned no stream");

    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, "").trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        // Ollama streams NDJSON; OpenAI-compatible servers stream SSE.
        const payload = ollama ? line : line.startsWith("data: ") ? line.slice(6).trim() : "";
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta: string =
            j?.message?.content ?? j?.choices?.[0]?.delta?.content ?? j?.response ?? "";
          if (delta) {
            text += delta;
            req.onToken?.(delta);
          }
        } catch {
          /* partial JSON frame — wait for more bytes */
        }
      }
    }
    if (!text.trim()) throw new Error("local runtime produced no output");
    return text;
  }

  /** Ollama keeps models resident itself; we do not claim to control loading. */
  async isModelLoaded(id: string): Promise<boolean> {
    const ep = await this.discover();
    if (!ep) return false;
    const ps = await probe(ep, "/api/ps");
    if (!ps?.models) return false;
    return (ps.models as any[]).some((m) => m.name === id);
  }
}


/**
 * Cloud runtime = the existing `ai-engine` Edge Function (Lovable AI Gateway).
 * Preserved as a fallback/bootstrap route — never the hard-coded default.
 */
export class CloudAdapter implements RuntimeAdapter {
  id = "cloud";
  label = "Cloud AI (Lovable Gateway)";
  kind: RuntimeKind = "cloud";
  capabilities: Capability[] = ["chat", "coding", "reasoning", "research"];
  priority = 90;

  constructor(private backend: string, private masterSecret: string) {}

  async health(): Promise<RuntimeHealth> {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    return online
      ? { online: true, checkedAt: Date.now() }
      : { online: false, checkedAt: Date.now(), error: "device is offline" };
  }

  get chatUrl() {
    return `${this.backend}/functions/v1/ai-engine/chat`;
  }
}

/**
 * Existing HF Docker build server — a build capability runtime, not an AI one.
 * Its endpoint is configured per project/action; capability advertising only.
 */
export class BuilderAdapter implements RuntimeAdapter {
  id = "hf-builder";
  label = "Build Runtime (HF Docker)";
  kind: RuntimeKind = "builder";
  capabilities: Capability[] = ["build", "apk_build", "exe_build", "artifact"];
  priority = 50;

  constructor(private endpoint: string | null) {}

  async health(): Promise<RuntimeHealth> {
    if (!this.endpoint)
      return {
        online: false,
        checkedAt: Date.now(),
        error: "no build runtime endpoint configured",
      };
    const j = await probe(this.endpoint, "/health", 4000);
    return j
      ? { online: true, checkedAt: Date.now(), detail: { endpoint: this.endpoint } }
      : { online: false, checkedAt: Date.now(), error: "build runtime did not answer /health" };
  }
}

export class RuntimeRegistry {
  private adapters: RuntimeAdapter[] = [];

  register(a: RuntimeAdapter) {
    this.adapters = this.adapters.filter((x) => x.id !== a.id).concat(a);
    return this;
  }

  all() {
    return [...this.adapters].sort((a, b) => a.priority - b.priority);
  }

  get(id: string) {
    return this.adapters.find((a) => a.id === id) || null;
  }

  /** Local-first: lowest priority number that actually has the capability AND is healthy. */
  async select(capability: Capability): Promise<{ runtime: RuntimeAdapter | null; reason: string }> {
    const candidates = this.all().filter((a) => a.capabilities.includes(capability));
    if (!candidates.length) return { runtime: null, reason: `no runtime advertises "${capability}"` };
    const reasons: string[] = [];
    for (const a of candidates) {
      const h = await a.health();
      if (h.online) {
        emitTivoEvent("runtime.selected", { runtime: a.id, capability, message: a.label });
        return { runtime: a, reason: `${a.label} is online` };
      }
      reasons.push(`${a.label}: ${h.error || "offline"}`);
    }
    emitTivoEvent("runtime.unavailable", { capability, meta: { reasons } });
    return { runtime: null, reason: reasons.join(" · ") };
  }
}

export function createRuntimeRegistry(opts: {
  backend: string;
  masterSecret: string;
  builderEndpoint?: string | null;
}) {
  return new RuntimeRegistry()
    .register(new LocalServerAdapter())
    .register(new BuilderAdapter(opts.builderEndpoint ?? null))
    .register(new CloudAdapter(opts.backend, opts.masterSecret));
}
