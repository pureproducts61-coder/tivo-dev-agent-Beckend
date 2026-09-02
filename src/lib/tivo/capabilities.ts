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

  if (has("apk", "exe", "build", "compile", "বিল্ড")) return "build";
  if (has("test", "vitest", "unit test", "টেস্ট")) return "test";
  if (has("security", "vulnerab", "rls", "নিরাপত্তা")) return "security";
  if (has("deploy", "publish", "vercel", "ডিপ্লয়", "পাবলিশ")) return "deploy";
  if (has("model", "ollama", "quantiz", "মডেল")) return "model_management";
  if (has("research", "docs", "documentation", "latest version", "github.com", "http://", "https://"))
    return "research";
  if (has("code", "component", "function", "refactor", "bug", "typescript", "react", "কোড"))
    return "coding";
  if (has("why", "explain", "architecture", "plan", "compare", "কেন", "ব্যাখ্যা")) return "reasoning";
  return "general_chat";
}

export function capabilityForTask(kind: TaskKind): Capability {
  return TASK_CAPABILITY[kind];
}
