import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-master-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";

    // Health check — no auth needed
    if (action === "health") {
      const supabase = getSupabaseAdmin();
      let dbStatus = "disconnected";
      try {
        const { error } = await supabase.from("profiles").select("id").limit(1);
        dbStatus = error ? `error: ${error.message}` : "connected";
      } catch { dbStatus = "error"; }
      return jsonResponse({
        status: "online",
        service: "TIVO AI OS Backend Engine",
        version: "2.0.0",
        database: dbStatus,
        endpoints: ["ai-engine", "project-manager", "sandbox", "backend-api"],
        timestamp: new Date().toISOString(),
      });
    }

    // All other routes require master secret
    const MASTER_SECRET = Deno.env.get("MASTER_SECRET");
    const providedSecret = req.headers.get("x-master-secret");
    if (!MASTER_SECRET || providedSecret !== MASTER_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseAdmin();
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // === USER MANAGEMENT ===
    if (action === "users" && req.method === "GET") {
      const email = url.searchParams.get("email");
      let query = supabase.from("profiles").select("*");
      if (email) {
        const { data: authUsers } = await supabase.auth.admin.listUsers();
        const ids = authUsers?.users?.filter((u: any) => u.email?.includes(email)).map((u: any) => u.id) || [];
        if (!ids.length) return jsonResponse({ users: [] });
        query = query.in("user_id", ids);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const emailMap: Record<string, string> = {};
      authUsers?.users?.forEach((u: any) => { emailMap[u.id] = u.email || ""; });
      const users = (data || []).map((p: any) => ({ ...p, email: emailMap[p.user_id] || "unknown" }));
      return jsonResponse({ users });
    }

    // === ADD/DEDUCT CREDITS ===
    if (action === "add-credits" && req.method === "POST") {
      const { user_id, credits } = body;
      if (!user_id || !credits) return jsonResponse({ error: "user_id and credits required" }, 400);
      const { data: profile } = await supabase.from("profiles").select("credits").eq("user_id", user_id).single();
      const newCredits = (profile?.credits || 0) + credits;
      await supabase.from("profiles").update({ credits: newCredits }).eq("user_id", user_id);
      return jsonResponse({ success: true, credits: newCredits });
    }

    if (action === "deduct-credits" && req.method === "POST") {
      const { user_id, amount, reason } = body;
      if (!user_id || !amount) return jsonResponse({ error: "user_id and amount required" }, 400);
      const { data: profile } = await supabase.from("profiles").select("credits, is_blocked").eq("user_id", user_id).single();
      if (!profile) return jsonResponse({ error: "User not found" }, 404);
      if (profile.is_blocked) return jsonResponse({ error: "Account blocked" }, 403);
      if (profile.credits < amount) return jsonResponse({ error: "Insufficient credits", credits: profile.credits }, 402);
      const newCredits = profile.credits - amount;
      await supabase.from("profiles").update({ credits: newCredits }).eq("user_id", user_id);
      await supabase.from("memory_logs").insert({ user_id, action: "credits_deducted", details: { amount, reason, remaining: newCredits } });
      return jsonResponse({ success: true, credits: newCredits });
    }

    // === BLOCK/UNBLOCK USER ===
    if (action === "block-user" && req.method === "POST") {
      const { user_id, blocked } = body;
      if (!user_id) return jsonResponse({ error: "user_id required" }, 400);
      await supabase.from("profiles").update({ is_blocked: blocked ?? true }).eq("user_id", user_id);
      return jsonResponse({ success: true });
    }

    // === PAYMENTS ===
    if (action === "payments" && req.method === "GET") {
      const status = url.searchParams.get("status") || "pending";
      const { data, error } = await supabase.from("payments").select("*").eq("status", status).order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ payments: data });
    }

    if (action === "approve-payment" && req.method === "POST") {
      const { payment_id, credits, admin_note } = body;
      if (!payment_id) return jsonResponse({ error: "payment_id required" }, 400);
      const { data: payment } = await supabase.from("payments").select("*").eq("id", payment_id).single();
      if (!payment) return jsonResponse({ error: "Payment not found" }, 404);
      await supabase.from("payments").update({ status: "approved", admin_note: admin_note || "", reviewed_at: new Date().toISOString() }).eq("id", payment_id);
      if (credits) {
        const { data: profile } = await supabase.from("profiles").select("credits").eq("user_id", payment.user_id).single();
        await supabase.from("profiles").update({ credits: (profile?.credits || 0) + credits }).eq("user_id", payment.user_id);
      }
      return jsonResponse({ success: true });
    }

    if (action === "reject-payment" && req.method === "POST") {
      const { payment_id, admin_note } = body;
      await supabase.from("payments").update({ status: "rejected", admin_note: admin_note || "", reviewed_at: new Date().toISOString() }).eq("id", payment_id);
      return jsonResponse({ success: true });
    }

    if (action === "submit-payment" && req.method === "POST") {
      const { user_id, amount, transaction_id, payment_method } = body;
      if (!user_id || !transaction_id) return jsonResponse({ error: "user_id and transaction_id required" }, 400);
      const { error } = await supabase.from("payments").insert({ user_id, amount: amount || 0, transaction_id, payment_method: payment_method || "bkash" });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // === MEMORY LOGS ===
    if (action === "logs" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const { data, error } = await supabase.from("memory_logs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ logs: data });
    }

    if (action === "log" && req.method === "POST") {
      const { user_id, action: logAction, details } = body;
      await supabase.from("memory_logs").insert({ user_id: user_id || null, action: logAction || "custom", details: details || {} });
      return jsonResponse({ success: true });
    }

    // === STATS ===
    if (action === "stats") {
      const [profiles, payments, projects, logs] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("memory_logs").select("id", { count: "exact", head: true }),
      ]);
      return jsonResponse({
        total_users: profiles.count || 0,
        pending_payments: payments.count || 0,
        total_projects: projects.count || 0,
        total_logs: logs.count || 0,
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  } catch (e) {
    console.error("Backend API error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
