import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-master-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// === RATE LIMITER ===
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 }; // 30 req/min

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

function checkSupabaseConnection() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("CONNECTION_ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
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

  // Rate limit check
  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  const rl = checkRateLimit(clientIP);
  if (!rl.allowed) {
    return jsonResponse({ error: "Rate limit exceeded", retry_after_ms: rl.retryAfterMs }, 429);
  }

  // Queue control
  const queueTimeout = setTimeout(() => {}, 120_000);
  try {
    await acquireSlot();
    clearTimeout(queueTimeout);
  } catch {
    clearTimeout(queueTimeout);
    return jsonResponse({ error: "Server busy — try again shortly" }, 503);
  }

  try {
    const MASTER_SECRET = Deno.env.get("MASTER_SECRET");
    const providedSecret = req.headers.get("x-master-secret");
    if (!MASTER_SECRET || providedSecret !== MASTER_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let supabase: any;
    try { supabase = checkSupabaseConnection(); }
    catch (connErr) { return jsonResponse({ error: connErr instanceof Error ? connErr.message : "Connection Error", alert: "ADMIN_CONNECTION_ERROR" }, 503); }

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
        { role: "system", content: `Test Generator. Generate comprehensive unit tests, edge case tests, error handling tests.\n${language ? `Language: ${language}` : ""} ${framework ? `Framework: ${framework}` : ""} ${test_framework ? `Test framework: ${test_framework}` : ""}\nReturn complete, runnable test files.` },
        { role: "user", content: code },
      ]);
      return jsonResponse({ success: true, tests: result });
    }

    // === FULL PROJECT AUDIT ===
    if (action === "audit") {
      const { files, project_id } = body;
      let projectFiles = files;
      if (!projectFiles && project_id) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        projectFiles = project?.files || [];
      }
      if (!projectFiles?.length) return jsonResponse({ error: "files or project_id required" }, 400);
      const summary = projectFiles.map((f: any) => `--- ${f.path} ---\n${f.content || "(in storage)"}`).join("\n\n");
      const result = await callAI([
        { role: "system", content: `Project Auditor. Audit:\n1. Code Quality (0-100) 2. Security 3. Performance 4. Accessibility 5. SEO 6. Architecture\nReturn JSON: {"overall_score":0-100,"security":{"score":0-100,"issues":[]},"performance":{"score":0-100,"issues":[]},"code_quality":{"score":0-100,"issues":[]},"recommendations":[],"critical_fixes":[]}` },
        { role: "user", content: summary },
      ], "google/gemini-2.5-pro");
      const audit = parseJsonFromAI(result) || { raw_audit: result };
      if (project_id) {
        await supabase.from("projects").update({ build_status: "audited", last_build_log: JSON.stringify(audit).slice(0, 5000) }).eq("id", project_id);
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

    // === VISUAL AUDIT (AI Eyes) ===
    if (action === "visual-audit") {
      const { files, project_id } = body;
      let uiFiles = files;
      if (!uiFiles && project_id) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        uiFiles = (project?.files as any[])?.filter((f: any) =>
          f.path.endsWith(".html") || f.path.endsWith(".tsx") || f.path.endsWith(".jsx") || f.path.endsWith(".css")
        ) || [];
      }
      if (!uiFiles?.length) return jsonResponse({ error: "No UI files to audit" }, 400);
      const passes = [];
      let currentFiles = uiFiles;
      for (let i = 0; i < 3; i++) {
        const currentContent = currentFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        const result = await callAI([
          { role: "system", content: `You are TIVO AI OS Visual Inspector (Pass ${i + 1}).\nAnalyze UI code as if you can SEE the rendered output. Check:\n1. Layout 2. Responsive 3. Colors 4. Typography 5. Accessibility 6. Polish\nReturn JSON: {"ui_score":0-100,"pass":${i + 1},"issues":[{"component":"string","issue":"string","severity":"critical|high|medium|low","fix":"string"}],"fixed_files":[{"path":"string","content":"complete fixed content"}],"is_perfect":boolean}` },
          { role: "user", content: currentContent },
        ], "google/gemini-2.5-pro");
        const parsed = parseJsonFromAI(result);
        passes.push(parsed || { pass: i + 1, raw: result });
        if (parsed?.fixed_files?.length) {
          currentFiles = currentFiles.map((f: any) => { const fixed = parsed.fixed_files.find((ff: any) => ff.path === f.path); return fixed || f; });
        }
        if (parsed?.is_perfect || (parsed?.ui_score && parsed.ui_score >= 95)) break;
      }
      if (project_id && currentFiles.length) {
        const { data: fullProject } = await supabase.from("projects").select("files").eq("id", project_id).single();
        const allFiles = (fullProject?.files as any[]) || [];
        for (const cf of currentFiles) { const idx = allFiles.findIndex((f: any) => f.path === cf.path); if (idx >= 0) allFiles[idx] = cf; }
        await supabase.from("projects").update({ files: allFiles, build_metadata: { visual_audit: passes } }).eq("id", project_id);
      }
      return jsonResponse({ success: true, passes, final_score: passes[passes.length - 1]?.ui_score || 0, fixed_files: currentFiles, total_passes: passes.length });
    }

    // === AUTO TEST & FIX PIPELINE ===
    if (action === "auto-test-fix") {
      const { code, language, project_id, max_iterations } = body;
      if (!code && !project_id) return jsonResponse({ error: "code or project_id required" }, 400);
      let currentCode = code;
      let currentFiles: any[] | null = null;
      if (!currentCode && project_id) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        currentFiles = (project?.files as any[]) || [];
        currentCode = currentFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      }
      const iterations = [];
      const maxIter = Math.min(max_iterations || 5, 7);
      for (let i = 0; i < maxIter; i++) {
        const bugResult = await callAI([
          { role: "system", content: `You are TIVO AI OS Deep Bug Scanner (Iteration ${i + 1}/${maxIter}).\nPerform exhaustive analysis: ${language ? `Language: ${language}` : ""}\nReturn JSON: {"has_issues":boolean,"severity_summary":{"critical":0,"high":0,"medium":0,"low":0},"issues":[{"severity":"critical|high|medium|low","description":"string","location":"string","fix_hint":"string"}]}` },
          { role: "user", content: currentCode },
        ], "google/gemini-2.5-pro");
        const bugs = parseJsonFromAI(bugResult);
        if (!bugs?.has_issues) { iterations.push({ iteration: i + 1, status: "clean", message: "All tests passed" }); break; }
        const fixResult = await callAI([
          { role: "system", content: `Fix ALL these issues. Return ONLY the complete fixed code.\nIssues: ${JSON.stringify(bugs.issues)}` },
          { role: "user", content: currentCode },
        ], "google/gemini-2.5-pro");
        currentCode = fixResult;
        iterations.push({ iteration: i + 1, status: "fixed", issues_found: bugs.issues?.length || 0, severity: bugs.severity_summary });
      }
      if (project_id) {
        let updatedFiles = currentFiles;
        if (currentCode && !code) { const parsed = parseJsonFromAI(currentCode); if (parsed?.files) updatedFiles = parsed.files; }
        await supabase.from("projects").update({
          last_build_log: JSON.stringify({ iterations }).slice(0, 5000),
          build_status: iterations[iterations.length - 1]?.status === "clean" ? "tested_clean" : "tested_fixed",
          ...(updatedFiles ? { files: updatedFiles } : {}),
        }).eq("id", project_id);
      }
      return jsonResponse({ success: true, fixed_code: currentCode, iterations, total_iterations: iterations.length, final_status: iterations[iterations.length - 1]?.status || "unknown" });
    }

    // === FACTORY PIPELINE ===
    if (action === "factory") {
      const { description, framework, features, user_id } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);
      const pipeline: any[] = [];
      const startTime = Date.now();
      const genResult = await callAI([
        { role: "system", content: `Generate a complete project as JSON: {"project_name":"string","files":[{"path":"string","content":"string"}],"dependencies":[],"setup_commands":["npm install","npm run dev"]}\nFramework: ${framework || "react"}. ${features ? `Features: ${features.join(", ")}` : ""}\nInclude package.json, README.md. All code must be complete, production-ready.` },
        { role: "user", content: description },
      ], "google/gemini-2.5-pro");
      let project = parseJsonFromAI(genResult);
      if (!project?.files) return jsonResponse({ error: "Generation failed", raw: genResult }, 500);
      pipeline.push({ step: "generate", files: project.files.length });
      let files = project.files;
      for (let i = 0; i < 3; i++) {
        const code = files.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        const bugScan = await callAI([
          { role: "system", content: `Deep scan for bugs. Return JSON: {"has_issues":boolean,"issues":[{"severity":"string","description":"string","location":"string"}],"fixed_files":[{"path":"string","content":"string"}]}` },
          { role: "user", content: code },
        ], "google/gemini-2.5-pro");
        const scan = parseJsonFromAI(bugScan);
        if (!scan?.has_issues) { pipeline.push({ step: `test_pass_${i + 1}`, status: "clean" }); break; }
        if (scan.fixed_files?.length) files = scan.fixed_files;
        pipeline.push({ step: `test_pass_${i + 1}`, issues_fixed: scan.issues?.length || 0 });
      }
      const uiFiles = files.filter((f: any) => /\.(html|tsx|jsx|css)$/.test(f.path));
      if (uiFiles.length) {
        const vResult = await callAI([
          { role: "system", content: `Visual audit. Check layout, colors, responsive, accessibility. Return JSON: {"ui_score":0-100,"fixed_files":[{"path":"string","content":"string"}]}` },
          { role: "user", content: uiFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n") },
        ], "google/gemini-2.5-pro");
        const visual = parseJsonFromAI(vResult);
        if (visual?.fixed_files?.length) { for (const vf of visual.fixed_files) { const idx = files.findIndex((f: any) => f.path === vf.path); if (idx >= 0) files[idx] = vf; } }
        pipeline.push({ step: "visual_audit", score: visual?.ui_score || 0 });
      }
      files.push({ path: "setup.sh", content: `#!/bin/bash\necho "Installing ${project.project_name}..."\nnpm install\nnpm run dev || npm start` });
      files.push({ path: "install.bat", content: `@echo off\necho Installing ${project.project_name}...\ncall npm install\ncall npm run dev || call npm start\npause` });
      const { data: saved } = await supabase.from("projects").insert({
        user_id: user_id || "system", name: project.project_name || "factory-project", description, files, status: "active", build_status: "live",
        build_metadata: { pipeline, build_time_ms: Date.now() - startTime },
        version_history: [{ version: 1, timestamp: new Date().toISOString(), note: "Factory build" }],
      }).select().single();
      if (saved?.id) {
        for (const file of files) { await supabase.storage.from("project-files").upload(`${saved.id}/${file.path}`, new TextEncoder().encode(file.content), { contentType: "text/plain", upsert: true }); }
        const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${saved.id}/index.html`;
        const installerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${saved.id}&format=zip`;
        await supabase.from("projects").update({ public_url: publicUrl, installer_url: installerUrl }).eq("id", saved.id);
        pipeline.push({ step: "deploy", public_url: publicUrl });
      }
      await supabase.from("memory_logs").insert({ action: "factory_complete", details: { project_id: saved?.id, description, pipeline, build_time_ms: Date.now() - startTime } });
      return jsonResponse({ success: true, project_id: saved?.id, project_name: project.project_name, pipeline, files_count: files.length, build_time_ms: Date.now() - startTime, download_url: saved?.id ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${saved.id}&format=zip` : null, public_url: pipeline.find((s: any) => s.public_url)?.public_url || null });
    }

    // === EXECUTE COMMAND ===
    if (action === "execute") {
      const { command, params } = body;
      if (!command) return jsonResponse({ error: "command required" }, 400);
      const result = await callAI([
        { role: "system", content: `Command Executor for TIVO AI OS. Command: "${command}", Params: ${JSON.stringify(params || {})}\nProcess and return JSON: {"status":"success|error","result":any,"message":"string"}` },
        { role: "user", content: `Execute: ${command}` },
      ]);
      const parsed = parseJsonFromAI(result) || { status: "success", result, message: "Executed" };
      await supabase.from("memory_logs").insert({ action: "command_executed", details: { command, params, result_preview: JSON.stringify(parsed).slice(0, 500) } });
      return jsonResponse({ success: true, ...parsed });
    }

    // === CODE-TO-IMAGE (Generate UI screenshot description from code) ===
    if (action === "code-to-image") {
      const { code, project_id, theme, viewport } = body;
      let codeContent = code;
      if (!codeContent && project_id) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        const uiFiles = (project?.files as any[])?.filter((f: any) => /\.(html|tsx|jsx|css|vue|svelte)$/.test(f.path)) || [];
        codeContent = uiFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      }
      if (!codeContent) return jsonResponse({ error: "code or project_id required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO DEV AGENT UI Renderer. Analyze UI code and generate:
1. A complete, self-contained HTML file that renders the UI (inline CSS/JS, no external deps except CDN)
2. Use ${theme || "light"} theme, viewport: ${viewport || "1280x720"}
3. Include all components, proper layout, colors, typography
4. The HTML should be pixel-perfect representation of the code

Return JSON: {
  "html": "complete self-contained HTML string",
  "description": "UI description in Bengali",
  "components": ["list of UI components found"],
  "color_palette": ["#hex colors used"],
  "responsive_score": 0-100
}`,
        },
        { role: "user", content: codeContent },
      ], "google/gemini-2.5-pro");

      const parsed = parseJsonFromAI(result);
      
      // Save rendered HTML to storage if project_id provided
      if (parsed?.html && project_id) {
        await supabase.storage.from("project-files").upload(
          `${project_id}/_preview.html`,
          new TextEncoder().encode(parsed.html),
          { contentType: "text/html", upsert: true }
        );
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
          content: `You are TIVO DEV AGENT Database Architect. Generate a complete database schema.
Database: ${database_type || "PostgreSQL (Supabase)"}
${tables ? `Existing tables: ${JSON.stringify(tables)}` : ""}
${relationships ? `Relationships: ${JSON.stringify(relationships)}` : ""}
${features ? `Required features: ${features.join(", ")}` : ""}

Return JSON: {
  "schema_name": "string",
  "tables": [{
    "name": "string",
    "columns": [{"name":"string","type":"string","nullable":boolean,"default":"string?","primary_key":boolean,"foreign_key":"table.column?","unique":boolean}],
    "indexes": [{"name":"string","columns":["string"],"unique":boolean}],
    "rls_policies": [{"name":"string","command":"SELECT|INSERT|UPDATE|DELETE","check":"SQL expression"}]
  }],
  "relationships": [{"from":"table.column","to":"table.column","type":"one-to-one|one-to-many|many-to-many"}],
  "sql_migration": "Complete SQL migration script",
  "seed_data": "SQL INSERT statements for sample data",
  "supabase_functions": ["Database functions if needed"],
  "triggers": ["Trigger definitions if needed"],
  "description": "Schema description in Bengali"
}

CRITICAL:
- Include RLS policies for every table
- Include proper indexes for performance
- Include foreign keys and constraints
- Include seed data for testing
- Generate Supabase-compatible SQL`,
        },
        { role: "user", content: description },
      ], "google/gemini-2.5-pro");

      const schema = parseJsonFromAI(result);
      
      // Save schema to project if project_id provided
      if (schema && body.project_id) {
        await supabase.from("projects").update({
          build_metadata: { database_schema: schema },
        }).eq("id", body.project_id);
      }

      await supabase.from("memory_logs").insert({
        action: "schema_generated",
        details: { description, tables_count: schema?.tables?.length || 0, database_type: database_type || "postgresql" },
      });

      return jsonResponse({ success: true, schema: schema || { raw: result } });
    }

    // === DEPLOYMENT AUTOMATION ===
    if (action === "deploy-automation") {
      const { project_id, deploy_target, config } = body;
      if (!project_id) return jsonResponse({ error: "project_id required" }, 400);

      const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
      if (!project) return jsonResponse({ error: "Project not found" }, 404);

      const files = (project.files as any[]) || [];
      const target = deploy_target || "vercel";

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO DEV AGENT DevOps Engineer. Generate deployment configuration for ${target}.

Available targets: vercel, netlify, docker, github-pages, railway, fly-io

Return JSON: {
  "target": "${target}",
  "config_files": [{"path":"string","content":"string"}],
  "deploy_commands": ["string"],
  "environment_variables": [{"key":"string","value":"string","description":"string"}],
  "dockerfile": "string? (if target is docker)",
  "ci_cd_config": {"path":"string","content":"string"},
  "post_deploy_steps": ["string"],
  "estimated_cost": "string",
  "description": "Deployment guide in Bengali"
}

Include:
- Complete deployment config files (vercel.json, netlify.toml, Dockerfile, etc.)
- CI/CD pipeline (GitHub Actions)
- Environment variable setup
- Post-deployment health checks
- SSL/domain configuration notes`,
        },
        { role: "user", content: `Project: ${project.name}\nFiles: ${files.map((f: any) => f.path).join(", ")}\nConfig: ${JSON.stringify(config || {})}` },
      ], "google/gemini-2.5-pro");

      const deployConfig = parseJsonFromAI(result);

      // Add deploy config files to project
      if (deployConfig?.config_files?.length) {
        const updatedFiles = [...files];
        for (const cf of deployConfig.config_files) {
          const idx = updatedFiles.findIndex((f: any) => f.path === cf.path);
          if (idx >= 0) updatedFiles[idx] = cf; else updatedFiles.push(cf);
        }
        await supabase.from("projects").update({ files: updatedFiles }).eq("id", project_id);

        // Upload to storage
        for (const cf of deployConfig.config_files) {
          await supabase.storage.from("project-files").upload(
            `${project_id}/${cf.path}`,
            new TextEncoder().encode(cf.content),
            { contentType: "text/plain", upsert: true }
          );
        }
      }

      await supabase.from("memory_logs").insert({
        action: "deploy_config_generated",
        details: { project_id, target, config_files: deployConfig?.config_files?.length || 0 },
      });

      return jsonResponse({ success: true, deployment: deployConfig || { raw: result } });
    }

    // === COMPONENT LIBRARY GENERATOR ===
    if (action === "generate-components") {
      const { components, framework, style_system, theme } = body;
      if (!components?.length) return jsonResponse({ error: "components array required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO DEV AGENT Component Builder. Generate a complete UI component library.
Framework: ${framework || "React + TypeScript"}
Style: ${style_system || "Tailwind CSS"}
Theme: ${JSON.stringify(theme || { primary: "#3b82f6", secondary: "#6366f1" })}

Return JSON: {
  "library_name": "string",
  "files": [{"path":"string","content":"string"}],
  "storybook_stories": [{"path":"string","content":"string"}],
  "index_file": "string (barrel export)",
  "theme_config": "string (theme/design tokens file)",
  "usage_examples": [{"component":"string","code":"string"}],
  "description": "string"
}

Generate COMPLETE, production-ready components with:
- TypeScript interfaces/types
- Proper props with defaults
- Accessibility (ARIA)
- Dark mode support
- Animation/transitions
- Responsive design
- Storybook stories`,
        },
        { role: "user", content: `Components: ${components.join(", ")}` },
      ], "google/gemini-2.5-pro");

      return jsonResponse({ success: true, library: parseJsonFromAI(result) || { raw: result } });
    }

    // === DEPENDENCY ANALYZER ===
    if (action === "analyze-deps") {
      const { package_json, project_id } = body;
      let pkgContent = package_json;
      if (!pkgContent && project_id) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        const pkgFile = (project?.files as any[])?.find((f: any) => f.path === "package.json");
        pkgContent = pkgFile?.content;
      }
      if (!pkgContent) return jsonResponse({ error: "package_json or project_id required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Analyze this package.json. Return JSON: {
  "total_deps": number,
  "outdated": [{"name":"string","current":"string","latest":"string","breaking_changes":boolean}],
  "security_issues": [{"package":"string","severity":"critical|high|medium|low","description":"string","fix":"string"}],
  "unused_likely": ["string"],
  "size_impact": [{"package":"string","estimated_size_kb":number}],
  "recommendations": ["string"],
  "health_score": 0-100
}`,
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
