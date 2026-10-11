/**
 * TIVO — THE ONE BRAIN: provider selection + model proposals
 * ---------------------------------------------------------------------------
 * There is exactly ONE Brain. AI model providers are interchangeable advisors:
 * they send PROPOSALS (a primitive chain + capabilities + summary). The Brain
 * validates each proposal against the 10 fundamental capabilities and the
 * World; a model can never execute, authorize, or declare success.
 *
 * Provider order is chosen by the Brain: local → user-configured → Lovable
 * (Lovable AI is the LAST resort, used only when nothing else is available).
 */
import { PRIMITIVES, type Primitive } from "./world";
import { CAPABILITIES, type Capability } from "./capabilities";
import type { BrainIntent } from "./cognition";

export type ProviderTier = "local" | "configured" | "lovable";
export interface ProviderOption {
  id: string;
  tier: ProviderTier;
  available: boolean;
  priority?: number; // lower = preferred within a tier
}

const TIER_ORDER: Record<ProviderTier, number> = { local: 0, configured: 1, lovable: 2 };

/** Brain decides the provider. Lovable only when no other provider is available. */
export function selectProvider(options: ProviderOption[]): ProviderOption | null {
  const ready = options.filter((o) => o.available);
  if (!ready.length) return null;
  ready.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || (a.priority ?? 100) - (b.priority ?? 100));
  return ready[0];
}

/** Raw, untrusted suggestion coming back from any model provider. */
export interface ModelProposal {
  providerId: string;
  primitives?: unknown[];
  capabilities?: unknown[];
  summary?: unknown;
  /** Models may try to claim things — the Brain ignores these. */
  claimsSuccess?: unknown;
  wantsToExecute?: unknown;
}

export interface ProposalReview {
  accepted: boolean;
  intent: BrainIntent;
  rejected: string[]; // what the Brain discarded and why
}

/**
 * Brain reviews a proposal: keeps only real primitives/capabilities, drops any
 * self-authorization or success claim. A model proposal is advice, not command.
 */
export function reviewProposal(p: ModelProposal): ProposalReview {
  const rejected: string[] = [];
  const primitives = (Array.isArray(p.primitives) ? p.primitives : []).filter((x): x is Primitive => {
    const ok = typeof x === "string" && (PRIMITIVES as readonly string[]).includes(x);
    if (!ok) rejected.push(`unknown primitive: ${String(x)}`);
    return ok;
  });
  const capabilities = (Array.isArray(p.capabilities) ? p.capabilities : []).filter((x): x is Capability => {
    const ok = typeof x === "string" && (CAPABILITIES as readonly string[]).includes(x);
    if (!ok) rejected.push(`unknown capability: ${String(x)}`);
    return ok;
  });
  if (p.claimsSuccess) rejected.push("model cannot declare success (VERIFY required)");
  if (p.wantsToExecute) rejected.push("model cannot execute or authorize (Control decides)");
  const summary = typeof p.summary === "string" ? p.summary.slice(0, 500) : undefined;
  return {
    accepted: primitives.length > 0 || capabilities.length > 0,
    intent: { primitives, capabilities, summary },
    rejected,
  };
}
