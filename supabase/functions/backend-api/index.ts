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

// === Multi-tenant + Custom DB resolution ===
// Supports MASTER_SECRET, MASTER_SECRET_2, MASTER_SECRET_3, ... MASTER_SECRET_N
// Each secret = isolated tenant. Tenant ID is the secret slot name.
function resolveTenant(providedSecret: string | null): { tenantId: string } | null {
  if (!providedSecret) return null;
  if (providedSecret === Deno.env.get("MASTER_SECRET")) return { tenantId: "tenant_main" };
  for (let i = 2; i <= 50; i++) {
    const v = Deno.env.get(`MASTER_SECRET_${i}`);
    if (v && providedSecret === v) return { tenantId: `tenant_${i}` };
  }
  // Super admin sees ALL tenants (used for the super admin workspace)
  const sa = Deno.env.get("SUPER_ADMIN_MASTER_SECRET");
  if (sa && providedSecret === sa) return { tenantId: "super_admin" };
  return null;
}

// SSRF guard: only allow https://<sub>.supabase.co URLs (or known custom self-hosted via env allowlist)
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i;
export function isSafeSupabaseUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return false;
    return SUPABASE_URL_RE.test(`${parsed.protocol}//${parsed.host}`);
  } catch { return false; }
}

function getActiveSupabase(req: Request) {
  // Per-request override via headers — only honored when an explicit allowlist env var permits it
  const allowOverride = Deno.env.get("ALLOW_PER_REQUEST_DB_OVERRIDE") === "true";
  if (allowOverride) {
    const ovrUrl = req.headers.get("x-custom-supabase-url");
    const ovrKey = req.headers.get("x-custom-supabase-service-key");
    if (ovrUrl && ovrKey && isSafeSupabaseUrl(ovrUrl)) return createClient(ovrUrl, ovrKey);
  }
  // Env-level custom DB override (operator-controlled, trusted)
  const customUrl = Deno.env.get("CUSTOM_SUPABASE_URL");
  const customKey = Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY");
  if (customUrl && customKey && isSafeSupabaseUrl(customUrl)) return createClient(customUrl, customKey);
  // Default Lovable Cloud DB
  return tryGetSupabase();
}

function tryGetSupabase() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

// Schema SQL for auto-setup on custom DB (multi-tenant ready)
const TENANT_SCHEMA_SQL = `
-- TIVO DEV AGENT v8.0 — Multi-tenant Schema (idempotent)
CREATE TABLE IF NOT EXISTS public.tenant_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  files jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'active',
  build_status text DEFAULT 'pending',
  public_url text DEFAULT '',
  installer_url text DEFAULT '',
  build_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_projects_tenant ON public.tenant_projects(tenant_id);

CREATE TABLE IF NOT EXISTS public.tenant_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_logs_tenant ON public.tenant_logs(tenant_id);

CREATE TABLE IF NOT EXISTS public.tenant_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid,
  path text NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_files_tenant ON public.tenant_files(tenant_id);

ALTER TABLE public.tenant_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_files ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS; tenant isolation enforced in app code via tenant_id filter
`;

