/**
 * TIVO — CAPABILITY ROUTER (part of the ONE Brain)
 * ---------------------------------------------------------------------------
 * intent → task kind → required capability → runtime selection.
 * Local-first ordering comes from the runtime priorities; cloud is a fallback.
 */

import { capabilityForTask, classifyTask, type Capability, type TaskKind } from "./capabilities";
import { clampContext, detectDevice, type DeviceProfile } from "./device";
import { emitTivoEvent } from "./events";
import type { RuntimeAdapter, RuntimeRegistry } from "./runtimes";

export interface RouteDecision {
  taskKind: TaskKind;
  capability: Capability;
  runtime: RuntimeAdapter | null;
  /** Human-readable, secret-free explanation for the UI. */
  reason: string;
  device: DeviceProfile;
  safeContext: number;
  /** True when nothing can actually perform the capability right now. */
  unavailable: boolean;
}

export async function route(
  registry: RuntimeRegistry,
  text: string,
  opts: { requestedContext?: number; modelContextWindow?: number | null } = {},
): Promise<RouteDecision> {
  const taskKind = classifyTask(text);
  const capability = capabilityForTask(taskKind);
  const device = await detectDevice();
  const { runtime, reason } = await registry.select(capability);

  return {
    taskKind,
    capability,
    runtime,
    reason,
    device,
    safeContext: clampContext(opts.requestedContext ?? 8192, opts.modelContextWindow ?? null, device),
    unavailable: !runtime,
  };
}

/** Report a genuinely unavailable capability — never fabricate a result. */
export function reportUnavailable(d: RouteDecision) {
  emitTivoEvent("runtime.unavailable", {
    capability: d.capability,
    message: d.reason,
  });
  return `⚠️ **${d.capability}** capability is not available right now.\n\n${d.reason}`;
}
