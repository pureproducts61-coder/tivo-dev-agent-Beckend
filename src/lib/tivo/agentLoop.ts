/**
 * TIVO — AGENT LOOP (Step 7): goal → plan proposal → user approval → real
 * file writes → evidence → VERIFY → recovery (max 5 attempts).
 * ---------------------------------------------------------------------------
 * The model only PROPOSES (plan JSON, file contents). The Brain reviews the
 * proposal, the user approves the plan once (scoped grant: files inside the
 * selected project), and success is declared ONLY when the project's stored
 * file list really contains every written path.
 */
import { reviewProposal } from "./brain";
import { contentHash, recordEvidence } from "./evidence";
import { MAX_HEALING_STEPS as MAX_RECOVERY_STEPS } from "./recovery";

export interface PlanFile { path: string; purpose: string }
export interface AgentPlan {
  goal: string;
  summary: string;
  steps: string[];
  files: PlanFile[];
  rejected: string[];
  status: "proposed" | "approved" | "running" | "verified" | "failed" | "cancelled";
  report?: string;
}

const PLAN_TRIGGER =
  /^\s*\/plan\s+/i;
const BUILD_IDEA =
  /(app|website|site|project|অ্যাপ|ওয়েবসাইট|সাইট|প্রজেক্ট|সফটওয়্যার).*(বানাও|বানিয়ে\s*দাও|তৈরি\s*কর|তৈরি\s*করে\s*দাও)|^\s*(please\s+)?(create|make|build\s+me)\s+(an?\s+|my\s+)?(\w+\s+)?(app|website|site|landing\s+page|tool)\b/i;

/** Should this message become a plan-first project request? */
export function wantsPlan(text: string): boolean {
  return PLAN_TRIGGER.test(text) || BUILD_IDEA.test(text);
}

export type CallModel = (messages: { role: string; content: string }[]) => Promise<string>;

function extractJson(raw: string): any {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const s = body.indexOf("{");
  const e = body.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("model did not return JSON");
  return JSON.parse(body.slice(s, e + 1));
}

const SAFE_PATH = /^[A-Za-z0-9._\-/@ ]+$/;
function cleanPath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const path = p.trim().replace(/^\.?\//, "");
  if (!path || path.length > 300 || !SAFE_PATH.test(path)) return null;
  if (path.split("/").some((s) => s === "" || s === "." || s === "..")) return null;
  return path;
}

/** Ask the model for a plan; the Brain reviews it before the user sees it. */
export async function proposePlan(goal: string, call: CallModel): Promise<AgentPlan> {
  const raw = await call([
    {
      role: "system",
      content:
        'You are a planning advisor. Reply with ONLY JSON: {"summary": string, "steps": string[], "files": [{"path": string, "purpose": string}], "primitives": string[], "capabilities": string[]}. ' +
        "Plan a small, runnable web project (plain HTML/CSS/JS unless the user asks otherwise). Max 12 files. Relative paths only. Do not claim anything is done.",
    },
    { role: "user", content: goal.replace(PLAN_TRIGGER, "") },
  ]);
  const j = extractJson(raw);
  const review = reviewProposal({
    providerId: "ai-engine",
    primitives: j.primitives ?? ["UNDERSTAND", "COMPOSE", "GENERATE", "TRANSFORM", "VERIFY"],
    capabilities: j.capabilities ?? ["coding"],
    summary: j.summary,
    claimsSuccess: j.done ?? j.success,
    wantsToExecute: j.execute,
  });
  const files: PlanFile[] = (Array.isArray(j.files) ? j.files : [])
    .map((f: any) => ({ path: cleanPath(f?.path), purpose: String(f?.purpose ?? "").slice(0, 200) }))
    .filter((f: any): f is PlanFile => !!f.path)
    .slice(0, 12);
  if (!files.length) throw new Error("plan had no valid files");
  return {
    goal,
    summary: review.intent.summary ?? "Project plan",
    steps: (Array.isArray(j.steps) ? j.steps : []).map(String).slice(0, 12),
    files,
    rejected: review.rejected,
    status: "proposed",
  };
}