// === COMPLETE CAPABILITY MAP v6.0 ===
const CAPABILITY_MAP = {
  service: "TIVO DEV AGENT BACKEND — Autonomous Software Factory",
  version: "8.0.0",
  description: "Multi-tenant headless backend engine. Each MASTER_SECRET = isolated tenant. Supports custom Supabase DB override + HF Inference AI fallback.",

  multi_tenant: {
    enabled: true,
    how_it_works: "MASTER_SECRET (tenant_main), MASTER_SECRET_2 (tenant_2), MASTER_SECRET_3 (tenant_3) ... MASTER_SECRET_50. যে ফ্রন্টেন্ড যে secret পাঠাবে সে শুধু সেই tenant_id-এর ডাটা দেখবে।",
    add_tenant: "Supabase Edge Function Secret-এ MASTER_SECRET_2, MASTER_SECRET_3 ইত্যাদি অ্যাড করো — প্রতিটি ভিন্ন ভ্যালু",
    isolation: "ডাটাবেইজে প্রতিটি row-তে tenant_id বসে; query-তে অটো ফিল্টার হয়; এক tenant অন্যের ডাটা দেখতে পারে না",
    check_endpoint: "GET /backend-api/tenant-info — তোমার tenant_id ও মোট কতজন কনফিগার্ড আছে",
  },

  custom_database: {
    enabled: true,
    how_it_works: "ইউজার নিজের Supabase কানেক্ট করতে চাইলে edge function secret-এ CUSTOM_SUPABASE_URL + CUSTOM_SUPABASE_SERVICE_ROLE_KEY সেট করো",
    auto_setup: "POST /backend-api/setup-custom-db {migrate_data: true} → স্কিমা অটো অ্যাপ্লাই + পুরোনো ডাটা মাইগ্রেট",
    per_request_override: "headers-এ x-custom-supabase-url ও x-custom-supabase-service-key পাঠালে শুধু সেই request-এ override হবে",
    fallback_sql: "exec_sql RPC না থাকলে API SQL ফেরত দেবে — manual SQL editor-এ পেস্ট করতে হবে",
  },

  ai_fallback: {
    primary: "Lovable AI Gateway (LOVABLE_API_KEY)",
    fallback: "HF Inference Router — set HF_INFERENCE_TOKEN secret",
    auto_failover: "Lovable rate-limit / 402 / 5xx হলে অটো HF-এ fallback (text-only, non-stream)",
    default_hf_model: "Qwen/Qwen2.5-Coder-32B-Instruct (overridable via HF_DEFAULT_MODEL)",
  },

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
    "backend-api/tenant-info": { method: "GET", category: "system", auth_required: true, description: "🔐 তোমার tenant_id ও মোট tenant সংখ্যা" },
    "backend-api/setup-custom-db": { method: "POST", category: "system", auth_required: true, description: "🗄️ কাস্টম Supabase DB-তে স্কিমা অটো-অ্যাপ্লাই + ডাটা মাইগ্রেট", body: { supabase_url: "string?", service_role_key: "string?", migrate_data: "boolean?" } },
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
          title: "TIVO DEV AGENT — ফ্রন্টেন্ড AI ইন্টিগ্রেশন গাইড v8.0 (Multi-Tenant)",
          version: "8.0.0",
          multi_tenant_note: "এই ব্যাকেন্ড multi-tenant। তুমি যে x-master-secret পাঠাচ্ছ সেটাই তোমার tenant_id ঠিক করে। অন্য tenant-এর ডাটা তুমি কখনো দেখবে না।",
          custom_db_note: "ইউজার নিজের Supabase কানেক্ট করতে চাইলে: HF/Supabase secret-এ CUSTOM_SUPABASE_URL ও CUSTOM_SUPABASE_SERVICE_ROLE_KEY দাও, তারপর POST /backend-api/setup-custom-db {migrate_data:true} কল করো।",
          ai_fallback_note: "Lovable AI fail করলে অটো HF Inference-এ fallback হবে যদি HF_INFERENCE_TOKEN সেট থাকে।",
          must_call_first: ["GET /backend-api/health", "GET /backend-api/capabilities (memory-তে save করো)", "GET /backend-api/tenant-info"],

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

    // === Super Admin verify (no auth header — uses body credentials) ===
    if (action === "super-admin-verify" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const adminEmail = (Deno.env.get("SUPER_ADMIN_MASTER_EMAIL") || "").trim().toLowerCase();
      const adminSecret = Deno.env.get("SUPER_ADMIN_MASTER_SECRET") || "";
      if (!adminEmail || !adminSecret) {
        return jsonResponse({ ok: false, error: "Super admin not configured on backend (set SUPER_ADMIN_MASTER_EMAIL and SUPER_ADMIN_MASTER_SECRET secrets)" }, 503);
      }
      const email = (b.email || "").trim().toLowerCase();
      if (b.method === "google") {
        if (email && email === adminEmail) return jsonResponse({ ok: true, master_secret: adminSecret, role: "super_admin", email });
        return jsonResponse({ ok: false, error: "Email not authorized as super admin" }, 403);
      }
      if (b.method === "secret") {
        if (email === adminEmail && b.secret === adminSecret) return jsonResponse({ ok: true, master_secret: adminSecret, role: "super_admin", email });
        return jsonResponse({ ok: false, error: "Invalid email or secret" }, 401);
      }
      return jsonResponse({ ok: false, error: "method must be 'google' or 'secret'" }, 400);
    }

    // === Auth required from here (Multi-tenant) ===
    const providedSecret = req.headers.get("x-master-secret");
    const tenant = resolveTenant(providedSecret);
    if (!tenant) return jsonResponse({ error: "Unauthorized — invalid master secret" }, 401);

    const supabase = getActiveSupabase(req);
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // === Tenant Info ===
    if (action === "tenant-info") {
      const usingCustomDb = !!(Deno.env.get("CUSTOM_SUPABASE_URL") && Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY"));
      // Count configured tenants
      let tenantCount = Deno.env.get("MASTER_SECRET") ? 1 : 0;
      for (let i = 2; i <= 50; i++) if (Deno.env.get(`MASTER_SECRET_${i}`)) tenantCount++;
      return jsonResponse({
        your_tenant_id: tenant.tenantId,
        total_tenants_configured: tenantCount,
        custom_database: usingCustomDb,
        database_active: !!supabase,
        isolation: "প্রতিটি tenant_id অনুযায়ী ডাটা সম্পূর্ণ আলাদা — অন্য tenant দেখতে পারবে না",
      });
    }

    // === Setup Custom DB Schema (auto-migrate) ===
    if (action === "setup-custom-db" && req.method === "POST") {
      const targetUrl = body.supabase_url || Deno.env.get("CUSTOM_SUPABASE_URL");
      const targetKey = body.service_role_key || Deno.env.get("CUSTOM_SUPABASE_SERVICE_ROLE_KEY");
      if (!targetUrl || !targetKey) {
        return jsonResponse({
          error: "Custom DB credentials missing",
          hint: "Either send {supabase_url, service_role_key} in body, or set CUSTOM_SUPABASE_URL & CUSTOM_SUPABASE_SERVICE_ROLE_KEY env secrets",
        }, 400);
      }
      // Run schema via PostgREST RPC OR direct postgres? Use sql via supabase-js raw? Not available.
      // Use Supabase Meta API: POST /pg-meta/default/query — only on hosted Supabase requires service_role
      try {
        const sqlEndpoint = `${targetUrl.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`;
        // Try exec_sql RPC first; if not present, return SQL for manual run
        const r = await fetch(sqlEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": targetKey, "Authorization": `Bearer ${targetKey}` },
          body: JSON.stringify({ sql: TENANT_SCHEMA_SQL }),
        });
        if (r.ok) {
          // Optionally migrate existing data
          if (body.migrate_data) {
            const src = tryGetSupabase();
            if (src) {
              const { data: projs } = await src.from("projects").select("*").limit(1000);
              if (projs?.length) {
                const dest = createClient(targetUrl, targetKey);
                const rows = projs.map((p: any) => ({
                  tenant_id: tenant.tenantId,
                  name: p.name, description: p.description,
                  files: p.files, status: p.status,
                  build_status: p.build_status, public_url: p.public_url,
                  installer_url: p.installer_url, build_metadata: p.build_metadata,
                }));
                await dest.from("tenant_projects").insert(rows);
              }
            }
          }
          return jsonResponse({ success: true, schema_applied: true, tenant_id: tenant.tenantId });
        }
        // Fallback: return SQL to run manually
        return jsonResponse({
          success: false,
          auto_apply_failed: true,
          hint: "exec_sql RPC unavailable on target DB. Run the SQL below manually in Supabase SQL Editor.",
          sql_to_run: TENANT_SCHEMA_SQL,
        });
      } catch (e) {
        return jsonResponse({
          success: false,
          error: e instanceof Error ? e.message : String(e),
          sql_to_run: TENANT_SCHEMA_SQL,
        }, 500);
      }
    }

    if (action === "logs" && req.method === "GET") {
      if (!supabase) return jsonResponse({ error: "Database not configured", logs: [] }, 503);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const actionFilter = url.searchParams.get("action");
      // Filter by tenant_id stored in details JSONB
      let query = supabase.from("memory_logs").select("*").order("created_at", { ascending: false }).limit(limit)
        .eq("details->>tenant_id", tenant.tenantId);
      if (actionFilter) query = query.eq("action", actionFilter);
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ logs: data, tenant_id: tenant.tenantId });
    }

    if (action === "log" && req.method === "POST") {
      if (!supabase) return jsonResponse({ error: "Database not configured" }, 503);
      const details = { ...(body.details || {}), tenant_id: tenant.tenantId };
      await supabase.from("memory_logs").insert({ user_id: body.user_id || null, action: body.action || "custom", details });
      return jsonResponse({ success: true, tenant_id: tenant.tenantId });
    }

    if (action === "stats") {
      if (!supabase) return jsonResponse({ error: "Database not configured", stats: { total_projects: 0, live_projects: 0, total_logs: 0 } }, 503);
      const isSuperAdmin = tenant.tenantId === "super_admin";
      const tFilter = (q: any) => isSuperAdmin ? q : q.eq("tenant_id", tenant.tenantId);
      const [projects, logs, liveProjects] = await Promise.all([
        tFilter(supabase.from("projects").select("id", { count: "exact", head: true })),
        tFilter(supabase.from("memory_logs").select("id", { count: "exact", head: true })),
        tFilter(supabase.from("projects").select("id", { count: "exact", head: true })).eq("build_status", "live"),
      ]);
      return jsonResponse({ total_projects: projects.count || 0, live_projects: liveProjects.count || 0, total_logs: logs.count || 0, tenant_id: tenant.tenantId });
    }

    // === Tenant Projects (with kill switch support) ===
    if (action === "tenant-projects" && req.method === "GET") {
      if (!supabase) return jsonResponse({ error: "Database not configured", projects: [] }, 503);
      const isSuperAdmin = tenant.tenantId === "super_admin";
      let q = supabase.from("projects")
        .select("id,name,description,build_status,public_url,installer_url,tenant_id,updated_at,created_at")
        .order("updated_at", { ascending: false }).limit(200);
      if (!isSuperAdmin) q = q.eq("tenant_id", tenant.tenantId);
      const { data, error } = await q;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ projects: data || [], tenant_id: tenant.tenantId, super_admin: isSuperAdmin });
    }

    // === Kill switch — pause/resume/stop a project's build ===
    if (action === "kill-switch" && req.method === "POST") {
      if (!supabase) return jsonResponse({ error: "Database not configured" }, 503);
      const { project_id, status } = body as { project_id?: string; status?: string };
      if (!project_id || !status) return jsonResponse({ error: "project_id and status required" }, 400);
      const allowed = ["paused", "stopped", "active", "pending"];
      if (!allowed.includes(status)) return jsonResponse({ error: `status must be one of ${allowed.join(", ")}` }, 400);
      const isSuperAdmin = tenant.tenantId === "super_admin";
      // ownership check
      let owner = supabase.from("projects").select("id,tenant_id").eq("id", project_id);
      if (!isSuperAdmin) owner = owner.eq("tenant_id", tenant.tenantId);
      const { data: row, error: oe } = await owner.maybeSingle();
      if (oe || !row) return jsonResponse({ error: "Project not found or not yours" }, 404);
      const { error: ue } = await supabase.from("projects").update({ build_status: status, updated_at: new Date().toISOString() }).eq("id", project_id);
      if (ue) return jsonResponse({ error: ue.message }, 500);
      await supabase.from("memory_logs").insert({
        action: "kill_switch",
        details: { tenant_id: tenant.tenantId, project_id, new_status: status },
      });
      return jsonResponse({ success: true, project_id, status });
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
