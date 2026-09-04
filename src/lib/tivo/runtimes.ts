/**
 * TIVO — RUNTIME REGISTRY + ADAPTER CONTRACT
 * ---------------------------------------------------------------------------
 * A runtime is anything that can actually execute a capability. Adapters are
 * honest: `health()` reports what was really probed, and `capabilities` lists
 * only what the runtime can genuinely perform today.
 *
 * The Brain talks to this registry, never to a specific vendor.
 */

import type { Capability } from "./capabilities";
import { emitTivoEvent } from "./events";

export type RuntimeKind = "local_server" | "cloud" | "builder" | "native";

export interface RuntimeHealth {
  online: boolean;
  checkedAt: number;
  /** Truthful reason when offline/unreachable. */
  error?: string;
  detail?: Record<string, unknown>;
}

export interface RuntimeModelInfo {
  identifier: string;
  name: string;
  contextWindow?: number | null;
  parameterSize?: string | null;
  quantization?: string | null;
}

export interface RuntimeAdapter {
  id: string;
  label: string;
  kind: RuntimeKind;
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
   * Chooses a model the server really lists. Coding tasks prefer a coder model,
   * reasoning prefers a reasoning-tuned one — but only when such a model is
   * actually installed. Already-resident models (Ollama /api/ps) win ties.
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


    const score = (m: RuntimeModelInfo) =>
      (prefer.test(m.identifier) ? 2 : 0) + (resident.has(m.identifier) ? 1 : 0);
    const chosen = [...models].sort((a, b) => score(b) - score(a))[0];

    emitTivoEvent("model.selected", {
      runtime: this.id,
      capability,
      message: chosen.identifier,
      meta: { resident: resident.has(chosen.identifier) },
    });
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
