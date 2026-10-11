/**
 * TIVO — RECOVER (Step 4). Self-healing loop, max 5 attempts.
 * The Brain proposes a fix from the failure evidence; each attempt is re-verified.
 * BLOCKED is never "healed" around — it goes back to the user (permission/resource).
 */
import type { TdefResult } from "./tdef";
import { verifyStep, type Verdict } from "./verification";

export const MAX_HEALING_STEPS = 5;

export interface RecoveryOutcome {
  verdict: Verdict;
  attempts: number;
  history: Verdict[];
}

export async function runWithRecovery(
  attempt: (n: number, last?: TdefResult) => Promise<TdefResult>,
): Promise<RecoveryOutcome> {
  const history: Verdict[] = [];
  let last: TdefResult | undefined;
  for (let n = 1; n <= MAX_HEALING_STEPS; n++) {
    last = await attempt(n, last);
    const v = verifyStep(last);
    history.push(v);
    if (v.state === "PASS" || v.state === "BLOCKED" || v.state === "NOT_VERIFIABLE")
      return { verdict: v, attempts: n, history };
  }
  return { verdict: history[history.length - 1], attempts: MAX_HEALING_STEPS, history };
}
