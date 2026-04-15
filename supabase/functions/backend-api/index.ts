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

function tryGetSupabase() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

// === COMPLETE CAPABILITY MAP v6.0 ===
const CAPABILITY_MAP = {
  service: "TIVO DEV AGENT BACKEND — Autonomous Software Factory",
  version: "6.0.0",
  description: "A headless backend engine for autonomous software generation, testing, auditing, native app building, and delivery. Controlled entirely via API with MASTER_SECRET authentication.",

  auth: {
    method: "x-master-secret header",
    description: "Every request (except /health, /capabilities, /suggest, /frontend-ai-guide) requires the x-master-secret header.",
  },

  credential_config: {
    description: "কোথায় কোন ক্রেডেনশিয়াল সেট করতে হবে",
    vercel_env_vars: {
      NEXT_PUBLIC_BACKEND_URL: "Supabase URL (e.g., https://xxxxx.supabase.co)",
      NEXT_PUBLIC_MASTER_SECRET: "MASTER_SECRET value — backend access key",
      NEXT_PUBLIC_HF_SPACE_URL: "HF Space URL (e.g., https://username-space.hf.space) — APK/EXE build-এর জন্য",
      NEXT_PUBLIC_SUPABASE_URL: "Same as NEXT_PUBLIC_BACKEND_URL",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase Anon/Publishable key",
    },
    hf_space_secrets: {
      note: "HF Space শুধু native build engine (APK/EXE) — ডাটাবেইজ দরকার নেই। কিন্তু চাইলে সেট করতে পারো:",
      SUPABASE_URL: "Optional — build logs DB-তে সেভ করতে চাইলে",
      SUPABASE_SERVICE_ROLE_KEY: "Optional — উপরের সাথে",
    },
    github_actions_secrets: {
      HF_TOKEN: "Hugging Face write token — HF Space-এ পুশ করতে",
      HF_SPACE: "HF Space path (e.g., username/space-name)",
      VITE_SUPABASE_URL: "Supabase URL — ফ্রন্টেন্ড বিল্ডের জন্য",
      VITE_SUPABASE_PUBLISHABLE_KEY: "Supabase anon key — ফ্রন্টেন্ড বিল্ডের জন্য",
    },
    supabase_edge_function_secrets: {
      MASTER_SECRET: "API access key — ফ্রন্টেন্ড ও ব্যাকেন্ডে একই হতে হবে",
      LOVABLE_API_KEY: "AI Gateway key — AI কল করার জন্য",
      SUPABASE_URL: "Auto-set by Supabase",
      SUPABASE_SERVICE_ROLE_KEY: "Auto-set by Supabase",
    },
  },

  rate_limiting: {
    description: "প্রতিটি edge function-এ rate limiting (30 req/min) এবং request queue (max 5 concurrent) আছে",
    per_ip: "30 requests/minute",
    max_concurrent: 5,
  },

  graceful_degradation: {
    description: "DB credentials না থাকলেও AI-only endpoints কাজ করবে",
    ai_only_endpoints: [
      "ai-engine/generate", "ai-engine/review", "ai-engine/fix", "ai-engine/chat",
      "ai-engine/generate-project", "ai-engine/refactor", "ai-engine/convert",
      "ai-engine/generate-api", "ai-engine/generate-docs",
      "ai-engine/generate-image", "ai-engine/edit-image", "ai-engine/process-file",
      "sandbox/validate", "sandbox/generate-tests", "sandbox/optimize",
      "sandbox/generate-schema", "sandbox/generate-components", "sandbox/analyze-deps",
      "sandbox/code-to-image (code param)", "sandbox/visual-audit (files param)",
      "sandbox/auto-test-fix (code param)",
    ],
    db_required_endpoints: [
      "ai-engine/auto-build", "ai-engine/build-native", "ai-engine/full-stack-build",
      "project-manager/* (all)", "sandbox/factory",
      "sandbox/deploy-automation", "backend-api/stats", "backend-api/logs",
    ],
  },

  endpoints: {
    "ai-engine/generate": { method: "POST", category: "code", db_required: false, description: "AI কোড জেনারেশন", when_to_use: "একটি নির্দিষ্ট কোড ফাইল বা ফাংশন তৈরি করতে", body: { prompt: "string (required)", language: "string?", framework: "string?", context: "string?", model: "string?", stream: "boolean?" }, returns: "{ success, code }" },
    "ai-engine/generate-project": { method: "POST", category: "project", db_required: false, description: "মাল্টি-ফাইল প্রজেক্ট জেনারেশন", when_to_use: "শূন্য থেকে নতুন প্রজেক্ট তৈরি করতে", body: { description: "string (required)", framework: "string?", features: "string[]?", tech_stack: "string?", model: "string?" }, returns: "{ success, project }" },
    "ai-engine/review": { method: "POST", category: "quality", db_required: false, description: "কোড রিভিউ", body: { code: "string (required)", language: "string?", focus: "string?" }, returns: "{ success, review }" },
    "ai-engine/fix": { method: "POST", category: "quality", db_required: false, description: "বাগ ফিক্সিং", body: { code: "string (required)", error_message: "string?", language: "string?" }, returns: "{ success, fix }" },
    "ai-engine/chat": { method: "POST", category: "general", db_required: false, description: "জেনারেল AI চ্যাট — স্ট্রিমিং সাপোর্ট সহ", body: { messages: "array (required)", system_prompt: "string?", model: "string?", stream: "boolean?" }, returns: "{ success, response } or SSE stream" },
    "ai-engine/auto-build": { method: "POST", category: "factory", db_required: true, description: "🏭 অটোনমাস বিল্ড পাইপলাইন", when_to_use: "সম্পূর্ণ প্রজেক্ট স্বয়ংক্রিয়ভাবে বানাতে", body: { description: "string", project_id: "string?", framework: "string?", features: "string[]?", user_id: "string?", quality_target: "number?" }, returns: "{ success, project_id, audit_score, steps[], download_url, public_url }" },
    "ai-engine/build-native": { method: "POST", category: "native_build", db_required: true, description: "📱🖥️ নেটিভ বিল্ড", body: { project_id: "string (required)", build_type: "'apk'|'exe'", hf_space_url: "string (required)" }, returns: "{ success, build_type, build_id, download_url }" },
    "ai-engine/full-stack-build": { method: "POST", category: "factory", db_required: true, description: "🚀 ফুল-স্ট্যাক বিল্ড", body: { description: "string", build_type: "'apk'|'exe'?", hf_space_url: "string?" }, returns: "{ success, project_id, web_url, native_download_url }" },
    "ai-engine/refactor": { method: "POST", category: "code", db_required: false, description: "কোড রিফ্যাক্টরিং", body: { code: "string (required)", goal: "string?" }, returns: "{ success, refactored }" },
    "ai-engine/convert": { method: "POST", category: "code", db_required: false, description: "কোড কনভার্ট", body: { code: "string (required)", from_language: "string?", to_language: "string?" }, returns: "{ success, converted }" },
    "ai-engine/generate-api": { method: "POST", category: "code", db_required: false, description: "REST API জেনারেশন", body: { description: "string (required)" }, returns: "{ success, api }" },
    "ai-engine/generate-docs": { method: "POST", category: "code", db_required: false, description: "ডকুমেন্টেশন জেনারেশন", body: { code: "string (required)" }, returns: "{ success, documentation }" },
    "ai-engine/generate-image": { method: "POST", category: "media", db_required: false, description: "🖼️ ইমেজ জেনারেশন (লোগো, ব্যানার, পোস্ট)", when_to_use: "লোগো, ব্যানার, সোশ্যাল মিডিয়া পোস্ট, আইকন তৈরি করতে", body: { prompt: "string (required)", style: "string?", size: "string?", purpose: "'logo'|'banner'|'post'|'icon'?", project_id: "string?", file_name: "string?" }, returns: "{ success, image_base64, stored_url }" },
    "ai-engine/edit-image": { method: "POST", category: "media", db_required: false, description: "✏️ ইমেজ এডিট", when_to_use: "বিদ্যমান ইমেজ পরিবর্তন করতে", body: { image_url: "string (required — base64 or https)", instruction: "string (required)" }, returns: "{ success, image_base64 }" },
    "ai-engine/process-file": { method: "POST", category: "media", db_required: false, description: "📁 ফাইল প্রসেসিং (ZIP, ইমেজ, কোড, ডেটা)", when_to_use: "ইউজার ফাইল আপলোড করলে সেটা বিশ্লেষণ করতে", body: { file_content: "string (required — base64 or text)", file_type: "string?", file_name: "string?", instruction: "string?" }, returns: "{ success, analysis }" },

    "project-manager/create": { method: "POST", category: "project", db_required: true, description: "নতুন প্রজেক্ট তৈরি", body: { name: "string (required)", description: "string?", user_id: "string?", files: "array?" }, returns: "{ success, project }" },
    "project-manager/list": { method: "GET", category: "project", db_required: true, description: "সব প্রজেক্ট দেখাও", params: "?user_id=string&status=string" },
    "project-manager/get": { method: "GET", category: "project", db_required: true, description: "প্রজেক্ট বিস্তারিত", params: "?id=string" },
    "project-manager/update": { method: "PUT", category: "project", db_required: true, description: "প্রজেক্ট আপডেট" },
    "project-manager/delete": { method: "DELETE", category: "project", db_required: true, description: "প্রজেক্ট মুছো" },
    "project-manager/upload-files": { method: "POST", category: "project", db_required: true, description: "ফাইল আপলোড" },
    "project-manager/publish": { method: "POST", category: "deploy", db_required: true, description: "প্রজেক্ট পাবলিশ করো" },
    "project-manager/download": { method: "GET", category: "deploy", db_required: true, description: "Ready-to-Run বান্ডেল ডাউনলোড" },
    "project-manager/versions": { method: "GET", category: "project", db_required: true, description: "ভার্সন হিস্ট্রি" },

    "sandbox/validate": { method: "POST", category: "quality", db_required: false, description: "কোড ভ্যালিডেশন" },
    "sandbox/generate-tests": { method: "POST", category: "quality", db_required: false, description: "টেস্ট জেনারেশন" },
    "sandbox/audit": { method: "POST", category: "quality", db_required: false, description: "প্রজেক্ট অডিট" },
    "sandbox/optimize": { method: "POST", category: "quality", db_required: false, description: "কোড অপ্টিমাইজ" },
    "sandbox/visual-audit": { method: "POST", category: "quality", db_required: false, description: "👁️ ভিজ্যুয়াল অডিট" },
    "sandbox/auto-test-fix": { method: "POST", category: "quality", db_required: false, description: "🔄 ইটারেটিভ বাগ ফিক্স" },
    "sandbox/factory": { method: "POST", category: "factory", db_required: true, description: "🏗️ ফ্যাক্টরি পাইপলাইন" },
    "sandbox/execute": { method: "POST", category: "general", db_required: false, description: "কাস্টম কমান্ড" },
    "sandbox/code-to-image": { method: "POST", category: "render", db_required: false, description: "🖼️ কোড থেকে UI প্রিভিউ" },
    "sandbox/generate-schema": { method: "POST", category: "database", db_required: false, description: "🗄️ ডাটাবেইজ স্কিমা জেনারেশন" },
    "sandbox/deploy-automation": { method: "POST", category: "deploy", db_required: true, description: "🚀 ডিপ্লয়মেন্ট অটোমেশন" },
    "sandbox/generate-components": { method: "POST", category: "code", db_required: false, description: "🧩 কম্পোনেন্ট লাইব্রেরি" },
    "sandbox/analyze-deps": { method: "POST", category: "quality", db_required: false, description: "📦 ডিপেন্ডেন্সি এনালাইজার" },

    "backend-api/health": { method: "GET", category: "system", auth_required: false, description: "সিস্টেম হেলথ চেক" },
    "backend-api/capabilities": { method: "GET", category: "system", auth_required: false, description: "📋 ক্ষমতার তালিকা" },
    "backend-api/suggest": { method: "POST", category: "system", auth_required: false, description: "🧠 স্মার্ট সাজেশন" },
    "backend-api/frontend-ai-guide": { method: "GET", category: "system", auth_required: false, description: "📖 ফ্রন্টেন্ড AI গাইড" },
    "backend-api/stats": { method: "GET", category: "system", db_required: true, description: "পরিসংখ্যান" },
    "backend-api/logs": { method: "GET", category: "system", db_required: true, description: "মেমোরি লগ" },
    "backend-api/log": { method: "POST", category: "system", db_required: true, description: "লগ তৈরি" },
    "backend-api/check-connection": { method: "POST", category: "system", db_required: true, description: "কানেকশন টেস্ট" },
  },

  hf_build_engine: {
    description: "HF Space-এ চলমান Docker-based Build Engine — APK ও EXE বিল্ড করে",
    endpoints: {
      "/api/health": { method: "GET", description: "Build Engine হেলথ চেক" },
      "/api/capabilities": { method: "GET", description: "Build Engine ক্ষমতা ও টুল তালিকা" },
      "/api/build-apk": { method: "POST", description: "📱 APK বিল্ড", body: { files: "[{path, content}]", config: "{ app_name?, package_name? }" } },
      "/api/build-exe": { method: "POST", description: "🖥️ EXE বিল্ড", body: { files: "[{path, content}]", config: "{ app_name? }" } },
      "/api/builds": { method: "GET", description: "বিল্ড তালিকা" },
    },
  },

  available_models: [
    { id: "google/gemini-3-flash-preview", use: "দ্রুত কাজ — ডিফল্ট" },
    { id: "google/gemini-2.5-pro", use: "জটিল কোড ও অডিট" },
    { id: "google/gemini-2.5-flash", use: "ব্যালেন্সড" },
    { id: "openai/gpt-5", use: "সবচেয়ে শক্তিশালী রিজনিং" },
    { id: "openai/gpt-5-mini", use: "খরচ কম, ভালো পারফরম্যান্স" },
    { id: "openai/gpt-5.2", use: "সর্বশেষ ও সবচেয়ে উন্নত" },
  ],

  smart_routing: {
    intents: {
      "build_full_project": {
        keywords: ["তৈরি করো", "বানাও", "create", "build", "make", "সফটওয়্যার", "e-commerce", "portfolio", "website", "app"],
        primary: "ai-engine/auto-build",
        alternative: "ai-engine/full-stack-build",
        workflow: ["ai-engine/auto-build → project_id পাবে", "project-manager/publish → পাবলিক URL", "project-manager/download → ZIP ডাউনলোড"],
      },
      "build_native_app": {
        keywords: ["APK", "Android", "মোবাইল", "mobile app", "EXE", "Windows", "ডেস্কটপ", "desktop", "ইন্সটল"],
        primary: "ai-engine/full-stack-build",
        alternative: "ai-engine/build-native",
        workflow: ["ai-engine/full-stack-build → ওয়েব + নেটিভ একসাথে"],
      },
      "fix_code": { keywords: ["ফিক্স", "এরর", "বাগ", "fix", "error", "bug"], primary: "ai-engine/fix", alternative: "sandbox/auto-test-fix" },
      "review_quality": { keywords: ["রিভিউ", "চেক", "review", "audit", "quality"], primary: "ai-engine/review", alternative: "sandbox/audit" },
      "generate_code": { keywords: ["কোড লিখো", "জেনারেট", "generate", "code", "function"], primary: "ai-engine/generate" },
      "test_code": { keywords: ["টেস্ট", "test", "validate", "ভ্যালিডেট"], primary: "sandbox/validate", alternative: "sandbox/generate-tests" },
      "ui_design": { keywords: ["UI", "ডিজাইন", "design", "layout", "responsive"], primary: "sandbox/visual-audit" },
      "image_generate": { keywords: ["লোগো", "ব্যানার", "পোস্ট", "ইমেজ", "logo", "banner", "image", "icon", "poster", "thumbnail"], primary: "ai-engine/generate-image", alternative: "ai-engine/edit-image" },
      "file_process": { keywords: ["ফাইল", "আপলোড", "file", "upload", "zip", "analyze", "বিশ্লেষণ"], primary: "ai-engine/process-file" },
      "manage_project": { keywords: ["প্রজেক্ট", "list", "তালিকা", "আপডেট"], primary: "project-manager/list" },
      "download_deploy": { keywords: ["ডাউনলোড", "download", "ডিপ্লয়", "deploy", "পাবলিশ"], primary: "project-manager/download", alternative: "project-manager/publish" },
      "refactor_convert": { keywords: ["রিফ্যাক্টর", "refactor", "কনভার্ট", "convert"], primary: "ai-engine/refactor", alternative: "ai-engine/convert" },
      "api_backend": { keywords: ["API", "backend", "REST", "endpoint"], primary: "ai-engine/generate-api" },
      "documentation": { keywords: ["ডক", "doc", "documentation"], primary: "ai-engine/generate-docs" },
    },
  },

  example_workflows: {
    "সম্পূর্ণ মোবাইল অ্যাপ": ["POST ai-engine/full-stack-build → { description, build_type: 'apk', hf_space_url }"],
    "ওয়েব সফটওয়্যার তৈরি": ["POST ai-engine/auto-build → { description }"],
    "কোড ফিক্স ও অপ্টিমাইজ": ["POST sandbox/auto-test-fix → { code }", "POST sandbox/optimize → { code }"],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";

    // === Health (no auth, no DB required) ===
    if (action === "health") {
      let dbStatus = "not_configured";
      let storageStatus = "not_configured";
      const supabase = tryGetSupabase();
      if (supabase) {
        try {
          const { error } = await supabase.from("projects").select("id").limit(1);
          dbStatus = error ? `error: ${error.message}` : "connected";
          const { error: se } = await supabase.storage.from("project-files").list("", { limit: 1 });
          storageStatus = se ? `error: ${se.message}` : "connected";
        } catch { dbStatus = "error"; storageStatus = "error"; }
      }

      return jsonResponse({
        status: dbStatus === "connected" ? "online" : dbStatus === "not_configured" ? "degraded_no_db" : "degraded",
        service: CAPABILITY_MAP.service,
        version: CAPABILITY_MAP.version,
        database: dbStatus,
        storage: storageStatus,
        ai_gateway: Deno.env.get("LOVABLE_API_KEY") ? "configured" : "missing",
        master_secret: Deno.env.get("MASTER_SECRET") ? "configured" : "missing",
        total_endpoints: Object.keys(CAPABILITY_MAP.endpoints).length,
        ai_only_mode: dbStatus !== "connected",
        timestamp: new Date().toISOString(),
      });
    }

    // === Capabilities (no auth) ===
    if (action === "capabilities") return jsonResponse(CAPABILITY_MAP);

    // === Frontend AI Guide (no auth) ===
    if (action === "frontend-ai-guide") {
      return jsonResponse({
        guide: {
          title: "TIVO DEV AGENT — ফ্রন্টেন্ড AI ইন্টিগ্রেশন গাইড v6.0",
          version: "6.0.0",

          setup: {
            step_1: "Vercel Environment Variables সেট করো: NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_MASTER_SECRET, NEXT_PUBLIC_HF_SPACE_URL",
            step_2: "প্রতিটি API কলে headers-এ x-master-secret যোগ করো",
            step_3: "প্রথমে /backend-api/health কল করো সব ঠিক আছে কিনা দেখতে",
            step_4: "/backend-api/capabilities কল করো সব ক্ষমতা জানতে",
          },

          credential_guide: CAPABILITY_MAP.credential_config,

          how_ai_should_work: {
            principle: "AI স্বাধীনভাবে কাজ করবে — কোনো লিমিট নেই",
            flow: [
              "ইউজার কিছু চাইলে → /backend-api/suggest কল করো task বুঝতে",
              "suggest যা বলবে সেই endpoint কল করো",
              "সফটওয়্যার বানাতে → ai-engine/auto-build বা full-stack-build",
              "APK/EXE বানাতে → ai-engine/build-native বা full-stack-build (hf_space_url দরকার)",
              "রেজাল্ট পেলে ইউজারকে download_url বা public_url দিয়ে দাও",
            ],
            graceful_mode: "DB কানেক্ট না থাকলেও AI-only endpoints (generate, chat, fix, review, etc.) কাজ করবে",
          },

          api_call_pattern: {
            base_url: "NEXT_PUBLIC_BACKEND_URL/functions/v1/{function_name}/{action}",
            headers: { "Content-Type": "application/json", "x-master-secret": "NEXT_PUBLIC_MASTER_SECRET" },
          },

          what_ai_must_learn: [
            "1. /backend-api/capabilities — সব ক্ষমতা জানবে",
            "2. /backend-api/suggest — কোন endpoint কখন ব্যবহার করবে",
            "3. ai-engine/auto-build — সম্পূর্ণ সফটওয়্যার তৈরি",
            "4. ai-engine/full-stack-build — ওয়েব + নেটিভ (APK/EXE)",
            "5. ai-engine/build-native — বিদ্যমান প্রজেক্টকে APK/EXE",
            "6. project-manager/download — ZIP বান্ডেল ডাউনলোড",
            "7. sandbox/auto-test-fix — বাগ ফিক্স লুপ (৭ পাস পর্যন্ত)",
            "8. sandbox/visual-audit — UI পারফেক্ট করে",
          ],
        },
      });
    }

    // === Smart Suggest (no auth) ===
    if (action === "suggest" && req.method === "POST") {
      const suggestBody = await req.json().catch(() => ({}));
      const task = suggestBody.task || "";
      if (!task) return jsonResponse({ error: "task required" }, 400);

      const taskLower = task.toLowerCase();
      const matches: any[] = [];

      for (const [intentKey, intent] of Object.entries(CAPABILITY_MAP.smart_routing.intents) as any[]) {
        const score = intent.keywords.reduce((s: number, kw: string) => s + (taskLower.includes(kw.toLowerCase()) ? 1 : 0), 0);
        if (score > 0) matches.push({ intent: intentKey, score, ...intent });
      }
      matches.sort((a: any, b: any) => b.score - a.score);

      if (matches.length === 0) {
        return jsonResponse({
          suggested_endpoints: [{ endpoint: "ai-engine/chat", reason: "জেনারেল AI চ্যাট" }],
          workflow_steps: ["POST ai-engine/chat → { messages: [{role:'user', content:'টাস্ক'}] }"],
        });
      }

      const best = matches[0];
      return jsonResponse({
        suggested_endpoints: matches.slice(0, 3).map((m: any) => ({
          endpoint: m.primary,
          alternative: m.alternative || null,
          intent: m.intent,
          confidence: Math.round((m.score / m.keywords.length) * 100),
        })),
        workflow_steps: best.workflow || [],
        explanation: `"${task}" → সেরা endpoint: ${best.primary}`,
      });
    }

    // === Auth required from here ===
    const MASTER_SECRET = Deno.env.get("MASTER_SECRET");
    const providedSecret = req.headers.get("x-master-secret");
    if (!MASTER_SECRET || providedSecret !== MASTER_SECRET) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = tryGetSupabase();
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    if (action === "logs" && req.method === "GET") {
      if (!supabase) return jsonResponse({ error: "Database not configured", logs: [] }, 503);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const actionFilter = url.searchParams.get("action");
      let query = supabase.from("memory_logs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (actionFilter) query = query.eq("action", actionFilter);
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ logs: data });
    }

    if (action === "log" && req.method === "POST") {
      if (!supabase) return jsonResponse({ error: "Database not configured" }, 503);
      await supabase.from("memory_logs").insert({ user_id: body.user_id || null, action: body.action || "custom", details: body.details || {} });
      return jsonResponse({ success: true });
    }

    if (action === "stats") {
      if (!supabase) return jsonResponse({ error: "Database not configured", stats: { total_projects: 0, live_projects: 0, total_logs: 0 } }, 503);
      const [projects, logs, liveProjects] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("memory_logs").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("build_status", "live"),
      ]);
      return jsonResponse({ total_projects: projects.count || 0, live_projects: liveProjects.count || 0, total_logs: logs.count || 0 });
    }

    if (action === "check-connection") {
      const checks: any = {};
      if (supabase) {
        const { error: dbErr } = await supabase.from("projects").select("id").limit(1);
        checks.database = dbErr ? { status: "error", message: dbErr.message } : { status: "ok" };
        const { error: stErr } = await supabase.storage.from("project-files").list("", { limit: 1 });
        checks.storage = stErr ? { status: "error", message: stErr.message } : { status: "ok" };
      } else {
        checks.database = { status: "not_configured" };
        checks.storage = { status: "not_configured" };
      }
      checks.ai_gateway = Deno.env.get("LOVABLE_API_KEY") ? { status: "ok" } : { status: "missing" };
      checks.master_secret = { status: "ok" };
      return jsonResponse({ status: Object.values(checks).every((c: any) => c.status === "ok") ? "all_systems_operational" : "partial", checks });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  } catch (e) {
    console.error("Backend API error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
