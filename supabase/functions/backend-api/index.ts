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

// === FULL CAPABILITY MAP FOR AI DISCOVERY ===
const CAPABILITY_MAP = {
  service: "TIVO DEV AGENT BACKEND — Autonomous Software Factory",
  version: "4.0.0",
  description: "A headless backend engine for autonomous software generation, testing, auditing, packaging, and delivery. Controlled entirely via API with MASTER_SECRET authentication.",
  auth: {
    method: "x-master-secret header",
    description: "Every request (except /health and /capabilities) requires the x-master-secret header matching the configured MASTER_SECRET.",
  },
  endpoints: {
    // === AI ENGINE ===
    "ai-engine/generate": {
      method: "POST",
      description: "AI কোড জেনারেশন — যেকোনো ভাষা ও ফ্রেমওয়ার্কে প্রোডাকশন-রেডি কোড তৈরি করে",
      when_to_use: "যখন একটি নির্দিষ্ট কোড ফাইল বা ফাংশন তৈরি করতে হবে",
      body: { prompt: "string (required)", language: "string?", framework: "string?", context: "string?", model: "string?", stream: "boolean?" },
      returns: "{ success, code }",
    },
    "ai-engine/generate-project": {
      method: "POST",
      description: "মাল্টি-ফাইল প্রজেক্ট জেনারেশন — package.json, README সহ সম্পূর্ণ প্রজেক্ট তৈরি করে",
      when_to_use: "যখন শূন্য থেকে একটি সম্পূর্ণ নতুন প্রজেক্ট তৈরি করতে হবে",
      body: { description: "string (required)", framework: "string?", features: "string[]?", model: "string?" },
      returns: "{ success, project: { project_name, files[], dependencies[], setup_commands[] } }",
    },
    "ai-engine/review": {
      method: "POST",
      description: "কোড রিভিউ — সিকিউরিটি, পারফরম্যান্স, বেস্ট প্র্যাকটিস, বাগ ডিটেকশন",
      when_to_use: "যখন বিদ্যমান কোডের মান যাচাই করতে হবে",
      body: { code: "string (required)", language: "string?", focus: "string?" },
      returns: "{ success, review }",
    },
    "ai-engine/fix": {
      method: "POST",
      description: "বাগ ফিক্সিং — এরর এনালাইসিস করে সম্পূর্ণ ফিক্সড কোড দেয়",
      when_to_use: "যখন কোডে এরর আছে এবং সেটা ফিক্স করতে হবে",
      body: { code: "string (required)", error_message: "string?", language: "string?" },
      returns: "{ success, fix }",
    },
    "ai-engine/chat": {
      method: "POST",
      description: "জেনারেল AI চ্যাট — যেকোনো প্রশ্নের উত্তর দেয়",
      when_to_use: "যখন ইউজারের সাথে কথোপকথন বা সাধারণ প্রশ্নের উত্তর দিতে হবে",
      body: { messages: "array (required)", system_prompt: "string?", model: "string?", stream: "boolean?" },
      returns: "{ success, response }",
    },
    "ai-engine/auto-build": {
      method: "POST",
      description: "🏭 অটোনমাস বিল্ড পাইপলাইন — জেনারেশন → অডিট → ফিক্স → ভিজ্যুয়াল অডিট → প্যাকেজিং → ডিপ্লয়",
      when_to_use: "যখন একটি সম্পূর্ণ প্রজেক্ট স্বয়ংক্রিয়ভাবে বানানো, টেস্ট করা এবং ডিপ্লয় করতে হবে — এটি সবচেয়ে শক্তিশালী endpoint",
      body: { description: "string", project_id: "string?", framework: "string?", features: "string[]?", user_id: "string?" },
      returns: "{ success, project_id, audit_score, steps[], download_url, public_url }",
    },

    // === PROJECT MANAGER ===
    "project-manager/create": {
      method: "POST",
      description: "নতুন প্রজেক্ট তৈরি করে ডাটাবেইজে সেভ করে",
      when_to_use: "যখন একটি নতুন প্রজেক্ট রেকর্ড তৈরি করতে হবে",
      body: { name: "string (required)", description: "string?", user_id: "string?", files: "array?", repo_url: "string?" },
      returns: "{ success, project }",
    },
    "project-manager/list": {
      method: "GET",
      description: "সব প্রজেক্টের তালিকা দেখায়",
      when_to_use: "যখন ইউজারের সব প্রজেক্ট দেখতে হবে",
      params: "?user_id=string&status=string",
      returns: "{ projects[] }",
    },
    "project-manager/get": {
      method: "GET",
      description: "নির্দিষ্ট প্রজেক্টের বিস্তারিত তথ্য",
      when_to_use: "যখন একটি প্রজেক্টের সম্পূর্ণ ডেটা দেখতে হবে",
      params: "?id=string (required)",
      returns: "{ project }",
    },
    "project-manager/update": {
      method: "PUT",
      description: "প্রজেক্ট আপডেট করে — ফাইল, স্ট্যাটাস, মেটাডেটা",
      when_to_use: "যখন বিদ্যমান প্রজেক্টে পরিবর্তন করতে হবে",
      body: { id: "string (required)", "...updates": "any" },
      returns: "{ success }",
    },
    "project-manager/delete": {
      method: "DELETE",
      description: "প্রজেক্ট এবং এর সব ফাইল স্টোরেজ থেকে মুছে ফেলে",
      when_to_use: "যখন একটি প্রজেক্ট সম্পূর্ণ মুছে ফেলতে হবে",
      body: { id: "string (required)" },
      returns: "{ success }",
    },
    "project-manager/upload-files": {
      method: "POST",
      description: "প্রজেক্টে ফাইল আপলোড করে স্টোরেজে সেভ করে",
      when_to_use: "যখন বিদ্যমান প্রজেক্টে নতুন ফাইল যোগ করতে হবে",
      body: { project_id: "string (required)", files: "[{path, content}] (required)" },
      returns: "{ success, uploads[] }",
    },
    "project-manager/publish": {
      method: "POST",
      description: "প্রজেক্ট পাবলিশ করে — পাবলিক URL ও ডাউনলোড লিংক তৈরি করে",
      when_to_use: "যখন প্রজেক্ট রেডি এবং পাবলিকলি অ্যাক্সেসিবল করতে হবে",
      body: { project_id: "string (required)" },
      returns: "{ success, public_url, installer_url }",
    },
    "project-manager/download": {
      method: "GET",
      description: "Ready-to-Run বান্ডেল ডাউনলোড করে — setup.sh ও install.bat সহ",
      when_to_use: "যখন ইউজার প্রজেক্ট ডাউনলোড করে লোকাল পিসিতে চালাতে চায়",
      params: "?id=string (required)",
      returns: "{ success, bundle: { files[], instructions, metadata } }",
    },
    "project-manager/versions": {
      method: "GET",
      description: "প্রজেক্টের ভার্সন হিস্ট্রি দেখায়",
      when_to_use: "যখন প্রজেক্টের আগের ভার্সনগুলো দেখতে হবে",
      params: "?id=string (required)",
      returns: "{ versions[], metadata }",
    },

    // === SANDBOX ===
    "sandbox/validate": {
      method: "POST",
      description: "কোড ভ্যালিডেশন — সিনট্যাক্স, টাইপ, লজিক, সিকিউরিটি চেক",
      when_to_use: "যখন কোডের সঠিকতা দ্রুত যাচাই করতে হবে",
      body: { code: "string (required)", language: "string?", rules: "string?" },
      returns: "{ success, validation: { valid, score, errors[], summary } }",
    },
    "sandbox/generate-tests": {
      method: "POST",
      description: "স্বয়ংক্রিয় টেস্ট জেনারেশন — ইউনিট টেস্ট, এজ কেস টেস্ট",
      when_to_use: "যখন কোডের জন্য টেস্ট ফাইল তৈরি করতে হবে",
      body: { code: "string (required)", language: "string?", framework: "string?", test_framework: "string?" },
      returns: "{ success, tests }",
    },
    "sandbox/audit": {
      method: "POST",
      description: "সম্পূর্ণ প্রজেক্ট অডিট — সিকিউরিটি, পারফরম্যান্স, কোড কোয়ালিটি স্কোর",
      when_to_use: "যখন পুরো প্রজেক্টের মান সামগ্রিকভাবে মূল্যায়ন করতে হবে",
      body: { files: "array?", project_id: "string?" },
      returns: "{ success, audit: { overall_score, security, performance, code_quality, recommendations[] } }",
    },
    "sandbox/optimize": {
      method: "POST",
      description: "কোড অপ্টিমাইজেশন — পারফরম্যান্স ও রিডেবিলিটি উন্নত করে",
      when_to_use: "যখন কোডকে আরো দ্রুত ও পরিষ্কার করতে হবে",
      body: { code: "string (required)", language: "string?", focus: "string?" },
      returns: "{ success, optimized }",
    },
    "sandbox/visual-audit": {
      method: "POST",
      description: "👁️ AI ভিজ্যুয়াল অডিট — UI কোড রেন্ডার কল্পনা করে লেআউট, কালার, রেসপন্সিভনেস চেক করে",
      when_to_use: "যখন UI এর ডিজাইন ও লেআউট পারফেক্ট করতে হবে",
      body: { files: "array?", project_id: "string?" },
      returns: "{ success, passes[], final_score, fixed_files[] }",
    },
    "sandbox/auto-test-fix": {
      method: "POST",
      description: "🔄 ইটারেটিভ বাগ ফিক্স পাইপলাইন — বাগ খুঁজে বের করে, ফিক্স করে, আবার টেস্ট করে (৭ বার পর্যন্ত)",
      when_to_use: "যখন কোডে বাগ আছে এবং সম্পূর্ণ নির্ভুল না হওয়া পর্যন্ত ফিক্স করতে হবে",
      body: { code: "string?", language: "string?", project_id: "string?", max_iterations: "number?" },
      returns: "{ success, fixed_code, iterations[], final_status }",
    },
    "sandbox/factory": {
      method: "POST",
      description: "🏗️ ফুল ফ্যাক্টরি পাইপলাইন — জেনারেট → টেস্ট → ভিজ্যুয়াল অডিট → প্যাকেজ → ডিপ্লয় → ডাউনলোড লিংক",
      when_to_use: "auto-build এর মতোই কিন্তু sandbox দিয়ে চালানো হয়, যখন AI নিজে থেকে পুরো প্রসেস সম্পন্ন করবে",
      body: { description: "string (required)", framework: "string?", features: "string[]?", user_id: "string?" },
      returns: "{ success, project_id, pipeline[], download_url, public_url }",
    },
    "sandbox/execute": {
      method: "POST",
      description: "কমান্ড এক্সিকিউশন — AI দিয়ে কাস্টম কমান্ড প্রসেস করে",
      when_to_use: "যখন কোনো কাস্টম কাজ করতে হবে যা অন্য endpoint এ পড়ে না",
      body: { command: "string (required)", params: "object?" },
      returns: "{ success, status, result, message }",
    },

    // === BACKEND API ===
    "backend-api/health": {
      method: "GET",
      description: "সিস্টেম হেলথ চেক — ডাটাবেইজ, স্টোরেজ, AI গেটওয়ে স্ট্যাটাস",
      when_to_use: "ব্যাকেন্ড সঠিকভাবে কাজ করছে কিনা যাচাই করতে (কোনো auth লাগে না)",
      auth_required: false,
      returns: "{ status, database, storage, ai_gateway, capabilities[] }",
    },
    "backend-api/capabilities": {
      method: "GET",
      description: "📋 সম্পূর্ণ ক্ষমতার তালিকা — সব endpoint, কিভাবে ও কেন ব্যবহার করতে হবে সহ",
      when_to_use: "ফ্রন্টেন্ডের AI প্রথমবার কানেক্ট হলে বা ক্ষমতার তালিকা জানতে চাইলে এটি কল করবে",
      auth_required: false,
      returns: "এই পুরো ক্ষমতার ম্যাপ",
    },
    "backend-api/stats": {
      method: "GET",
      description: "সিস্টেম পরিসংখ্যান — মোট প্রজেক্ট, লাইভ প্রজেক্ট, লগ সংখ্যা",
      when_to_use: "ড্যাশবোর্ডে পরিসংখ্যান দেখাতে",
      returns: "{ total_projects, live_projects, total_logs }",
    },
    "backend-api/logs": {
      method: "GET",
      description: "মেমোরি লগ দেখায় — সব অ্যাক্টিভিটি ট্র্যাক করা হয়",
      when_to_use: "সিস্টেমের অ্যাক্টিভিটি হিস্ট্রি দেখতে",
      params: "?limit=number&action=string",
      returns: "{ logs[] }",
    },
    "backend-api/log": {
      method: "POST",
      description: "কাস্টম লগ এন্ট্রি তৈরি করে",
      when_to_use: "ফ্রন্টেন্ড থেকে কোনো ইভেন্ট লগ করতে চাইলে",
      body: { action: "string?", details: "object?", user_id: "string?" },
      returns: "{ success }",
    },
    "backend-api/check-connection": {
      method: "POST",
      description: "সমস্ত সিস্টেম কম্পোনেন্টের কানেকশন টেস্ট",
      when_to_use: "ডিবাগিং — কোন সিস্টেমে সমস্যা তা চিহ্নিত করতে",
      returns: "{ status, checks: { database, storage, ai_gateway } }",
    },
  },

  // === HF SPACE BUILD ENGINE ===
  hf_build_engine: {
    description: "HF Space-এ চলমান Docker-based Build Engine — APK এবং EXE ফাইল তৈরি করে",
    note: "এই endpoint গুলো HF Space URL-এ কল করতে হবে, Supabase Edge Function-এ নয়",
    endpoints: {
      "/api/health": {
        method: "GET",
        description: "HF Build Engine হেলথ চেক — Java, Gradle, Android SDK, Electron স্ট্যাটাস",
      },
      "/api/build-apk": {
        method: "POST",
        description: "📱 Android APK বিল্ড — ওয়েব প্রজেক্ট থেকে Capacitor দিয়ে অথবা নেটিভ Android প্রজেক্ট থেকে",
        body: { files: "[{path, content}]", config: "{ app_name?, package_name? }" },
        returns: "{ success, build_id, download_url }",
      },
      "/api/build-exe": {
        method: "POST",
        description: "🖥️ Windows EXE বিল্ড — Electron Packager দিয়ে .exe প্যাকেজ তৈরি করে",
        body: { files: "[{path, content}]", config: "{ app_name? }" },
        returns: "{ success, build_id, download_url }",
      },
      "/api/builds": {
        method: "GET",
        description: "সব বিল্ড আউটপুটের তালিকা দেখায়",
      },
    },
  },

  // === AI MODELS ===
  available_models: [
    { id: "google/gemini-3-flash-preview", use: "দ্রুত কাজের জন্য — ডিফল্ট" },
    { id: "google/gemini-2.5-pro", use: "জটিল কোড জেনারেশন ও অডিটের জন্য" },
    { id: "google/gemini-2.5-flash", use: "ব্যালেন্সড — গতি ও মান দুটোই" },
    { id: "openai/gpt-5", use: "সবচেয়ে শক্তিশালী রিজনিং" },
    { id: "openai/gpt-5-mini", use: "খরচ কম, ভালো পারফরম্যান্স" },
  ],

  // === WORKFLOW EXAMPLES ===
  example_workflows: {
    "সম্পূর্ণ সফটওয়্যার তৈরি": [
      "1. ai-engine/auto-build → description দিয়ে কল করো",
      "2. download_url থেকে ইউজারকে ডাউনলোড লিংক দাও",
      "3. অথবা public_url দিয়ে ব্রাউজারে দেখাও",
    ],
    "বিদ্যমান কোড ফিক্স": [
      "1. sandbox/validate → কোড ভ্যালিডেট করো",
      "2. sandbox/auto-test-fix → বাগ ফিক্স করো",
      "3. sandbox/visual-audit → UI ঠিক করো",
    ],
    "APK/EXE তৈরি": [
      "1. ai-engine/auto-build → প্রজেক্ট তৈরি করো",
      "2. HF Space /api/build-apk → APK বিল্ড করো",
      "3. HF Space /api/build-exe → EXE বিল্ড করো",
    ],
  },
};

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
        service: CAPABILITY_MAP.service,
        version: CAPABILITY_MAP.version,
        database: dbStatus,
        storage: storageStatus,
        ai_gateway: Deno.env.get("LOVABLE_API_KEY") ? "configured" : "missing",
        master_secret: Deno.env.get("MASTER_SECRET") ? "configured" : "missing",
        timestamp: new Date().toISOString(),
      });
    }

    // === CAPABILITIES ENDPOINT — NO AUTH REQUIRED ===
    if (action === "capabilities") {
      return jsonResponse(CAPABILITY_MAP);
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
      const { error: dbErr } = await supabase.from("projects").select("id").limit(1);
      checks.database = dbErr ? { status: "error", message: dbErr.message } : { status: "ok" };
      const { error: stErr } = await supabase.storage.from("project-files").list("", { limit: 1 });
      checks.storage = stErr ? { status: "error", message: stErr.message } : { status: "ok" };
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
