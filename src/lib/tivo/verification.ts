/**
 * TIVO — VERIFY (Step 4). The only place that may say a goal succeeded.
 * Judges strictly on Evidence the runtime really returned. Never on model claims.
 */
import type { EvidenceRecord } from "./evidence";
import type { TdefResult } from "./tdef";

export type VerifyState = "PASS" | "PARTIAL" | "FAILED" | "UNCERTAIN" | "BLOCKED" | "NOT_VERIFIABLE";

export interface Verdict {
  state: VerifyState;
  reasons: string[];
}

function proofOk(e: EvidenceRecord): boolean | null {
  const bad = e.items.some((i) =>
    i.kind === "error" ||
    (i.kind === "exit_code" && i.value !== 0) ||
    (i.kind === "http_status" && (Number(i.value) < 200 || Number(i.value) >= 400)) ||
    (i.kind === "health" && i.value === false));
  if (bad) return false;
  return e.hasProof ? true : null;
}

/** Verify one step's result. */
export function verifyStep(r: TdefResult): Verdict {
  if (r.status === "denied" || r.status === "needs_approval" || r.status === "unavailable")
    return { state: "BLOCKED", reasons: [r.status, ...(r.error ? [r.error] : [])] };
  if (!r.evidence) return { state: "NOT_VERIFIABLE", reasons: ["no_evidence"] };
  const ok = proofOk(r.evidence);
  if (r.status === "failed" || ok === false) return { state: "FAILED", reasons: [r.error ?? "evidence_shows_failure"] };
  if (ok === null) return { state: "UNCERTAIN", reasons: ["no_real_proof"] };
  return { state: "PASS", reasons: [] };
}

/** Verify a whole goal from all its step results. */
export function verifyGoal(results: TdefResult[]): Verdict {
  if (!results.length) return { state: "NOT_VERIFIABLE", reasons: ["no_steps"] };
  const v = results.map(verifyStep);
  const n = (s: VerifyState) => v.filter((x) => x.state === s).length;
  const reasons = v.flatMap((x) => x.reasons);
  if (n("PASS") === v.length) return { state: "PASS", reasons: [] };
  if (n("PASS") > 0) return { state: "PARTIAL", reasons };
  if (n("BLOCKED")) return { state: "BLOCKED", reasons };
  if (n("FAILED")) return { state: "FAILED", reasons };
  if (n("UNCERTAIN")) return { state: "UNCERTAIN", reasons };
  return { state: "NOT_VERIFIABLE", reasons };
}
