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

function checkSupabaseConnection() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("CONNECTION_ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. System cannot operate.");
  }
  return createClient(url, key);
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
      let dbStatus = "unknown";
      let storageStatus = "unknown";
      try {
        const supabase = checkSupabaseConnection();
        const { error } = await supabase.from("projects").select("id").limit(1);
        dbStatus = error ? `error: ${error.message}` : "connected";
        const { error: storageErr } = await supabase.storage.from("project-files").list("", { limit: 1 });
        storageStatus = storageErr ? `error: ${storageErr.message}` : "connected";
      } catch (e) {
        dbStatus = "disconnected";
        storageStatus = "disconnected";
      }

      return jsonResponse({
        status: dbStatus === "connected" ? "online" : "degraded",
        service: "TIVO AI OS — Autonomous Software Factory",
        version: "3.0.0",
        database: dbStatus,
        storage: storageStatus,
        ai_gateway: Deno.env.get("LOVABLE_API_KEY") ? "configured" : "missing",
        master_secret: Deno.env.get("MASTER_SECRET") ? "configured" : "missing",
        capabilities: [
          "ai-engine/generate — AI code generation",
          "ai-engine/generate-project — Multi-file project generation",
          "ai-engine/review — Code review",
          "ai-engine/fix — Bug fixing",
          "ai-engine/chat — General AI chat",
          "ai-engine/auto-build — Full autonomous build pipeline",
          "project-manager/create — Create project",
          "project-manager/list — List projects",
          "project-manager/get — Get project details",
          "project-manager/update — Update project",
          "project-manager/delete — Delete project",
          "project-manager/upload-files — Upload files",
          "project-manager/publish — Publish project",
          "project-manager/download — Download ready-to-run bundle",
          "project-manager/versions — Version history",
          "sandbox/validate — Code validation",
          "sandbox/generate-tests — Test generation",
          "sandbox/audit — Full project audit",
          "sandbox/optimize — Code optimization",
          "sandbox/visual-audit — AI visual UI audit",
          "sandbox/auto-test-fix — Iterative bug fix pipeline",
          "sandbox/factory — Full autonomous factory pipeline",
          "sandbox/execute — Command execution",
          "backend-api/stats — System stats",
          "backend-api/logs — Memory logs",
          "backend-api/log — Create log entry",
        ],
        timestamp: new Date().toISOString(),
      });
    }

    // All other routes require master secret
    const MASTER_SECRET = Deno.env.get("MASTER_SECRET");
    const providedSecret = req.headers.get("x-master-secret");
    if (!MASTER_SECRET || providedSecret !== MASTER_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let supabase: any;
    try {
      supabase = checkSupabaseConnection();
    } catch (connErr) {
      return jsonResponse({ error: connErr instanceof Error ? connErr.message : "Connection Error", alert: "ADMIN_CONNECTION_ERROR" }, 503);
    }

    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // === MEMORY LOGS ===
    if (action === "logs" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const actionFilter = url.searchParams.get("action");
      let query = supabase.from("memory_logs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (actionFilter) query = query.eq("action", actionFilter);
      const { data, error } = await query;
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
      const [projects, logs, liveProjects] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("memory_logs").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("build_status", "live"),
      ]);
      return jsonResponse({
        total_projects: projects.count || 0,
        live_projects: liveProjects.count || 0,
        total_logs: logs.count || 0,
      });
    }

    // === SYSTEM CONNECTION CHECK ===
    if (action === "check-connection") {
      const checks: any = {};

      // DB check
      const { error: dbErr } = await supabase.from("projects").select("id").limit(1);
      checks.database = dbErr ? { status: "error", message: dbErr.message } : { status: "ok" };

      // Storage check
      const { error: stErr } = await supabase.storage.from("project-files").list("", { limit: 1 });
      checks.storage = stErr ? { status: "error", message: stErr.message } : { status: "ok" };

      // AI check
      checks.ai_gateway = Deno.env.get("LOVABLE_API_KEY") ? { status: "ok" } : { status: "missing", message: "LOVABLE_API_KEY not set" };

      const allOk = Object.values(checks).every((c: any) => c.status === "ok");
      return jsonResponse({ status: allOk ? "all_systems_operational" : "issues_detected", checks });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  } catch (e) {
    console.error("Backend API error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
