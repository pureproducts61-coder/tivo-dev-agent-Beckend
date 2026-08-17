// ============================================================
// TIVO — Canonical provider / credential contract (single source of truth)
// ============================================================
// The backend (`backend-api` → KNOWN_CRED_KEYS, `credentials/test`) identifies
// every provider by its UPPER_SNAKE_CASE credential key. The UI MUST use the
// same identifier — no parallel short-name vocabulary ("gemini", "hf", ...).
// ============================================================

/** Canonical credential key = canonical provider id. */
export type CredentialKey =
  | "LOVABLE_API_KEY"
  | "GEMINI_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "GROQ_API_KEY"
  | "OPENAI_API_KEY"
  | "HF_INFERENCE_TOKEN"
  | "HF_TOKEN"
  | "TAVILY_API_KEY"
  | "GITHUB_TOKEN";

/** What the credential is used for. Chat providers can serve AI inference. */
export type ProviderKind = "chat" | "search" | "vcs" | "catalog";

export interface ProviderSpec {
  /** Canonical id — identical to the backend credential key. */
  key: CredentialKey;
  label: string;
  kind: ProviderKind;
  placeholder: string;
  help: string;
  /** True when the provider can serve streaming chat completions. */
  streaming: boolean;
}

export const PROVIDER_REGISTRY: ProviderSpec[] = [
  {
    key: "LOVABLE_API_KEY",
    label: "Lovable AI Gateway",
    kind: "chat",
    placeholder: "managed automatically",
    help: "Optional adapter — managed by Lovable Cloud",
    streaming: true,
  },
  {
    key: "GEMINI_API_KEY",
    label: "Gemini API Key",
    kind: "chat",
    placeholder: "AIza...",
    help: "Google AI Studio → API key",
    streaming: true,
  },
  {
    key: "DEEPSEEK_API_KEY",
    label: "DeepSeek API Key",
    kind: "chat",
    placeholder: "sk-...",
    help: "platform.deepseek.com",
    streaming: true,
  },
  {
    key: "GROQ_API_KEY",
    label: "Groq API Key",
    kind: "chat",
    placeholder: "gsk_...",
    help: "console.groq.com/keys",
    streaming: true,
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API Key",
    kind: "chat",
    placeholder: "sk-...",
    help: "platform.openai.com",
    streaming: true,
  },
  {
    key: "HF_INFERENCE_TOKEN",
    label: "Hugging Face Inference Token",
    kind: "chat",
    placeholder: "hf_...",
    help: "huggingface.co/settings/tokens — router inference + model catalog",
    streaming: true,
  },
  {
    key: "HF_TOKEN",
    label: "Hugging Face Token (catalog)",
    kind: "catalog",
    placeholder: "hf_...",
    help: "Used only as a model SOURCE/catalog — not a TIVO backend",
    streaming: false,
  },
  {
    key: "TAVILY_API_KEY",
    label: "Tavily Search Key",
    kind: "search",
    placeholder: "tvly-...",
    help: "Optional search adapter",
    streaming: false,
  },
  {
    key: "GITHUB_TOKEN",
    label: "GitHub Token",
    kind: "vcs",
    placeholder: "ghp_...",
    help: "github.com/settings/tokens (repo scope)",
    streaming: false,
  },
];

export const CHAT_PROVIDERS = PROVIDER_REGISTRY.filter((p) => p.kind === "chat");

export function getProvider(key: string): ProviderSpec | undefined {
  return PROVIDER_REGISTRY.find((p) => p.key === key);
}

// ============================================================
// Model registry contract (mirrors public.model_registry)
// ============================================================

export type ModelStatus =
  | "available"
  | "downloading"
  | "downloaded"
  | "verifying"
  | "installed"
  | "ready"
  | "active"
  | "failed"
  | "deleting";

export type ModelSourceKind = "remote_api" | "downloadable";

export interface ModelRecord {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  source_kind: ModelSourceKind;
  format: string | null;
  size_bytes: number | null;
  required_ram_mb: number | null;
  supported_runtimes: string[];
  download_url: string | null;
  checksum: string | null;
  storage_path: string | null;
  status: ModelStatus;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * A model is only inference-ready when it declares a runtime TIVO can actually
 * execute. Today Lovable Cloud can only run `cloud_api` runtimes — downloaded
 * on-device runtimes are NOT implemented, so we never claim readiness for them.
 */
export const SUPPORTED_RUNTIMES = ["cloud_api"] as const;

export function isInferenceReady(m: Pick<ModelRecord, "supported_runtimes" | "status">): boolean {
  const hasRuntime = (m.supported_runtimes || []).some((r) =>
    (SUPPORTED_RUNTIMES as readonly string[]).includes(r),
  );
  return hasRuntime && (m.status === "ready" || m.status === "active");
}