export interface ExecuteDeps {
  call: CallModel;
  upload: (files: { path: string; content: string }[]) => Promise<{ path: string; success: boolean }[]>;
  listStored: () => Promise<string[]>;
  onProgress: (msg: string) => void;
  correlationId: string;
}

async function generateFile(plan: AgentPlan, f: PlanFile, call: CallModel, error?: string): Promise<string> {
  const raw = await call([
    {
      role: "system",
      content:
        "You write exactly one source file. Reply with ONLY the raw file content, no markdown fences, no commentary.",
    },
    {
      role: "user",
      content:
        `Project goal: ${plan.goal}\nPlan: ${plan.summary}\nAll files: ${plan.files.map((x) => x.path).join(", ")}\n` +
        `Write file: ${f.path}\nPurpose: ${f.purpose}` + (error ? `\nPrevious attempt failed: ${error}` : ""),
    },
  ]);
  return raw.replace(/^```[\w-]*\n?/, "").replace(/\n?```\s*$/, "");
}

/** Runs the approved plan. Returns a truthful report; never fakes success. */
export async function executePlan(plan: AgentPlan, d: ExecuteDeps): Promise<{ ok: boolean; report: string }> {
  const pending = new Map(plan.files.map((f) => [f.path, f]));
  const errors = new Map<string, string>();
  const hashes = new Map<string, string>();

  for (let attempt = 1; attempt <= MAX_RECOVERY_STEPS && pending.size; attempt++) {
    const batch: { path: string; content: string }[] = [];
    for (const f of pending.values()) {
      d.onProgress(`✍️ (${attempt}/${MAX_RECOVERY_STEPS}) লিখছি: ${f.path}`);
      try {
        const content = await generateFile(plan, f, d.call, errors.get(f.path));
        if (!content.trim()) throw new Error("empty content");
        batch.push({ path: f.path, content });
        hashes.set(f.path, contentHash(content));
      } catch (e: any) {
        errors.set(f.path, String(e?.message || e));
      }
    }
    if (batch.length) {
      d.onProgress("💾 প্রজেক্টে সেভ করছি...");
      try {
        const res = await d.upload(batch);
        for (const r of res) {
          if (r.success) { pending.delete(r.path); errors.delete(r.path); }
          else errors.set(r.path, "storage write failed");
        }
      } catch (e: any) {
        for (const b of batch) errors.set(b.path, String(e?.message || e));
      }
    }
  }

  // VERIFY: read the project back and confirm every path is really stored.
  d.onProgress("🔍 যাচাই করছি...");
  let stored: string[] = [];
  try { stored = await d.listStored(); } catch { /* verification fails below */ }
  const missing = plan.files.map((f) => f.path).filter((p) => !stored.includes(p));
  const ok = missing.length === 0;

  recordEvidence({
    correlationId: d.correlationId,
    affordanceId: "project.files.write",
    primitive: "TRANSFORM",
    runtime: "project-manager",
    observedAt: new Date().toISOString(),
    items: plan.files.map((f) => ({
      kind: "artifact" as const,
      value: `${f.path}:${stored.includes(f.path) ? "stored" : "missing"}${hashes.get(f.path) ? `#${hashes.get(f.path)}` : ""}`,
      source: "project-manager/get",
    })),
    hasProof: stored.length > 0,
  });

  const lines = plan.files.map((f) => `- ${stored.includes(f.path) ? "✅" : "❌"} \`${f.path}\`${errors.get(f.path) ? ` — ${errors.get(f.path)}` : ""}`);
  const report = ok
    ? `✅ **যাচাই সম্পন্ন** — ${plan.files.length}টি ফাইল প্রজেক্টে সত্যিই সেভ হয়েছে (প্রজেক্ট থেকে আবার পড়ে মিলিয়ে দেখা হয়েছে)।\n\n${lines.join("\n")}\n\nতিন-ডট মেনু থেকে Download ZIP দিয়ে ফাইলগুলো নিতে পারো।`
    : `❌ **সম্পূর্ণ হয়নি** — ${missing.length}টি ফাইল ${MAX_RECOVERY_STEPS} বার চেষ্টার পরও সেভ হয়নি।\n\n${lines.join("\n")}`;
  return { ok, report };
}
