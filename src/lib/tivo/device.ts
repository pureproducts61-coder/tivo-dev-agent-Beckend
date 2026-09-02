/**
 * TIVO — DEVICE CAPABILITY PROFILE
 * ---------------------------------------------------------------------------
 * Only reports what the browser actually exposes. Anything the browser does
 * not expose is reported as "unknown" — never guessed, never faked.
 */

export type DeviceClass = "mobile" | "desktop" | "unknown";
export type Tier = "low" | "medium" | "high" | "unknown";

export interface DeviceProfile {
  deviceClass: DeviceClass;
  /** Derived from navigator.deviceMemory when available (a coarse hint only). */
  memoryTier: Tier;
  /** Exact GB when the browser exposes it, else null. */
  memoryGb: number | null;
  cpuCores: number | null;
  webgpuAvailable: boolean;
  storageQuotaBytes: number | null;
  online: boolean;
  /** Runtime kinds that could work from this client. */
  runtimeSupport: string[];
}

function memTier(gb: number | null): Tier {
  if (gb == null) return "unknown";
  if (gb <= 2) return "low";
  if (gb <= 6) return "medium";
  return "high";
}

export async function detectDevice(): Promise<DeviceProfile> {
  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  const mobile =
    typeof nav.userAgent === "string" ? /Android|iPhone|iPad|Mobile/i.test(nav.userAgent) : false;

  const memoryGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const webgpuAvailable = typeof nav.gpu !== "undefined";

  let storageQuotaBytes: number | null = null;
  try {
    if (nav.storage?.estimate) {
      const est = await nav.storage.estimate();
      storageQuotaBytes = typeof est?.quota === "number" ? est.quota : null;
    }
  } catch {
    /* unknown — leave null */
  }

  const runtimeSupport = ["cloud", "local_server"];
  if (webgpuAvailable) runtimeSupport.push("webgpu");

  return {
    deviceClass: mobile ? "mobile" : typeof nav.userAgent === "string" ? "desktop" : "unknown",
    memoryTier: memTier(memoryGb),
    memoryGb,
    cpuCores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    webgpuAvailable,
    storageQuotaBytes,
    online: typeof nav.onLine === "boolean" ? nav.onLine : true,
    runtimeSupport,
  };
}

/**
 * Safe context budget for this device. Never a promise about what a model
 * supports — the router clamps by the model's real window too.
 */
export function runtimeSafeContext(p: DeviceProfile): number {
  switch (p.memoryTier) {
    case "low":
      return 4096;
    case "medium":
      return 16384;
    case "high":
      return 65536;
    default:
      return p.deviceClass === "mobile" ? 4096 : 16384;
  }
}

/** safe_context = min(requested, model window, runtime budget) */
export function clampContext(requested: number, modelWindow: number | null, profile: DeviceProfile) {
  const budget = runtimeSafeContext(profile);
  return Math.max(1024, Math.min(requested, modelWindow || requested, budget));
}
