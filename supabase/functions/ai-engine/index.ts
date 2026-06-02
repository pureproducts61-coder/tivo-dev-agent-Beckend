import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-master-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// SSRF guard for HF Space URLs — only allow https://*.hf.space hosts
const HF_SPACE_RE = /^https:\/\/[a-zA-Z0-9-]+(?:-[a-zA-Z0-9-]+)*\.hf\.space$/;
function isSafeHfSpaceUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    return HF_SPACE_RE.test(`${p.protocol}//${p.host}`);
  } catch { return false; }
}

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
const requestQueue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) { activeRequests++; return; }
  return new Promise((resolve) => { requestQueue.push({ resolve }); });
}

function releaseSlot() {
  activeRequests--;
  if (requestQueue.length > 0) { const next = requestQueue.shift()!; activeRequests++; next.resolve(); }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Returns supabase client or null (never throws)
function tryGetSupabase() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

// Requires supabase — returns client or error response
function requireSupabase(): { client: any } | { error: Response } {
  const supabase = tryGetSupabase();
  if (!supabase) return { error: jsonResponse({ error: "Database not configured. AI-only endpoints still work.", hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets." }, 503) };
  return { client: supabase };
}

// === Multi-tenant resolver (matches backend-api) ===
function resolveTenant(providedSecret: string | null): { tenantId: string } | null {
  if (!providedSecret) return null;
  if (providedSecret === Deno.env.get("MASTER_SECRET")) return { tenantId: "tenant_main" };
  for (let i = 2; i <= 50; i++) {
    const v = Deno.env.get(`MASTER_SECRET_${i}`);
    if (v && providedSecret === v) return { tenantId: `tenant_${i}` };
  }
  // Super admin secret resolves to special tenant id
  const sa = Deno.env.get("SUPER_ADMIN_MASTER_SECRET");
  if (sa && providedSecret === sa) return { tenantId: "super_admin" };
  return null;
}

// === Google Gemini direct API fallback (when Lovable AI quota exhausted) ===
async function callGemini(messages: any[]): Promise<string> {
  const KEY = Deno.env.get("GEMINI_API_KEY");
  if (!KEY) throw new Error("GEMINI_API_KEY not configured");
  // Convert chat messages → Gemini format
  const systemMsg = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
    }));
  const body: any = { contents };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg }] };
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
}

// HF Inference fallback — used when LOVABLE_API_KEY missing or quota hit
async function callHFInference(messages: any[], model?: string): Promise<string> {
  const HF_TOKEN = Deno.env.get("HF_INFERENCE_TOKEN") || Deno.env.get("HF_TOKEN");
  if (!HF_TOKEN) throw new Error("Neither LOVABLE_API_KEY nor HF_INFERENCE_TOKEN configured");

  // Default to a strong open model
  const hfModel = model || Deno.env.get("HF_DEFAULT_MODEL") || "Qwen/Qwen2.5-Coder-32B-Instruct";
  const response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: hfModel, messages, max_tokens: 4096 }),
  });
  if (!response.ok) throw new Error(`HF Inference error: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAI(messages: any[], stream = false, model = "google/gemini-3-flash-preview", modalities?: string[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const HF_TOKEN = Deno.env.get("HF_INFERENCE_TOKEN") || Deno.env.get("HF_TOKEN");
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

  const tryFallback = async (): Promise<string | null> => {
    if (stream || modalities) return null;
    if (GEMINI_KEY) { try { return await callGemini(messages); } catch (_) {} }
    if (HF_TOKEN)  { try { return await callHFInference(messages); } catch (_) {} }
    return null;
  };

  if (!LOVABLE_API_KEY) {
    const fb = await tryFallback();
    if (fb !== null) return fb;
    throw new Error("LOVABLE_API_KEY not configured (and no Gemini/HF fallback available for this request)");
  }

  const bodyPayload: any = { model, messages, stream };
  if (modalities) bodyPayload.modalities = modalities;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 402 || response.status >= 500) {
      const fb = await tryFallback();
      if (fb !== null) return fb;
    }
    if (response.status === 429) throw new Error("Rate limited - try again later");
    if (response.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error: ${response.status}`);
  }

  if (stream) return response;
  const data = await response.json();
  if (data.choices?.[0]?.message?.images?.length) {
    return { text: data.choices[0].message.content || "", images: data.choices[0].message.images };
  }
  return data.choices?.[0]?.message?.content || "";
}

