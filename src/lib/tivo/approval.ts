/**
 * TIVO — SMART SCOPED APPROVAL (Plane 4 Control, Step 4)
 * ---------------------------------------------------------------------------
 * The user approves a Brain plan ONCE. That grant covers in-scope work
 * (e.g. writing files inside the approved project) so TIVO never nags per file.
 * Boundary-crossing actions always ask again: deploy/publish (HIGH risk),
 * credentials/secrets, the user's local machine, and destructive operations.
 */
import type { Affordance, InteractionRequest } from "./world";

export interface PlanGrant {
  planId: string;
  /** Resource ids the plan is allowed to act on (e.g. the project id). */
  resourceIds: string[];
  /** Affordance ids listed in the approved plan. */
  affordanceIds: string[];
  approvedAt: string;
}

const BOUNDARY_KINDS = new Set(["credential", "secret", "local", "device", "host"]);
const DESTRUCTIVE = /\b(delete|drop|truncate|rm\s+-rf|wipe|destroy)\b/i;

/** True when an action leaves the safe project sandbox and must always ask. */
export function crossesBoundary(aff: Affordance, req: InteractionRequest): string | null {
  if (aff.risk === "HIGH") return "high_risk";
  if (BOUNDARY_KINDS.has(String(req.resource.kind))) return `boundary:${req.resource.kind}`;
  if (DESTRUCTIVE.test(aff.id) || DESTRUCTIVE.test(JSON.stringify(req.input ?? {}))) return "destructive";
  return null;
}

/** Does a one-time plan approval cover this request without asking again? */
export function grantCovers(grant: PlanGrant | undefined, aff: Affordance, req: InteractionRequest): boolean {
  if (!grant) return false;
  if (crossesBoundary(aff, req)) return false;
  return grant.resourceIds.includes(req.resource.id) && grant.affordanceIds.includes(aff.id);
}
