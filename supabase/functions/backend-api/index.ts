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
  if (!url || !key) throw new Error("CONNECTION_ERROR: Missing credentials");
  return createClient(url, key);
}

// === COMPLETE CAPABILITY MAP v5.0 ===
const CAPABILITY_MAP = {
  service: "TIVO DEV AGENT BACKEND — Autonomous Software Factory",
  version: "5.0.0",
  description: "A headless backend engine for autonomous software generation, testing, auditing, native app building, and delivery. Controlled entirely via API with MASTER_SECRET authentication.",

  auth: {
    method: "x-master-secret header",
    description: "Every request (except /health, /capabilities, /suggest, /frontend-ai-guide) requires the x-master-secret header.",
  },

  endpoints: {
    // === AI ENGINE ===
    "ai-engine/generate": {
      method: "POST", category: "code",
      description: "AI কোড জেনারেশন — যেকোনো ভাষা ও ফ্রেমওয়ার্কে কোড তৈরি",
      when_to_use: "একটি নির্দিষ্ট কোড ফাইল বা ফাংশন তৈরি করতে",
      body: { prompt: "string (required)", language: "string?", framework: "string?", context: "string?", model: "string?", stream: "boolean?" },
      returns: "{ success, code }",
    },
    "ai-engine/generate-project": {
      method: "POST", category: "project",
      description: "মাল্টি-ফাইল প্রজেক্ট জেনারেশন — সম্পূর্ণ প্রজেক্ট",
      when_to_use: "শূন্য থেকে নতুন প্রজেক্ট তৈরি করতে",
      body: { description: "string (required)", framework: "string?", features: "string[]?", tech_stack: "string?", model: "string?" },
      returns: "{ success, project }",
    },
    "ai-engine/review": {
      method: "POST", category: "quality",
      description: "কোড রিভিউ — সিকিউরিটি, পারফরম্যান্স, বেস্ট প্র্যাকটিস",
      when_to_use: "বিদ্যমান কোডের মান যাচাই করতে",
      body: { code: "string (required)", language: "string?", focus: "string?" },
      returns: "{ success, review }",
    },
    "ai-engine/fix": {
      method: "POST", category: "quality",
      description: "বাগ ফিক্সিং — এরর এনালাইসিস ও সম্পূর্ণ ফিক্সড কোড",
      when_to_use: "কোডে এরর ফিক্স করতে",
      body: { code: "string (required)", error_message: "string?", language: "string?" },
      returns: "{ success, fix }",
    },
    "ai-engine/chat": {
      method: "POST", category: "general",
      description: "জেনারেল AI চ্যাট — স্ট্রিমিং সাপোর্ট সহ",
      when_to_use: "ইউজারের সাথে কথোপকথন বা প্রশ্নের উত্তর দিতে",
      body: { messages: "array (required)", system_prompt: "string?", model: "string?", stream: "boolean?" },
      returns: "{ success, response } or SSE stream",
    },
    "ai-engine/auto-build": {
      method: "POST", category: "factory",
      description: "🏭 অটোনমাস বিল্ড — জেনারেশন → অডিট → ৫ পাস ফিক্স → ভিজ্যুয়াল অডিট → ডিপ্লয়",
      when_to_use: "সম্পূর্ণ প্রজেক্ট স্বয়ংক্রিয়ভাবে বানাতে — সবচেয়ে শক্তিশালী",
      body: { description: "string", project_id: "string?", framework: "string?", features: "string[]?", user_id: "string?", quality_target: "number? (default 90)" },
      returns: "{ success, project_id, audit_score, steps[], download_url, public_url }",
    },
    "ai-engine/build-native": {
      method: "POST", category: "native_build",
      description: "📱🖥️ নেটিভ বিল্ড — HF Space এ APK/EXE বিল্ড অর্কেস্ট্রেট করে",
      when_to_use: "বিদ্যমান প্রজেক্টকে APK বা EXE ফাইলে রূপান্তর করতে",
      body: { project_id: "string (required)", build_type: "'apk' | 'exe' (required)", hf_space_url: "string (required)", app_name: "string?", package_name: "string?" },
      returns: "{ success, build_type, build_id, download_url, pipeline }",
    },
    "ai-engine/full-stack-build": {
      method: "POST", category: "factory",
      description: "🚀 ফুল-স্ট্যাক বিল্ড — ওয়েব প্রজেক্ট তৈরি + নেটিভ APK/EXE বিল্ড একসাথে",
      when_to_use: "ওয়েব অ্যাপ + নেটিভ অ্যাপ একসাথে বানাতে — সবচেয়ে কমপ্লিট",
      body: { description: "string (required)", framework: "string?", features: "string[]?", user_id: "string?", build_type: "'apk'|'exe'?", hf_space_url: "string?", app_name: "string?", package_name: "string?" },
      returns: "{ success, project_id, web_url, web_download_url, native_download_url }",
    },
    "ai-engine/refactor": {
      method: "POST", category: "code",
      description: "কোড রিফ্যাক্টরিং — DRY, SOLID, ক্লিন কোড",
      when_to_use: "বিদ্যমান কোডকে আরো পরিষ্কার ও মেইনটেইনেবল করতে",
      body: { code: "string (required)", language: "string?", goal: "string?" },
      returns: "{ success, refactored }",
    },
    "ai-engine/convert": {
      method: "POST", category: "code",
      description: "কোড কনভার্ট/মাইগ্রেট — এক ভাষা থেকে আরেক ভাষায়",
      when_to_use: "Python→JavaScript, React→Vue ইত্যাদি কনভার্ট করতে",
      body: { code: "string (required)", from_language: "string?", to_language: "string?", from_framework: "string?", to_framework: "string?" },
      returns: "{ success, converted }",
    },
    "ai-engine/generate-api": {
      method: "POST", category: "code",
      description: "REST API জেনারেশন — routes, controllers, middleware সহ",
      when_to_use: "সম্পূর্ণ API ব্যাকেন্ড তৈরি করতে",
      body: { description: "string (required)", endpoints: "array?", database_schema: "object?", auth_type: "string?" },
      returns: "{ success, api }",
    },
    "ai-engine/generate-docs": {
      method: "POST", category: "code",
      description: "ডকুমেন্টেশন জেনারেশন — কোড থেকে Markdown ডক তৈরি",
      when_to_use: "প্রজেক্টের ডকুমেন্টেশন তৈরি করতে",
      body: { code: "string?", project_id: "string?", doc_type: "string?" },
      returns: "{ success, documentation }",
    },

    // === PROJECT MANAGER ===
    "project-manager/create": {
      method: "POST", category: "project",
      description: "নতুন প্রজেক্ট তৈরি",
      body: { name: "string (required)", description: "string?", user_id: "string?", files: "array?", repo_url: "string?" },
      returns: "{ success, project }",
    },
    "project-manager/list": { method: "GET", category: "project", description: "সব প্রজেক্ট দেখাও", params: "?user_id=string&status=string", returns: "{ projects[] }" },
    "project-manager/get": { method: "GET", category: "project", description: "প্রজেক্ট বিস্তারিত", params: "?id=string (required)", returns: "{ project }" },
    "project-manager/update": { method: "PUT", category: "project", description: "প্রজেক্ট আপডেট", body: { id: "string (required)" }, returns: "{ success }" },
    "project-manager/delete": { method: "DELETE", category: "project", description: "প্রজেক্ট মুছো", body: { id: "string (required)" }, returns: "{ success }" },
    "project-manager/upload-files": { method: "POST", category: "project", description: "ফাইল আপলোড", body: { project_id: "string (required)", files: "[{path, content}]" }, returns: "{ success, uploads[] }" },
    "project-manager/publish": { method: "POST", category: "deploy", description: "প্রজেক্ট পাবলিশ করো", body: { project_id: "string (required)" }, returns: "{ success, public_url, installer_url }" },
    "project-manager/download": { method: "GET", category: "deploy", description: "Ready-to-Run বান্ডেল ডাউনলোড", params: "?id=string (required)", returns: "{ success, bundle }" },
    "project-manager/versions": { method: "GET", category: "project", description: "ভার্সন হিস্ট্রি", params: "?id=string (required)", returns: "{ versions[] }" },
    "project-manager/public-url": { method: "GET", category: "deploy", description: "পাবলিক URL দেখাও", params: "?id=string (required)", returns: "{ public_url }" },

    // === SANDBOX ===
    "sandbox/validate": { method: "POST", category: "quality", description: "কোড ভ্যালিডেশন", body: { code: "string (required)", language: "string?" }, returns: "{ success, validation }" },
    "sandbox/generate-tests": { method: "POST", category: "quality", description: "টেস্ট জেনারেশন", body: { code: "string (required)" }, returns: "{ success, tests }" },
    "sandbox/audit": { method: "POST", category: "quality", description: "প্রজেক্ট অডিট", body: { files: "array?", project_id: "string?" }, returns: "{ success, audit }" },
    "sandbox/optimize": { method: "POST", category: "quality", description: "কোড অপ্টিমাইজ", body: { code: "string (required)" }, returns: "{ success, optimized }" },
    "sandbox/visual-audit": { method: "POST", category: "quality", description: "👁️ ভিজ্যুয়াল অডিট", body: { files: "array?", project_id: "string?" }, returns: "{ success, passes[], fixed_files[] }" },
    "sandbox/auto-test-fix": { method: "POST", category: "quality", description: "🔄 ইটারেটিভ বাগ ফিক্স", body: { code: "string?", project_id: "string?", max_iterations: "number?" }, returns: "{ success, fixed_code, iterations[] }" },
    "sandbox/factory": { method: "POST", category: "factory", description: "🏗️ ফ্যাক্টরি পাইপলাইন", body: { description: "string (required)", framework: "string?" }, returns: "{ success, project_id, pipeline[] }" },
    "sandbox/execute": { method: "POST", category: "general", description: "কাস্টম কমান্ড", body: { command: "string (required)" }, returns: "{ success, result }" },

    // === SYSTEM ===
    "backend-api/health": { method: "GET", category: "system", auth_required: false, description: "সিস্টেম হেলথ চেক" },
    "backend-api/capabilities": { method: "GET", category: "system", auth_required: false, description: "📋 ক্ষমতার তালিকা" },
    "backend-api/suggest": { method: "POST", category: "system", auth_required: false, description: "🧠 স্মার্ট সাজেশন", body: { task: "string (required)" } },
    "backend-api/frontend-ai-guide": { method: "GET", category: "system", auth_required: false, description: "📖 ফ্রন্টেন্ড AI-এর জন্য সম্পূর্ণ ইন্টিগ্রেশন গাইড" },
    "backend-api/stats": { method: "GET", category: "system", description: "পরিসংখ্যান" },
    "backend-api/logs": { method: "GET", category: "system", description: "মেমোরি লগ" },
    "backend-api/log": { method: "POST", category: "system", description: "লগ তৈরি" },
    "backend-api/check-connection": { method: "POST", category: "system", description: "কানেকশন টেস্ট" },
  },

  hf_build_engine: {
    description: "HF Space-এ চলমান Docker-based Build Engine — APK ও EXE বিল্ড করে",
    note: "সরাসরি HF Space URL-এ কল করো, অথবা ai-engine/build-native দিয়ে অর্কেস্ট্রেট করো",
    endpoints: {
      "/api/health": { method: "GET", description: "Build Engine হেলথ চেক" },
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
        workflow: [
          "ai-engine/full-stack-build → ওয়েব + নেটিভ একসাথে বানাও",
          "অথবা: ai-engine/auto-build → ওয়েব তৈরি, তারপর ai-engine/build-native → APK/EXE বানাও",
        ],
      },
      "fix_code": {
        keywords: ["ফিক্স", "এরর", "বাগ", "fix", "error", "bug", "কাজ করছে না"],
        primary: "ai-engine/fix",
        alternative: "sandbox/auto-test-fix",
      },
      "review_quality": {
        keywords: ["রিভিউ", "চেক", "review", "audit", "quality"],
        primary: "ai-engine/review",
        alternative: "sandbox/audit",
      },
      "generate_code": {
        keywords: ["কোড লিখো", "জেনারেট", "generate", "code", "function"],
        primary: "ai-engine/generate",
      },
      "test_code": {
        keywords: ["টেস্ট", "test", "validate", "ভ্যালিডেট"],
        primary: "sandbox/validate",
        alternative: "sandbox/generate-tests",
      },
      "ui_design": {
        keywords: ["UI", "ডিজাইন", "design", "layout", "responsive", "সুন্দর"],
        primary: "sandbox/visual-audit",
      },
      "manage_project": {
        keywords: ["প্রজেক্ট", "list", "তালিকা", "আপডেট", "মুছো", "delete"],
        primary: "project-manager/list",
      },
      "download_deploy": {
        keywords: ["ডাউনলোড", "download", "ডিপ্লয়", "deploy", "পাবলিশ", "publish"],
        primary: "project-manager/download",
        alternative: "project-manager/publish",
      },
      "refactor_convert": {
        keywords: ["রিফ্যাক্টর", "refactor", "কনভার্ট", "convert", "migrate"],
        primary: "ai-engine/refactor",
        alternative: "ai-engine/convert",
      },
      "api_backend": {
        keywords: ["API", "backend", "REST", "endpoint", "server"],
        primary: "ai-engine/generate-api",
      },
      "documentation": {
        keywords: ["ডক", "doc", "documentation", "README"],
        primary: "ai-engine/generate-docs",
      },
    },
  },

  example_workflows: {
    "সম্পূর্ণ মোবাইল অ্যাপ তৈরি": [
      "POST ai-engine/full-stack-build → { description, build_type: 'apk', hf_space_url: 'YOUR_HF_URL' }",
      "response থেকে native_download_url পাবে → ইউজারকে দাও",
    ],
    "সম্পূর্ণ ডেস্কটপ অ্যাপ তৈরি": [
      "POST ai-engine/full-stack-build → { description, build_type: 'exe', hf_space_url: 'YOUR_HF_URL' }",
      "response থেকে native_download_url পাবে → ইউজারকে দাও",
    ],
    "ওয়েব সফটওয়্যার তৈরি ও ডিপ্লয়": [
      "POST ai-engine/auto-build → { description: 'বর্ণনা' }",
      "response → project_id, download_url, public_url",
    ],
    "বিদ্যমান প্রজেক্টকে APK বানাও": [
      "POST ai-engine/build-native → { project_id, build_type: 'apk', hf_space_url }",
    ],
    "কোড ফিক্স ও অপ্টিমাইজ": [
      "POST sandbox/auto-test-fix → { code, max_iterations: 7 }",
      "POST sandbox/optimize → { code: fixed_code }",
    ],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";

    // === Health ===
    if (action === "health") {
      let dbStatus = "unknown", storageStatus = "unknown";
      try {
        const supabase = checkSupabaseConnection();
        const { error } = await supabase.from("projects").select("id").limit(1);
        dbStatus = error ? `error: ${error.message}` : "connected";
        const { error: se } = await supabase.storage.from("project-files").list("", { limit: 1 });
        storageStatus = se ? `error: ${se.message}` : "connected";
      } catch { dbStatus = "disconnected"; storageStatus = "disconnected"; }

      return jsonResponse({
        status: dbStatus === "connected" ? "online" : "degraded",
        service: CAPABILITY_MAP.service,
        version: CAPABILITY_MAP.version,
        database: dbStatus,
        storage: storageStatus,
        ai_gateway: Deno.env.get("LOVABLE_API_KEY") ? "configured" : "missing",
        master_secret: Deno.env.get("MASTER_SECRET") ? "configured" : "missing",
        total_endpoints: Object.keys(CAPABILITY_MAP.endpoints).length,
        timestamp: new Date().toISOString(),
      });
    }

    // === Capabilities ===
    if (action === "capabilities") return jsonResponse(CAPABILITY_MAP);

    // === Frontend AI Integration Guide ===
    if (action === "frontend-ai-guide") {
      return jsonResponse({
        guide: {
          title: "TIVO DEV AGENT — ফ্রন্টেন্ড AI ইন্টিগ্রেশন গাইড",
          version: "5.0.0",

          setup: {
            step_1: "Vercel Environment Variables সেট করো: NEXT_PUBLIC_BACKEND_URL = তোমার Supabase URL, NEXT_PUBLIC_MASTER_SECRET = তোমার Master Secret",
            step_2: "প্রতিটি API কলে headers-এ x-master-secret যোগ করো",
            step_3: "প্রথমে /backend-api/health কল করো সব ঠিক আছে কিনা দেখতে",
            step_4: "/backend-api/capabilities কল করো সব ক্ষমতা জানতে",
          },

          how_ai_should_work: {
            principle: "AI স্বাধীনভাবে কাজ করবে — কোনো লিমিট নেই",
            flow: [
              "ইউজার কিছু চাইলে → /backend-api/suggest কল করো task বুঝতে",
              "suggest যা বলবে সেই endpoint কল করো",
              "সফটওয়্যার বানাতে হলে → ai-engine/auto-build বা full-stack-build ব্যবহার করো",
              "APK/EXE বানাতে হলে → ai-engine/build-native বা full-stack-build ব্যবহার করো",
              "রেজাল্ট পেলে ইউজারকে download_url বা public_url দিয়ে দাও",
            ],
          },

          api_call_pattern: {
            base_url: "NEXT_PUBLIC_BACKEND_URL/functions/v1/{function_name}/{action}",
            headers: {
              "Content-Type": "application/json",
              "x-master-secret": "NEXT_PUBLIC_MASTER_SECRET",
            },
            example_fetch: `
const response = await fetch(\`\${BACKEND_URL}/functions/v1/ai-engine/auto-build\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-master-secret': MASTER_SECRET,
  },
  body: JSON.stringify({
    description: 'একটি e-commerce সাইট বানাও',
    framework: 'react',
    features: ['cart', 'checkout', 'product listing'],
  }),
});
const data = await response.json();
// data.download_url → ইউজারকে দাও
// data.public_url → ব্রাউজারে দেখাও
`,
          },

          what_ai_must_learn: [
            "1. /backend-api/capabilities — সব ক্ষমতা জানবে",
            "2. /backend-api/suggest — কোন endpoint কখন ব্যবহার করবে বুঝবে",
            "3. ai-engine/auto-build — সবচেয়ে শক্তিশালী, এটি দিয়ে সম্পূর্ণ সফটওয়্যার তৈরি হয়",
            "4. ai-engine/full-stack-build — ওয়েব + নেটিভ (APK/EXE) একসাথে",
            "5. ai-engine/build-native — বিদ্যমান প্রজেক্টকে APK/EXE বানায় (HF Space দরকার)",
            "6. project-manager/download — ZIP বান্ডেল ডাউনলোড (setup.sh + install.bat সহ)",
            "7. sandbox/auto-test-fix — বাগ ফিক্স লুপ (৭ পাস পর্যন্ত)",
            "8. sandbox/visual-audit — UI পারফেক্ট করে",
          ],

          power_moves: {
            "সফটওয়্যার ফ্যাক্টরি": "POST ai-engine/auto-build → একটি কলেই সম্পূর্ণ সফটওয়্যার",
            "মোবাইল অ্যাপ": "POST ai-engine/full-stack-build → { build_type: 'apk', hf_space_url: '...' }",
            "ডেস্কটপ অ্যাপ": "POST ai-engine/full-stack-build → { build_type: 'exe', hf_space_url: '...' }",
            "বাগ ফিক্স মেশিন": "POST sandbox/auto-test-fix → { code, max_iterations: 7 }",
            "কোড কনভার্ট": "POST ai-engine/convert → { code, from_language: 'python', to_language: 'javascript' }",
          },

          important_notes: [
            "HF Space URL ছাড়া APK/EXE বিল্ড হবে না — HF Space-এ Docker ইমেজ ডিপ্লয় করতে হবে",
            "auto-build ও full-stack-build ভারী কাজ — ৩০ সেকেন্ড থেকে ২ মিনিট সময় লাগতে পারে",
            "স্ট্রিমিং চাইলে ai-engine/chat বা ai-engine/generate-এ stream: true দাও",
            "সব প্রজেক্ট ডাটাবেইজে সেভ থাকে — হারানোর ভয় নেই",
          ],
        },
      });
    }

    // === Smart Suggest ===
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
          explanation: "তোমার টাস্ক নির্দিষ্ট ক্যাটাগরিতে পড়েনি — AI চ্যাট ব্যবহার করো।",
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

    let supabase: any;
    try { supabase = checkSupabaseConnection(); }
    catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Connection Error" }, 503); }

    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

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
      await supabase.from("memory_logs").insert({ user_id: body.user_id || null, action: body.action || "custom", details: body.details || {} });
      return jsonResponse({ success: true });
    }

    if (action === "stats") {
      const [projects, logs, liveProjects] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("memory_logs").select("id", { count: "exact", head: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("build_status", "live"),
      ]);
      return jsonResponse({ total_projects: projects.count || 0, live_projects: liveProjects.count || 0, total_logs: logs.count || 0 });
    }

    if (action === "check-connection") {
      const checks: any = {};
      const { error: dbErr } = await supabase.from("projects").select("id").limit(1);
      checks.database = dbErr ? { status: "error", message: dbErr.message } : { status: "ok" };
      const { error: stErr } = await supabase.storage.from("project-files").list("", { limit: 1 });
      checks.storage = stErr ? { status: "error", message: stErr.message } : { status: "ok" };
      checks.ai_gateway = Deno.env.get("LOVABLE_API_KEY") ? { status: "ok" } : { status: "missing" };
      return jsonResponse({ status: Object.values(checks).every((c: any) => c.status === "ok") ? "all_systems_operational" : "issues_detected", checks });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  } catch (e) {
    console.error("Backend API error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