function parseJsonFromAI(result: string) {
  try {
    const m = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? (m[1] || m[0]) : result);
  } catch { return null; }
}

function generateInstallerScripts(projectName: string) {
  const setupSh = `#!/bin/bash
echo "========================================="
echo "  ${projectName} — Auto Installer"
echo "  Powered by TIVO DEV AGENT"
echo "========================================="
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Installing..."
  if command -v curl &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v brew &> /dev/null; then
    brew install node
  else
    echo "Please install Node.js from https://nodejs.org"
    exit 1
  fi
fi
echo "✅ Node.js $(node -v) detected"
echo "📦 Installing dependencies..."
npm install
echo "🔨 Building..."
npm run build 2>/dev/null || echo "No build step"
echo "🚀 Starting ${projectName}..."
echo "   Open http://localhost:3000"
npm start || npm run dev || npm run preview
`;

  const installBat = `@echo off
chcp 65001 >nul
echo =========================================
echo   ${projectName} — Auto Installer
echo   Powered by TIVO DEV AGENT
echo =========================================
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Node.js not found!
  echo Please download from https://nodejs.org
  start https://nodejs.org
  pause
  exit /b 1
)
echo Node.js detected
echo Installing dependencies...
call npm install
echo Building...
call npm run build 2>nul
echo Starting ${projectName}...
echo Open http://localhost:3000
call npm start || call npm run dev || call npm run preview
pause
`;

  return { "setup.sh": setupSh, "install.bat": installBat };
}

async function saveVersion(supabase: any, projectId: string, files: any[], note: string) {
  const { data: project } = await supabase.from("projects").select("version_history").eq("id", projectId).single();
  const history = (project?.version_history as any[]) || [];
  history.push({
    version: history.length + 1,
    timestamp: new Date().toISOString(),
    note,
    file_count: files.length,
    file_paths: files.map((f: any) => f.path),
  });
  await supabase.from("projects").update({ version_history: history.slice(-50) }).eq("id", projectId);
}

