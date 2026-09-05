/**
 * TIVO — CAPABILITY CONTRACT
 * ---------------------------------------------------------------------------
 * The single TIVO Brain never asks "which provider?". It asks "which
 * capability does this task require?" and the Runtime Registry answers with a
 * runtime that actually advertises that capability.
 *
 * This file is a contract only — no execution happens here.
 */

export const CAPABILITIES = [
  "chat",
  "coding",
  "reasoning",
  "research",
  "browser",
  "file_read",
  "file_write",
  "command_execute",
  "build",
  "apk_build",
  "exe_build",
  "test",
  "security_scan",
  "deploy",
  "artifact",
  "model_management",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * A capability class says WHAT KIND of runtime can honestly serve it.
 * A model runtime (Ollama / LM Studio / Cloud AI) serves `inference` only.
 * Everything that touches files, commands, builds, tests, artifacts or
 * deployments needs an `execution` runtime. Live research needs a `research`
 * runtime. Text generation is never a substitute for the other two.
 */
export type CapabilityClass = "inference" | "execution" | "research";

export const CAPABILITY_CLASS: Record<Capability, CapabilityClass> = {
  chat: "inference",
  coding: "inference",
  reasoning: "inference",
  research: "research",
  browser: "research",
  file_read: "execution",
  file_write: "execution",
  command_execute: "execution",
  build: "execution",
  apk_build: "execution",
  exe_build: "execution",
  test: "execution",
  security_scan: "execution",
  deploy: "execution",
  artifact: "execution",
  model_management: "execution",
};

export function capabilityClass(c: Capability): CapabilityClass {
  return CAPABILITY_CLASS[c];
}

/** Cloud text generation may only ever be a fallback for inference work. */
export function cloudFallbackAllowed(c: Capability): boolean {
  return capabilityClass(c) === "inference";
}

/**
 * Truthful availability of a capability right now.
 *  AVAILABLE   — a runtime that can really perform it is reachable.
 *  DEGRADED    — a runtime is reachable but cannot fully perform it yet
 *                (e.g. local server online with no usable model, build server
 *                online but no execution binding wired).
 *  UNAVAILABLE — nothing can perform it.
 */
export type Availability = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

/** Coarse task categories the Brain derives from user intent. */
export type TaskKind =
  | "general_chat"
  | "coding"
  | "reasoning"
  | "research"
  | "build"
  | "test"
  | "security"
  | "deploy"
  | "model_management";

/** Which capability a task kind requires. */
export const TASK_CAPABILITY: Record<TaskKind, Capability> = {
  general_chat: "chat",
  coding: "coding",
  reasoning: "reasoning",
  research: "research",
  build: "build",
  test: "test",
  security: "security_scan",
  deploy: "deploy",
  model_management: "model_management",
};

/**
 * Deterministic (zero-cost, no AI request) intent classification.
 * Intentionally conservative: unknown text is `general_chat`.
 */
export function classifyTask(text: string): TaskKind {
  const t = (text || "").toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));

  if (has("apk", "exe", "build", "compile", "bundle", "gradle", "বিল্ড")) return "build";
  if (has("test", "vitest", "jest", "unit test", "e2e", "playwright", "টেস্ট")) return "test";
  if (has("security", "vulnerab", "rls", "cve", "xss", "sql injection", "নিরাপত্তা")) return "security";
  if (has("deploy", "publish", "vercel", "netlify", "release", "ডিপ্লয়", "পাবলিশ")) return "deploy";
  if (has("model", "ollama", "lm studio", "gguf", "quantiz", "মডেল")) return "model_management";
  if (
    has(
      "research",
      "docs",
      "documentation",
      "latest version",
      "current version",
      "changelog",
      "release notes",
      "pricing",
      "github.com",
      "http://",
      "https://",
      "রিসার্চ",
    )
  )
    return "research";
  if (
    has(
      "code",
      "component",
      "function",
      "refactor",
      "bug",
      "typescript",
      "javascript",
      "python",
      "react",
      "sql",
      "api endpoint",
      "stack trace",
      "কোড",
    )
  )
    return "coding";
  if (
    has(
      "why",
      "explain",
      "architecture",
      "plan",
      "compare",
      "trade-off",
      "tradeoff",
      "design decision",
      "কেন",
      "ব্যাখ্যা",
    )
  )
    return "reasoning";
  return "general_chat";
}


export function capabilityForTask(kind: TaskKind): Capability {
  return TASK_CAPABILITY[kind];
}
