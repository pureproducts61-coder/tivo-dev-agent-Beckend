import { supabase } from "@/integrations/supabase/client";

/**
 * Best-effort audit logger. Failures are swallowed — this must never break UX.
 * Server-side RLS/defaults fill tenant_id + actor when omitted.
 */
export async function logAudit(action: string, target?: string, details?: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    const actor = data.user?.email || data.user?.id || "super-admin";
    await supabase.from("audit_logs").insert({
      action,
      actor,
      target: target ?? null,
      details: (details ?? {}) as any,
    } as any);
  } catch {
    /* ignore */
  }
}