async function uploadToStorage(supabase: any, projectId: string, files: any[]) {
  const contentTypes: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    json: "application/json", svg: "image/svg+xml", png: "image/png",
    ts: "application/javascript", tsx: "application/javascript", jsx: "application/javascript",
    sh: "text/x-shellscript", bat: "text/x-batch", md: "text/markdown",
    yml: "text/yaml", yaml: "text/yaml", xml: "application/xml",
  };
  for (const file of files) {
    const ext = file.path.split(".").pop() || "txt";
    await supabase.storage.from("project-files").upload(
      `${projectId}/${file.path}`,
      new TextEncoder().encode(file.content),
      { contentType: contentTypes[ext] || "text/plain", upsert: true }
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Rate limit
  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  const rl = checkRateLimit(clientIP);
  if (!rl.allowed) return jsonResponse({ error: "Rate limit exceeded", retry_after_ms: rl.retryAfterMs }, 429);

  // Queue
  try { await acquireSlot(); } catch { return jsonResponse({ error: "Server busy" }, 503); }

  try {
    const providedSecret = req.headers.get("x-master-secret");
    const tenant = resolveTenant(providedSecret);
    if (!tenant) return jsonResponse({ error: "Unauthorized" }, 401);
    const tenantId = tenant.tenantId;

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";
    const body = await req.json().catch(() => ({}));

    // =============================================
    // AI-ONLY ENDPOINTS (No Supabase needed)
    // =============================================

    // === GENERATE CODE ===
    if (action === "generate") {
      const { prompt, language, framework, context, model, stream: doStream } = body;
      if (!prompt) return jsonResponse({ error: "prompt required" }, 400);

      const systemPrompt = `You are TIVO DEV AGENT — an elite full-stack developer AI.
Generate production-ready, complete, well-structured code.
${language ? `Language: ${language}` : ""}
${framework ? `Framework: ${framework}` : ""}
Rules:
- Write COMPLETE, runnable code — no placeholders, no TODOs
- Include proper error handling and edge cases
- Follow best practices and modern patterns
- Add helpful comments for complex logic
- Use modern syntax (ES2022+, React 18+, TypeScript strict)`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...(context ? [{ role: "user", content: `Context:\n${context}` }] : []),
        { role: "user", content: prompt },
      ];

      if (doStream) {
        const streamResp = await callAI(messages, true, model);
        return new Response(streamResp.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const result = await callAI(messages, false, model);
      return jsonResponse({ success: true, code: result });
    }

    // === CODE REVIEW ===
    if (action === "review") {
      const { code, language, focus } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `You are TIVO DEV AGENT Code Reviewer. Deep analysis:\n1. Security 2. Performance 3. Architecture 4. Bug Detection 5. Suggestions\n${focus ? `Focus: ${focus}` : ""} ${language ? `Language: ${language}` : ""}\nProvide specific line references and working fix code.` },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, review: result });
    }

    // === BUG FIX ===
    if (action === "fix") {
      const { code, error_message, language } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `You are TIVO DEV AGENT Bug Fixer.\n1. Identify root cause 2. Explain the bug 3. Provide COMPLETE fixed code 4. List all changes\n${language ? `Language: ${language}` : ""}\nCRITICAL: Output must be immediately runnable.` },
        { role: "user", content: `Code:\n\`\`\`\n${code}\n\`\`\`\n${error_message ? `\nError: ${error_message}` : ""}` },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, fix: result });
    }

    // === GENERATE PROJECT (AI-only, saves to DB if available) ===
    if (action === "generate-project") {
      const { description, framework, features, model, tech_stack } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const systemPrompt = `You are TIVO DEV AGENT Project Builder — generate complete, production-ready multi-file projects.
${framework ? `Framework: ${framework}` : "Choose the best framework for the task."}
${tech_stack ? `Tech Stack: ${tech_stack}` : ""}
${features ? `Required features: ${features.join(", ")}` : ""}

Return a JSON object:
{
  "project_name": "string",
  "files": [{"path": "relative/path/file.ext", "content": "complete file content"}],
  "dependencies": ["package1@version"],
  "dev_dependencies": ["package1@version"],
  "setup_commands": ["npm install", "npm run dev"],
  "description": "Brief description",
  "tech_stack": { "frontend": "...", "backend": "...", "database": "..." }
}

CRITICAL RULES:
- Generate COMPLETE, WORKING files — no TODOs, no placeholders
- Include package.json with ALL dependencies and proper scripts
- Include README.md with setup instructions
- Include all config files
- At least 20+ files for any serious application`;

      const result = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: description },
      ], false, model || "google/gemini-2.5-pro");

      const projectData = parseJsonFromAI(result) || { raw_response: result };
      return jsonResponse({ success: true, project: projectData });
    }

    // === CHAT ===
    if (action === "chat") {
      const { messages: userMessages, system_prompt, model, stream: doStream } = body;
      if (!userMessages?.length) return jsonResponse({ error: "messages required" }, 400);

      const messages = [
        { role: "system", content: system_prompt || "You are TIVO DEV AGENT — a powerful AI for coding and development. Be concise, precise, and actionable." },
        ...userMessages,
      ];

      if (doStream) {
        const streamResp = await callAI(messages, true, model);
        return new Response(streamResp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
      }

      const result = await callAI(messages, false, model);
      return jsonResponse({ success: true, response: result });
    }

    // === REFACTOR ===
    if (action === "refactor") {
      const { code, language, goal } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `TIVO DEV AGENT Refactorer. ${language ? `Language: ${language}` : ""} ${goal ? `Goal: ${goal}` : "DRY, SOLID, clean code."}\nReturn complete refactored code with explanations.` },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, refactored: result });
    }

    // === CONVERT ===
    if (action === "convert") {
      const { code, from_language, to_language, from_framework, to_framework } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `TIVO DEV AGENT Code Converter.\nFrom: ${from_language || "auto-detect"} ${from_framework ? `(${from_framework})` : ""}\nTo: ${to_language || "JavaScript"} ${to_framework ? `(${to_framework})` : ""}\nReturn COMPLETE converted code.` },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, converted: result });
    }

    // === GENERATE API ===
    if (action === "generate-api") {
      const { description, endpoints, database_schema, auth_type } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);
      const result = await callAI([
        { role: "system", content: `TIVO DEV AGENT API Builder. Generate complete REST API.\n${endpoints ? `Endpoints: ${JSON.stringify(endpoints)}` : ""}\n${database_schema ? `Schema: ${JSON.stringify(database_schema)}` : ""}\n${auth_type ? `Auth: ${auth_type}` : ""}\nReturn complete, production-ready API code with routes, controllers, middleware, validation.` },
        { role: "user", content: description },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, api: result });
    }

    // === GENERATE DOCS ===
    if (action === "generate-docs") {
      const { code, doc_type } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);
      const result = await callAI([
        { role: "system", content: `TIVO DEV AGENT Documentation Generator. ${doc_type ? `Type: ${doc_type}` : "Full Markdown documentation."}\nGenerate comprehensive, well-structured documentation.` },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-flash");
      return jsonResponse({ success: true, documentation: result });
    }

    // =============================================
    // DB-REQUIRED ENDPOINTS (Need Supabase)
    // =============================================

    // === AUTONOMOUS BUILD PIPELINE ===
    if (action === "auto-build") {
      const { project_id, description, framework, features, user_id, quality_target, model: preferredModel } = body;
      if (!description && !project_id) return jsonResponse({ error: "description or project_id required" }, 400);

      const sbResult = requireSupabase();
      if ("error" in sbResult) return sbResult.error;
      const supabase = sbResult.client;

      const steps: any[] = [];
      const startTime = Date.now();
      const targetScore = quality_target || 90;
      const aiModel = preferredModel || "google/gemini-2.5-pro";

      // Step 1: Generate or fetch project
      let projectFiles: any;
      let projectName: string;
      if (project_id) {
        let pq = supabase.from("projects").select("*").eq("id", project_id);
        if (tenantId !== "super_admin") pq = pq.eq("tenant_id", tenantId);
        const { data: project } = await pq.single();
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        projectFiles = project.files;
        projectName = project.name;
        steps.push({ step: "fetch_project", status: "done" });
      } else {
        const genResult = await callAI([
          {
            role: "system",
            content: `You are TIVO DEV AGENT Factory. Generate a COMPLETE, PROFESSIONAL project.
Return JSON: {"project_name":"string","files":[{"path":"string","content":"string"}],"dependencies":[],"setup_commands":["npm install","npm run dev"]}
Framework: ${framework || "react with vite and tailwind"}. ${features ? `Features: ${features.join(", ")}` : ""}

CRITICAL:
- Generate 15-40 files for any real application
- Include package.json with ALL deps (versions specified)
- Include vite.config, tsconfig, tailwind.config, postcss.config
- Every component must be complete — no TODOs
- Include proper routing, error boundaries, loading states
- Mobile responsive with Tailwind
- TypeScript strict mode`,
          },
          { role: "user", content: description! },
        ], false, aiModel);

        projectFiles = parseJsonFromAI(genResult);
        projectName = projectFiles?.project_name || "tivo-project";
        steps.push({ step: "generate", status: "done", files_count: projectFiles?.files?.length || 0 });
      }

      const filesList = projectFiles?.files || projectFiles || [];

      // Step 2: Deep Code Audit
      const auditPrompt = filesList.slice(0, 30).map((f: any) => `--- ${f.path} ---\n${(f.content || "").slice(0, 3000)}`).join("\n\n");
      const auditResult = await callAI([
        {
          role: "system",
          content: `You are TIVO DEV AGENT Quality Auditor. RIGOROUS audit.
Return JSON: {"score":0-100,"issues":[{"file":"path","severity":"critical|high|medium|low","message":"string","fix":"code"}],"fixed_files":[{"path":"string","content":"COMPLETE fixed content"}]}
Check: security, bugs, performance, accessibility, responsive design, TypeScript errors, import issues, missing dependencies.
Fix ALL issues — return COMPLETE file content, not patches.`,
        },
        { role: "user", content: auditPrompt },
      ], false, aiModel);

      const audit = parseJsonFromAI(auditResult) || { score: 50, issues: [], fixed_files: filesList };
      steps.push({ step: "audit", status: "done", score: audit.score, issues_found: audit.issues?.length || 0 });

      let finalFiles = audit.fixed_files?.length ? audit.fixed_files : filesList;
      let currentScore = audit.score || 50;

      // Step 3: Iterative Auto-Fix
      for (let i = 0; i < 5 && currentScore < targetScore; i++) {
        const reauditPrompt = finalFiles.slice(0, 25).map((f: any) => `--- ${f.path} ---\n${(f.content || "").slice(0, 2500)}`).join("\n\n");
        const reauditResult = await callAI([
          {
            role: "system",
            content: `Re-audit pass ${i + 1}. Target: ${targetScore}. Current: ${currentScore}.
Fix ALL remaining issues. Return JSON: {"score":0-100,"fixed_files":[{"path":"string","content":"COMPLETE content"}],"changes_made":["description"]}`,
          },
          { role: "user", content: reauditPrompt },
        ], false, aiModel);

        const reaudit = parseJsonFromAI(reauditResult);
        if (reaudit?.fixed_files?.length) {
          for (const rf of reaudit.fixed_files) {
            const idx = finalFiles.findIndex((f: any) => f.path === rf.path);
            if (idx >= 0) finalFiles[idx] = rf; else finalFiles.push(rf);
          }
        }
        currentScore = reaudit?.score || Math.min(currentScore + 10, 100);
        steps.push({ step: `auto_fix_pass_${i + 1}`, score: currentScore, changes: reaudit?.changes_made || [] });
        if (currentScore >= targetScore) break;
      }

      // Step 4: Visual Audit
      const uiFiles = finalFiles.filter((f: any) => /\.(html|tsx|jsx|css)$/.test(f.path));
      if (uiFiles.length) {
        const vResult = await callAI([
          { role: "system", content: `Visual audit. Check layout, colors, responsive, accessibility. Return JSON: {"ui_score":0-100,"fixed_files":[{"path":"string","content":"string"}]}` },
          { role: "user", content: uiFiles.slice(0, 15).map((f: any) => `--- ${f.path} ---\n${(f.content || "").slice(0, 2000)}`).join("\n\n") },
        ], false, aiModel);
        const visual = parseJsonFromAI(vResult);
        if (visual?.fixed_files?.length) {
          for (const vf of visual.fixed_files) {
            const idx = finalFiles.findIndex((f: any) => f.path === vf.path);
            if (idx >= 0) finalFiles[idx] = vf;
          }
        }
        steps.push({ step: "visual_audit", score: visual?.ui_score || 0 });
      }

      // Add installer scripts
      const installers = generateInstallerScripts(projectName);
      finalFiles.push({ path: "setup.sh", content: installers["setup.sh"] });
      finalFiles.push({ path: "install.bat", content: installers["install.bat"] });

      // Step 5: Save to DB
      const { data: saved } = await supabase.from("projects").insert({
        user_id: user_id || "system",
        tenant_id: tenantId === "super_admin" ? "tenant_main" : tenantId,
        name: projectName,
        description: description || "",
        files: finalFiles,
        status: "active",
        build_status: "live",
        build_metadata: { pipeline: steps, audit_score: currentScore, build_time_ms: Date.now() - startTime },
        version_history: [{ version: 1, timestamp: new Date().toISOString(), note: "Auto-build pipeline" }],
      }).select().single();

      let downloadUrl = null;
      let publicUrl = null;

      if (saved?.id) {
        await uploadToStorage(supabase, saved.id, finalFiles);
        const { data: signed } = await supabase.storage.from("project-files").createSignedUrl(`${saved.id}/index.html`, 60 * 60 * 24 * 365);
        publicUrl = signed?.signedUrl || null;
        downloadUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${saved.id}&format=zip`;
        await supabase.from("projects").update({ public_url: publicUrl, installer_url: downloadUrl }).eq("id", saved.id);
        steps.push({ step: "deploy", public_url: publicUrl });
      }

      await supabase.from("memory_logs").insert({
        action: "auto_build_complete",
        user_id: user_id || null,
        details: { project_id: saved?.id, description, steps_count: steps.length, audit_score: currentScore, build_time_ms: Date.now() - startTime },
      }).catch(() => {});

      return jsonResponse({
        success: true,
        project_id: saved?.id,
        project_name: projectName,
        audit_score: currentScore,
        steps,
        files_count: finalFiles.length,
        build_time_ms: Date.now() - startTime,
        download_url: downloadUrl,
        public_url: publicUrl,
      });
    }

    // === BUILD NATIVE (APK/EXE via HF Space) ===
    if (action === "build-native") {
      const { project_id, build_type, hf_space_url, app_name, package_name } = body;
      if (!project_id || !build_type) return jsonResponse({ error: "project_id and build_type required" }, 400);
      if (!hf_space_url) return jsonResponse({ error: "hf_space_url required — HF Space URL where Docker build engine is deployed" }, 400);
      if (!isSafeHfSpaceUrl(hf_space_url)) return jsonResponse({ error: "Invalid hf_space_url — must be https://<space>.hf.space" }, 400);

      const sbResult = requireSupabase();
      if ("error" in sbResult) return sbResult.error;
      const supabase = sbResult.client;

      let bnq = supabase.from("projects").select("*").eq("id", project_id);
      if (tenantId !== "super_admin") bnq = bnq.eq("tenant_id", tenantId);
      const { data: project } = await bnq.single();
      if (!project) return jsonResponse({ error: "Project not found" }, 404);

      const files = (project.files as any[]) || [];
      const config = { app_name: app_name || project.name, package_name: package_name || "com.tivo.app" };

      const endpoint = build_type === "apk" ? "/api/build-apk" : "/api/build-exe";
      const hfUrl = hf_space_url.replace(/\/$/, "");

      const hfResponse = await fetch(`${hfUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, config }),
      });

      if (!hfResponse.ok) {
        const errText = await hfResponse.text().catch(() => "HF Space unreachable");
        return jsonResponse({ error: `HF Build Engine error: ${errText}`, hint: "Ensure HF Space is running and Docker build engine is deployed" }, 502);
      }

      const buildResult = await hfResponse.json();

      let updQ = supabase.from("projects").update({
        build_status: `${build_type}_built`,
        build_metadata: { ...((project.build_metadata as any) || {}), native_build: buildResult },
        installer_url: buildResult.download_url ? `${hfUrl}${buildResult.download_url}` : project.installer_url,
      }).eq("id", project_id);
      if (tenantId !== "super_admin") updQ = updQ.eq("tenant_id", tenantId);
      await updQ;

      await supabase.from("memory_logs").insert({
        action: "native_build",
        details: { project_id, build_type, build_id: buildResult.build_id, success: buildResult.success },
      }).catch(() => {});

      return jsonResponse({
        success: true,
        build_type,
        build_id: buildResult.build_id,
        download_url: buildResult.download_url ? `${hfUrl}${buildResult.download_url}` : null,
        pipeline: ["generate → audit → fix → visual → native_build"],
      });
    }

    // === FULL-STACK BUILD (Web + Native) ===
    if (action === "full-stack-build") {
      const { description, framework, features, user_id, build_type, hf_space_url, app_name, package_name } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const sbResult = requireSupabase();
      if ("error" in sbResult) return sbResult.error;
      const supabase = sbResult.client;

      // Step 1: Auto-build web project (reuse auto-build logic inline)
      const aiModel = "google/gemini-2.5-pro";
      const genResult = await callAI([
        {
          role: "system",
          content: `Generate a COMPLETE project. Return JSON: {"project_name":"string","files":[{"path":"string","content":"string"}],"dependencies":[],"setup_commands":["npm install","npm run dev"]}
Framework: ${framework || "react with vite and tailwind"}. ${features ? `Features: ${features.join(", ")}` : ""}
Generate 15-40 files. Complete code, no TODOs. TypeScript strict.`,
        },
        { role: "user", content: description },
      ], false, aiModel);

      const projectData = parseJsonFromAI(genResult);
      if (!projectData?.files) return jsonResponse({ error: "Generation failed" }, 500);

      const projectName = projectData.project_name || "tivo-fullstack";
      const installers = generateInstallerScripts(projectName);
      projectData.files.push({ path: "setup.sh", content: installers["setup.sh"] });
      projectData.files.push({ path: "install.bat", content: installers["install.bat"] });

      // Save to DB
      const { data: saved } = await supabase.from("projects").insert({
        user_id: user_id || "system",
        tenant_id: tenantId === "super_admin" ? "tenant_main" : tenantId,
        name: projectName,
        description,
        files: projectData.files,
        status: "active",
        build_status: "live",
        build_metadata: { full_stack: true },
        version_history: [{ version: 1, timestamp: new Date().toISOString(), note: "Full-stack build" }],
      }).select().single();

      const result: any = {
        success: true,
        project_id: saved?.id,
        project_name: projectName,
        files_count: projectData.files.length,
      };

      if (saved?.id) {
        await uploadToStorage(supabase, saved.id, projectData.files);
        const { data: signed } = await supabase.storage.from("project-files").createSignedUrl(`${saved.id}/index.html`, 60 * 60 * 24 * 365);
        result.web_url = signed?.signedUrl || null;
        result.web_download_url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${saved.id}&format=zip`;
        await supabase.from("projects").update({ public_url: result.web_url, installer_url: result.web_download_url }).eq("id", saved.id);
      }

      // Step 2: Native build if requested
      if (build_type && hf_space_url && isSafeHfSpaceUrl(hf_space_url) && saved?.id) {
        try {
          const endpoint = build_type === "apk" ? "/api/build-apk" : "/api/build-exe";
          const hfUrl = hf_space_url.replace(/\/$/, "");
          const config = { app_name: app_name || projectName, package_name: package_name || "com.tivo.app" };

          const hfResponse = await fetch(`${hfUrl}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: projectData.files, config }),
          });

          if (hfResponse.ok) {
            const buildResult = await hfResponse.json();
            result.native_build = buildResult;
            result.native_download_url = buildResult.download_url ? `${hfUrl}${buildResult.download_url}` : null;
            await supabase.from("projects").update({
              build_metadata: { full_stack: true, native_build: buildResult },
              installer_url: result.native_download_url || result.web_download_url,
            }).eq("id", saved.id);
          } else {
            result.native_build_error = "HF Space build failed — web version is still available";
          }
        } catch (e) {
          result.native_build_error = `Native build failed: ${e instanceof Error ? e.message : "Unknown"} — web version is still available`;
        }
      }

      return jsonResponse(result);
    }

    // === GENERATE IMAGE (Logo, Banner, Post, etc.) ===
    if (action === "generate-image") {
      const { prompt, style, size, purpose } = body;
      if (!prompt) return jsonResponse({ error: "prompt required" }, 400);

      const enhancedPrompt = `${purpose ? `[${purpose}] ` : ""}${prompt}${style ? `. Style: ${style}` : ""}${size ? `. Dimensions: ${size}` : ""}`;
      
      const result = await callAI([
        { role: "user", content: enhancedPrompt },
      ], false, "google/gemini-2.5-flash-image", ["image", "text"]);

      if (typeof result === "object" && result.images?.length) {
        const imageData = result.images[0]?.image_url?.url || null;
        
        // Save to storage if project_id provided
        let storedUrl = null;
        if (body.project_id && imageData) {
          const sbResult = requireSupabase();
          if (!("error" in sbResult)) {
            const supabase = sbResult.client;
            const fileName = `${body.file_name || `image_${Date.now()}`}.png`;
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
            const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            await supabase.storage.from("project-files").upload(
              `${body.project_id}/${fileName}`, binaryData, { contentType: "image/png", upsert: true }
            ).catch(() => {});
            storedUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${body.project_id}/${fileName}`;
          }
        }

        return jsonResponse({
          success: true,
          image_base64: imageData,
          stored_url: storedUrl,
          description: result.text,
        });
      }
      return jsonResponse({ error: "Image generation failed", raw: typeof result === "string" ? result : null }, 500);
    }

    // === EDIT IMAGE ===
    if (action === "edit-image") {
      const { image_url, instruction } = body;
      if (!image_url || !instruction) return jsonResponse({ error: "image_url and instruction required" }, 400);

      const result = await callAI([
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: image_url } },
          ],
        },
      ], false, "google/gemini-2.5-flash-image", ["image", "text"]);

      if (typeof result === "object" && result.images?.length) {
        return jsonResponse({
          success: true,
          image_base64: result.images[0]?.image_url?.url || null,
          description: result.text,
        });
      }
      return jsonResponse({ error: "Image edit failed" }, 500);
    }

    // === PROCESS FILE (Analyze uploaded files — zip, image, code, etc.) ===
    if (action === "process-file") {
      const { file_content, file_type, file_name, instruction } = body;
      if (!file_content) return jsonResponse({ error: "file_content required (base64 or text)" }, 400);

      const messages: any[] = [
        {
          role: "system",
          content: `You are TIVO DEV AGENT File Processor. Analyze and process uploaded files.
File: ${file_name || "unknown"} (${file_type || "auto-detect"})
${instruction || "Analyze this file and provide a detailed summary."}
If it's code: review, fix, improve. If it's data: extract insights. If it's config: validate and optimize.
Return structured JSON when possible.`,
        },
      ];

      // If it's an image, use multimodal
      if (file_type?.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file_name || "")) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: instruction || "Analyze this image" },
            { type: "image_url", image_url: { url: file_content } },
          ],
        });
      } else {
        // Text-based file
        const textContent = file_content.length > 50000 ? file_content.slice(0, 50000) + "\n... (truncated)" : file_content;
        messages.push({ role: "user", content: textContent });
      }

      const result = await callAI(messages, false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, analysis: typeof result === "string" ? result : result.text || result, file_name });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 404);
  } catch (e) {
    console.error("AI Engine error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  } finally {
    releaseSlot();
  }
});
