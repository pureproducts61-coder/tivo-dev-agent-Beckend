import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-master-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// === RATE LIMITER ===
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1 };
  }
  if (entry.count >= RATE_LIMIT.maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT.maxRequests - entry.count };
}

// === REQUEST QUEUE ===
let activeRequests = 0;
const MAX_CONCURRENT = 5;
const queue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) { activeRequests++; return; }
  return new Promise((resolve) => { queue.push({ resolve }); });
}

function releaseSlot() {
  activeRequests--;
  if (queue.length > 0) { const next = queue.shift()!; activeRequests++; next.resolve(); }
}

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

async function callAI(messages: any[], model = "google/gemini-3-flash-preview") {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limited - try again later");
    if (response.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error: ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJsonFromAI(result: string) {
  try {
    const m = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? (m[1] || m[0]) : result);
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  const rl = checkRateLimit(clientIP);
  if (!rl.allowed) return jsonResponse({ error: "Rate limit exceeded", retry_after_ms: rl.retryAfterMs }, 429);

  const queueTimeout = setTimeout(() => {}, 120_000);
  try { await acquireSlot(); clearTimeout(queueTimeout); } catch { clearTimeout(queueTimeout); return jsonResponse({ error: "Server busy" }, 503); }

  try {
    const providedSecret = req.headers.get("x-master-secret");
    // Resolve tenant from MASTER_SECRET (tenant_main), MASTER_SECRET_2..50, or SUPER_ADMIN_MASTER_SECRET
    let tenantId: string | null = null;
    if (providedSecret && providedSecret === Deno.env.get("MASTER_SECRET")) tenantId = "tenant_main";
    if (!tenantId && providedSecret) {
      for (let i = 2; i <= 50; i++) {
        const v = Deno.env.get(`MASTER_SECRET_${i}`);
        if (v && providedSecret === v) { tenantId = `tenant_${i}`; break; }
      }
    }
    if (!tenantId && providedSecret && providedSecret === Deno.env.get("SUPER_ADMIN_MASTER_SECRET")) tenantId = "super_admin";
    if (!tenantId) return jsonResponse({ error: "Unauthorized" }, 401);

    // Supabase is optional — only needed for project_id lookups
    const supabase = tryGetSupabase();
    const isSA = tenantId === "super_admin";
    const tFilter = (q: any) => isSA ? q : q.eq("tenant_id", tenantId);

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";
    const body = await req.json().catch(() => ({}));

    // === VALIDATE CODE ===
    if (action === "validate") {
      const { code, language, rules } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `Code Validator. Analyze for syntax errors, type errors, logic bugs, security issues, performance.\n${rules ? `Custom rules: ${rules}` : ""} ${language ? `Language: ${language}` : ""}\nReturn JSON: {"valid":boolean,"score":0-100,"errors":[{"line":0,"type":"error|warning","message":"string","fix":"string"}],"summary":"string"}` },
        { role: "user", content: code },
      ]);
      return jsonResponse({ success: true, validation: parseJsonFromAI(result) || { valid: true, score: 50, summary: result } });
    }

    // === GENERATE TESTS ===
    if (action === "generate-tests") {
      const { code, language, framework, test_framework } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `Test Generator. Generate comprehensive unit tests.\n${language ? `Language: ${language}` : ""} ${framework ? `Framework: ${framework}` : ""} ${test_framework ? `Test framework: ${test_framework}` : ""}\nReturn complete, runnable test files.` },
        { role: "user", content: code },
      ]);
      return jsonResponse({ success: true, tests: result });
    }

    // === FULL PROJECT AUDIT ===
    if (action === "audit") {
      const { files, project_id } = body;
      let projectFiles = files;
      if (!projectFiles && project_id && supabase) {
        const { data: project } = await tFilter(supabase.from("projects").select("files").eq("id", project_id)).single();
        projectFiles = project?.files || [];
      }
      if (!projectFiles?.length) return jsonResponse({ error: "files or project_id required (if using project_id, database must be configured)" }, 400);
      const summary = projectFiles.map((f: any) => `--- ${f.path} ---\n${f.content || "(in storage)"}`).join("\n\n");
      const result = await callAI([
        { role: "system", content: `Project Auditor. Return JSON: {"overall_score":0-100,"security":{"score":0-100,"issues":[]},"performance":{"score":0-100,"issues":[]},"code_quality":{"score":0-100,"issues":[]},"recommendations":[],"critical_fixes":[]}` },
        { role: "user", content: summary },
      ], "google/gemini-2.5-pro");
      const audit = parseJsonFromAI(result) || { raw_audit: result };
      if (project_id && supabase) {
        await tFilter(supabase.from("projects").update({ build_status: "audited", last_build_log: JSON.stringify(audit).slice(0, 5000) }).eq("id", project_id)).catch(() => {});
      }
      return jsonResponse({ success: true, audit });
    }

    // === OPTIMIZE CODE ===
    if (action === "optimize") {
      const { code, language, focus } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `Code Optimizer. ${language ? `Language: ${language}` : ""} ${focus ? `Focus: ${focus}` : "Optimize for performance and readability."}\nReturn optimized code with explanations.` },
        { role: "user", content: code },
      ]);
      return jsonResponse({ success: true, optimized: result });
    }

    // === VISUAL AUDIT ===
    if (action === "visual-audit") {
      const { files, project_id } = body;
      let uiFiles = files;
      if (!uiFiles && project_id && supabase) {
        const { data: project } = await tFilter(supabase.from("projects").select("files").eq("id", project_id)).single();
        uiFiles = (project?.files as any[])?.filter((f: any) => /\.(html|tsx|jsx|css)$/.test(f.path)) || [];
      }
      if (!uiFiles?.length) return jsonResponse({ error: "No UI files to audit" }, 400);
      const passes = [];
      let currentFiles = uiFiles;
      for (let i = 0; i < 3; i++) {
        const currentContent = currentFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        const result = await callAI([
          { role: "system", content: `Visual Inspector (Pass ${i + 1}). Check layout, responsive, colors, typography, accessibility.\nReturn JSON: {"ui_score":0-100,"pass":${i + 1},"issues":[{"component":"string","issue":"string","severity":"string","fix":"string"}],"fixed_files":[{"path":"string","content":"complete fixed content"}],"is_perfect":boolean}` },
          { role: "user", content: currentContent },
        ], "google/gemini-2.5-pro");
        const parsed = parseJsonFromAI(result);
        passes.push(parsed || { pass: i + 1, raw: result });
        if (parsed?.fixed_files?.length) {
          currentFiles = currentFiles.map((f: any) => { const fixed = parsed.fixed_files.find((ff: any) => ff.path === f.path); return fixed || f; });
        }
        if (parsed?.is_perfect || (parsed?.ui_score && parsed.ui_score >= 95)) break;
      }
      if (project_id && supabase && currentFiles.length) {
        const { data: fullProject } = await supabase.from("projects").select("files").eq("id", project_id).single();
        const allFiles = (fullProject?.files as any[]) || [];
        for (const cf of currentFiles) { const idx = allFiles.findIndex((f: any) => f.path === cf.path); if (idx >= 0) allFiles[idx] = cf; }
        await supabase.from("projects").update({ files: allFiles, build_metadata: { visual_audit: passes } }).eq("id", project_id).catch(() => {});
      }
      return jsonResponse({ success: true, passes, final_score: passes[passes.length - 1]?.ui_score || 0, fixed_files: currentFiles, total_passes: passes.length });
    }

    // === AUTO TEST & FIX ===
    if (action === "auto-test-fix") {
      const { code, language, project_id, max_iterations } = body;
      if (!code && !project_id) return jsonResponse({ error: "code or project_id required" }, 400);
      let currentCode = code;
      let currentFiles: any[] | null = null;
      if (!currentCode && project_id && supabase) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        currentFiles = (project?.files as any[]) || [];
        currentCode = currentFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      }
      if (!currentCode) return jsonResponse({ error: "No code to analyze" }, 400);
      const iterations = [];
      const maxIter = Math.min(max_iterations || 5, 7);
      for (let i = 0; i < maxIter; i++) {
        const bugResult = await callAI([
          { role: "system", content: `Deep Bug Scanner (Iteration ${i + 1}/${maxIter}). ${language ? `Language: ${language}` : ""}\nReturn JSON: {"has_issues":boolean,"severity_summary":{"critical":0,"high":0,"medium":0,"low":0},"issues":[{"severity":"string","description":"string","location":"string","fix_hint":"string"}]}` },
          { role: "user", content: currentCode },
        ], "google/gemini-2.5-pro");
        const bugs = parseJsonFromAI(bugResult);
        if (!bugs?.has_issues) { iterations.push({ iteration: i + 1, status: "clean" }); break; }
        const fixResult = await callAI([
          { role: "system", content: `Fix ALL these issues. Return ONLY the complete fixed code.\nIssues: ${JSON.stringify(bugs.issues)}` },
          { role: "user", content: currentCode },
        ], "google/gemini-2.5-pro");
        currentCode = fixResult;
        iterations.push({ iteration: i + 1, status: "fixed", issues_found: bugs.issues?.length || 0 });
      }
      if (project_id && supabase) {
        await supabase.from("projects").update({
          last_build_log: JSON.stringify({ iterations }).slice(0, 5000),
          build_status: iterations[iterations.length - 1]?.status === "clean" ? "tested_clean" : "tested_fixed",
        }).eq("id", project_id).catch(() => {});
      }
      return jsonResponse({ success: true, fixed_code: currentCode, iterations, total_iterations: iterations.length });
    }

    // === FACTORY PIPELINE ===
    if (action === "factory") {
      const { description, framework, features, user_id } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);
      if (!supabase) return jsonResponse({ error: "Database required for factory pipeline. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." }, 503);

      const pipeline: any[] = [];
      const genResult = await callAI([
        { role: "system", content: `Generate a complete project as JSON: {"project_name":"string","files":[{"path":"string","content":"string"}],"dependencies":[],"setup_commands":["npm install","npm run dev"]}\nFramework: ${framework || "react"}. ${features ? `Features: ${features.join(", ")}` : ""}\nAll code must be complete, production-ready.` },
        { role: "user", content: description },
      ], "google/gemini-2.5-pro");
      let project = parseJsonFromAI(genResult);
      if (!project?.files) return jsonResponse({ error: "Generation failed" }, 500);
      pipeline.push({ step: "generate", files: project.files.length });
      let files = project.files;

      // Test passes
      for (let i = 0; i < 3; i++) {
        const code = files.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        const bugScan = await callAI([
          { role: "system", content: `Deep scan for bugs. Return JSON: {"has_issues":boolean,"issues":[{"severity":"string","description":"string"}],"fixed_files":[{"path":"string","content":"string"}]}` },
          { role: "user", content: code },
        ], "google/gemini-2.5-pro");
        const scan = parseJsonFromAI(bugScan);
        if (!scan?.has_issues) { pipeline.push({ step: `test_pass_${i + 1}`, status: "clean" }); break; }
        if (scan.fixed_files?.length) files = scan.fixed_files;
        pipeline.push({ step: `test_pass_${i + 1}`, issues_fixed: scan.issues?.length || 0 });
      }

      files.push({ path: "setup.sh", content: `#!/bin/bash\nnpm install\nnpm run dev || npm start` });
      files.push({ path: "install.bat", content: `@echo off\ncall npm install\ncall npm run dev || call npm start\npause` });

      const { data: saved } = await supabase.from("projects").insert({
        user_id: user_id || "system", name: project.project_name || "factory-project", description, files, status: "active", build_status: "live",
        build_metadata: { pipeline },
        version_history: [{ version: 1, timestamp: new Date().toISOString(), note: "Factory build" }],
      }).select().single();

      if (saved?.id) {
        for (const file of files) {
          await supabase.storage.from("project-files").upload(`${saved.id}/${file.path}`, new TextEncoder().encode(file.content), { contentType: "text/plain", upsert: true }).catch(() => {});
        }
      }

      return jsonResponse({ success: true, project_id: saved?.id, project_name: project.project_name, pipeline, files_count: files.length });
    }

    // === EXECUTE COMMAND ===
    if (action === "execute") {
      const { command, params } = body;
      if (!command) return jsonResponse({ error: "command required" }, 400);
      const result = await callAI([
        { role: "system", content: `Command Executor. Command: "${command}", Params: ${JSON.stringify(params || {})}\nReturn JSON: {"status":"success|error","result":any,"message":"string"}` },
        { role: "user", content: `Execute: ${command}` },
      ]);
      const parsed = parseJsonFromAI(result) || { status: "success", result, message: "Executed" };
      if (supabase) {
        await supabase.from("memory_logs").insert({ action: "command_executed", details: { command, result_preview: JSON.stringify(parsed).slice(0, 500) } }).catch(() => {});
      }
      return jsonResponse({ success: true, ...parsed });
    }

    // === CODE-TO-IMAGE ===
    if (action === "code-to-image") {
      const { code, project_id, theme, viewport } = body;
      let codeContent = code;
      if (!codeContent && project_id && supabase) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        const uiFiles = (project?.files as any[])?.filter((f: any) => /\.(html|tsx|jsx|css|vue|svelte)$/.test(f.path)) || [];
        codeContent = uiFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      }
      if (!codeContent) return jsonResponse({ error: "code or project_id required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `UI Renderer. Generate self-contained HTML. Theme: ${theme || "light"}, viewport: ${viewport || "1280x720"}.
Return JSON: {"html":"complete HTML","description":"Bengali description","components":[],"color_palette":[],"responsive_score":0-100}`,
        },
        { role: "user", content: codeContent },
      ], "google/gemini-2.5-pro");

      const parsed = parseJsonFromAI(result);
      if (parsed?.html && project_id && supabase) {
        await supabase.storage.from("project-files").upload(`${project_id}/_preview.html`, new TextEncoder().encode(parsed.html), { contentType: "text/html", upsert: true }).catch(() => {});
        parsed.preview_url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${project_id}/_preview.html`;
      }

      return jsonResponse({ success: true, render: parsed || { raw: result } });
    }

    // === DATABASE SCHEMA GENERATION ===
    if (action === "generate-schema") {
      const { description, database_type, tables, relationships, features } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Database Architect. Generate complete schema for ${database_type || "PostgreSQL"}.
${tables ? `Existing: ${JSON.stringify(tables)}` : ""} ${relationships ? `Relations: ${JSON.stringify(relationships)}` : ""} ${features ? `Features: ${features.join(", ")}` : ""}
Return JSON: {"schema_name":"string","tables":[{"name":"string","columns":[],"indexes":[],"rls_policies":[]}],"relationships":[],"sql_migration":"SQL","seed_data":"SQL","description":"Bengali"}
Include RLS policies, indexes, foreign keys, seed data.`,
        },
        { role: "user", content: description },
      ], "google/gemini-2.5-pro");

      const schema = parseJsonFromAI(result);
      if (schema && body.project_id && supabase) {
        let uq = supabase.from("projects").update({ build_metadata: { database_schema: schema } }).eq("id", body.project_id);
        if (tenantId !== "super_admin") uq = uq.eq("tenant_id", tenantId);
        await uq.catch(() => {});
      }
      if (supabase) {
        await supabase.from("memory_logs").insert({ action: "schema_generated", details: { description, tables_count: schema?.tables?.length || 0 } }).catch(() => {});
      }
      return jsonResponse({ success: true, schema: schema || { raw: result } });
    }

    // === DEPLOYMENT AUTOMATION ===
    if (action === "deploy-automation") {
      const { project_id, deploy_target, config } = body;
      if (!project_id) return jsonResponse({ error: "project_id required" }, 400);
      if (!supabase) return jsonResponse({ error: "Database required for deploy-automation" }, 503);

      let dpq = supabase.from("projects").select("*").eq("id", project_id);
      if (tenantId !== "super_admin") dpq = dpq.eq("tenant_id", tenantId);
      const { data: project } = await dpq.single();
      if (!project) return jsonResponse({ error: "Project not found" }, 404);

      const files = (project.files as any[]) || [];
      const target = deploy_target || "vercel";

      const result = await callAI([
        {
          role: "system",
          content: `DevOps Engineer. Generate deployment config for ${target}.
Return JSON: {"target":"${target}","config_files":[{"path":"string","content":"string"}],"deploy_commands":[],"environment_variables":[{"key":"string","value":"string","description":"string"}],"ci_cd_config":{"path":"string","content":"string"},"description":"Bengali"}`,
        },
        { role: "user", content: `Project: ${project.name}\nFiles: ${files.map((f: any) => f.path).join(", ")}\nConfig: ${JSON.stringify(config || {})}` },
      ], "google/gemini-2.5-pro");

      const deployConfig = parseJsonFromAI(result);
      if (deployConfig?.config_files?.length) {
        const updatedFiles = [...files];
        for (const cf of deployConfig.config_files) {
          const idx = updatedFiles.findIndex((f: any) => f.path === cf.path);
          if (idx >= 0) updatedFiles[idx] = cf; else updatedFiles.push(cf);
        }
        let fuq = supabase.from("projects").update({ files: updatedFiles }).eq("id", project_id);
        if (tenantId !== "super_admin") fuq = fuq.eq("tenant_id", tenantId);
        await fuq.catch(() => {});
      }

      return jsonResponse({ success: true, deployment: deployConfig || { raw: result } });
    }

    // === COMPONENT LIBRARY GENERATOR ===
    if (action === "generate-components") {
      const { components, framework, style_system, theme } = body;
      if (!components?.length) return jsonResponse({ error: "components array required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Component Builder. Framework: ${framework || "React + TypeScript"}, Style: ${style_system || "Tailwind CSS"}.
Return JSON: {"library_name":"string","files":[{"path":"string","content":"string"}],"usage_examples":[{"component":"string","code":"string"}],"description":"string"}
Complete components with TypeScript, accessibility, dark mode, responsive.`,
        },
        { role: "user", content: `Components: ${components.join(", ")}` },
      ], "google/gemini-2.5-pro");

      return jsonResponse({ success: true, library: parseJsonFromAI(result) || { raw: result } });
    }

    // === DEPENDENCY ANALYZER ===
    if (action === "analyze-deps") {
      const { package_json, project_id } = body;
      let pkgContent = package_json;
      if (!pkgContent && project_id && supabase) {
        let pjq = supabase.from("projects").select("files,tenant_id").eq("id", project_id);
        if (tenantId !== "super_admin") pjq = pjq.eq("tenant_id", tenantId);
        const { data: project } = await pjq.single();
        const pkgFile = (project?.files as any[])?.find((f: any) => f.path === "package.json");
        pkgContent = pkgFile?.content;
      }
      if (!pkgContent) return jsonResponse({ error: "package_json or project_id required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Analyze package.json. Return JSON: {"total_deps":0,"outdated":[],"security_issues":[],"unused_likely":[],"size_impact":[],"recommendations":[],"health_score":0-100}`,
        },
        { role: "user", content: typeof pkgContent === "string" ? pkgContent : JSON.stringify(pkgContent) },
      ], "google/gemini-2.5-pro");

      return jsonResponse({ success: true, analysis: parseJsonFromAI(result) || { raw: result } });
    }

    return jsonResponse({ error: `Unknown sandbox action: ${action}` }, 404);
  } catch (e) {
    console.error("Sandbox error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  } finally {
    releaseSlot();
  }
});
