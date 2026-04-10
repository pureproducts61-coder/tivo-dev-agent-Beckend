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

function checkSupabaseConnection() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("CONNECTION_ERROR: Missing Supabase credentials");
  return createClient(url, key);
}

async function callAI(messages: any[], stream = false, model = "google/gemini-3-flash-preview") {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limited - try again later");
    if (response.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error: ${response.status}`);
  }

  if (stream) return response;
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJsonFromAI(result: string) {
  try {
    const m = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? (m[1] || m[0]) : result);
  } catch { return null; }
}

function generateInstallerScripts(projectName: string, framework: string) {
  const setupSh = `#!/bin/bash
echo "========================================="
echo "  ${projectName} — Auto Installer"
echo "  Powered by TIVO DEV AGENT"
echo "========================================="
echo ""

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

echo ""
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
echo.

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

echo.
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
    const MASTER_SECRET = Deno.env.get("MASTER_SECRET");
    const providedSecret = req.headers.get("x-master-secret");
    if (!MASTER_SECRET || providedSecret !== MASTER_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let supabase: any;
    try { supabase = checkSupabaseConnection(); }
    catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : "Connection Error", alert: "ADMIN_CONNECTION_ERROR" }, 503); }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";
    const body = await req.json().catch(() => ({}));

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
- If generating a full project, include ALL necessary files
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
        {
          role: "system",
          content: `You are TIVO DEV AGENT Code Reviewer. Deep analysis:
1. **Security** — XSS, injection, auth bypass, data exposure
2. **Performance** — bottlenecks, memory leaks, unnecessary re-renders
3. **Architecture** — SOLID principles, clean code, separation of concerns
4. **Bug Detection** — logic errors, edge cases, race conditions
5. **Suggestions** — concrete improvements with code examples
${focus ? `Focus area: ${focus}` : ""} ${language ? `Language: ${language}` : ""}
Provide specific line references and working fix code.`,
        },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, review: result });
    }

    // === BUG FIX ===
    if (action === "fix") {
      const { code, error_message, language } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO DEV AGENT Bug Fixer.
1. Identify root cause precisely
2. Explain the bug clearly
3. Provide COMPLETE fixed code (not patches)
4. List all changes made
${language ? `Language: ${language}` : ""}
CRITICAL: The output must be immediately runnable.`,
        },
        { role: "user", content: `Code:\n\`\`\`\n${code}\n\`\`\`\n${error_message ? `\nError: ${error_message}` : ""}` },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, fix: result });
    }

    // === MULTI-FILE PROJECT GENERATION ===
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
- Generate COMPLETE, WORKING files — no TODOs, no placeholders, no "..."
- Include package.json with ALL dependencies and proper scripts
- Include README.md with setup instructions
- Include all config files (tsconfig, vite.config, tailwind.config, etc.)
- Handle error states, loading states, empty states
- Responsive design (mobile-first)
- Proper TypeScript types
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

    // === AUTONOMOUS BUILD PIPELINE (Enhanced v5) ===
    if (action === "auto-build") {
      const { project_id, description, framework, features, user_id, quality_target, model: preferredModel } = body;
      if (!description && !project_id) return jsonResponse({ error: "description or project_id required" }, 400);

      const steps: any[] = [];
      const startTime = Date.now();
      const targetScore = quality_target || 90;
      const aiModel = preferredModel || "google/gemini-2.5-pro";

      // Step 1: Generate or fetch project
      let projectFiles: any;
      let projectName: string;
      if (project_id) {
        const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
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
- Include public/index.html or index.html entry point
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
Fix ALL issues — return COMPLETE file content, not patches.
If perfect, return score 100 with original files.`,
        },
        { role: "user", content: auditPrompt },
      ], false, aiModel);

      const audit = parseJsonFromAI(auditResult) || { score: 50, issues: [], fixed_files: filesList };
      steps.push({ step: "audit", status: "done", score: audit.score, issues_found: audit.issues?.length || 0 });

      let finalFiles = audit.fixed_files?.length ? audit.fixed_files : filesList;
      let currentScore = audit.score || 50;

      // Step 3: Iterative Auto-Fix (up to 5 passes until target score)
      for (let i = 0; i < 5 && currentScore < targetScore; i++) {
        const reauditPrompt = finalFiles.slice(0, 25).map((f: any) => `--- ${f.path} ---\n${(f.content || "").slice(0, 2500)}`).join("\n\n");
        const reauditResult = await callAI([
          {
            role: "system",
            content: `Re-audit pass ${i + 1}. Target score: ${targetScore}. Current: ${currentScore}.
Fix ALL remaining issues. Return JSON: {"score":0-100,"fixed_files":[{"path":"string","content":"COMPLETE content"}],"changes_made":["description"]}
MUST return complete file content for every file that changed.`,
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
      const uiFiles = finalFiles.filter((f: any) => /\.(html|tsx|jsx|css|vue|svelte)$/.test(f.path));
      if (uiFiles.length > 0) {
        const visualPrompt = uiFiles.slice(0, 15).map((f: any) => `--- ${f.path} ---\n${(f.content || "").slice(0, 2000)}`).join("\n\n");
        const visualResult = await callAI([
          {
            role: "system",
            content: `TIVO DEV AGENT Visual Auditor. Analyze UI code as if you see the rendered output.
Check: layout, spacing, responsive, colors, contrast, typography, accessibility, polish.
Return JSON: {"ui_score":0-100,"visual_issues":[{"file":"path","issue":"string","fix":"string"}],"fixed_files":[{"path":"string","content":"COMPLETE fixed content"}]}`,
          },
          { role: "user", content: visualPrompt },
        ], false, aiModel);

        const visualAudit = parseJsonFromAI(visualResult);
        if (visualAudit?.fixed_files?.length) {
          for (const vf of visualAudit.fixed_files) {
            const idx = finalFiles.findIndex((f: any) => f.path === vf.path);
            if (idx >= 0) finalFiles[idx] = vf;
          }
        }
        steps.push({ step: "visual_audit", ui_score: visualAudit?.ui_score || 0 });
      }

      // Step 5: Generate installers
      const installers = generateInstallerScripts(projectName!, framework || "react");
      finalFiles = finalFiles.filter((f: any) => f.path !== "setup.sh" && f.path !== "install.bat");
      finalFiles.push({ path: "setup.sh", content: installers["setup.sh"] });
      finalFiles.push({ path: "install.bat", content: installers["install.bat"] });
      steps.push({ step: "generate_installers", status: "done" });

      // Step 6: Save to DB & Storage
      let savedProject: any;
      if (project_id) {
        await supabase.from("projects").update({
          files: finalFiles,
          build_status: "built",
          build_metadata: { steps, audit_score: currentScore, build_time_ms: Date.now() - startTime, file_count: finalFiles.length },
          last_build_log: JSON.stringify({ steps, score: currentScore }).slice(0, 5000),
        }).eq("id", project_id);
        savedProject = { id: project_id };
      } else {
        const { data } = await supabase.from("projects").insert({
          user_id: user_id || "system",
          name: projectName!,
          description: description || "",
          files: finalFiles,
          status: "active",
          build_status: "built",
          build_metadata: { steps, audit_score: currentScore, build_time_ms: Date.now() - startTime, file_count: finalFiles.length },
        }).select().single();
        savedProject = data;
      }

      if (savedProject?.id) {
        await uploadToStorage(supabase, savedProject.id, finalFiles);
        const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${savedProject.id}/index.html`;
        const installerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${savedProject.id}&format=zip`;
        await supabase.from("projects").update({ public_url: publicUrl, installer_url: installerUrl, build_status: "live" }).eq("id", savedProject.id);
        steps.push({ step: "deploy", public_url: publicUrl });
        await saveVersion(supabase, savedProject.id, finalFiles, `Auto-build: ${description || "rebuild"}`);
      }

      await supabase.from("memory_logs").insert({
        action: "auto_build_complete",
        details: { project_id: savedProject?.id, description, score: currentScore, files_count: finalFiles.length, build_time_ms: Date.now() - startTime },
      });

      return jsonResponse({
        success: true,
        project_id: savedProject?.id,
        project_name: projectName!,
        audit_score: currentScore,
        steps,
        files_count: finalFiles.length,
        build_time_ms: Date.now() - startTime,
        download_url: savedProject?.id ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${savedProject.id}&format=zip` : null,
        public_url: steps.find((s: any) => s.public_url)?.public_url || null,
      });
    }

    // === BUILD NATIVE (APK/EXE) — Orchestrates HF Space Build Engine ===
    if (action === "build-native") {
      const { project_id, build_type, hf_space_url, app_name, package_name } = body;
      if (!project_id) return jsonResponse({ error: "project_id required" }, 400);
      if (!build_type || !["apk", "exe"].includes(build_type)) return jsonResponse({ error: "build_type must be 'apk' or 'exe'" }, 400);
      if (!hf_space_url) return jsonResponse({ error: "hf_space_url required (your HF Space URL)" }, 400);

      const startTime = Date.now();
      const pipeline: any[] = [];

      // 1. Fetch project files
      const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
      if (!project) return jsonResponse({ error: "Project not found" }, 404);

      let files = (project.files as any[]) || [];
      pipeline.push({ step: "fetch_files", count: files.length });

      // 2. If files don't have content (only URLs), download them
      if (files.length === 0 || (!files[0]?.content && files[0]?.url)) {
        const { data: storageFiles } = await supabase.storage.from("project-files").list(project_id, { limit: 500 });
        if (storageFiles?.length) {
          const downloadedFiles = [];
          for (const sf of storageFiles) {
            if (!sf.id) continue;
            const { data: fileData } = await supabase.storage.from("project-files").download(`${project_id}/${sf.name}`);
            if (fileData) {
              downloadedFiles.push({ path: sf.name, content: await fileData.text() });
            }
          }
          files = downloadedFiles;
          pipeline.push({ step: "download_from_storage", count: files.length });
        }
      }

      if (files.length === 0) return jsonResponse({ error: "No files found for this project" }, 400);

      // 3. Ensure project has proper structure for native build
      const hasPackageJson = files.some((f: any) => f.path === "package.json");
      if (!hasPackageJson) {
        // AI generates a proper package.json
        const pkgResult = await callAI([
          {
            role: "system",
            content: `Generate a package.json for this project. Analyze the files and determine dependencies.
Return ONLY valid JSON for package.json. Include all needed dependencies, scripts (dev, build, start).`,
          },
          { role: "user", content: files.slice(0, 10).map((f: any) => `--- ${f.path} ---\n${(f.content || "").slice(0, 500)}`).join("\n\n") },
        ]);
        const pkgContent = parseJsonFromAI(pkgResult);
        if (pkgContent) {
          files.push({ path: "package.json", content: JSON.stringify(pkgContent, null, 2) });
          pipeline.push({ step: "generate_package_json" });
        }
      }

      // 4. Call HF Space Build Engine
      const buildEndpoint = build_type === "apk" ? "/api/build-apk" : "/api/build-exe";
      const buildConfig: any = { app_name: app_name || project.name || "TivoApp" };
      if (build_type === "apk" && package_name) buildConfig.package_name = package_name;

      pipeline.push({ step: "calling_hf_build", endpoint: buildEndpoint, files_sent: files.length });

      try {
        const buildResp = await fetch(`${hf_space_url.replace(/\/$/, "")}${buildEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files, config: buildConfig }),
        });

        if (!buildResp.ok) {
          const errText = await buildResp.text();
          pipeline.push({ step: "hf_build_error", status: buildResp.status, error: errText });
          return jsonResponse({ success: false, error: `HF Build failed: ${errText}`, pipeline }, 500);
        }

        const buildResult = await buildResp.json();
        pipeline.push({ step: "build_complete", result: buildResult });

        // 5. Update project with build info
        const downloadUrl = buildResult.download_url ? `${hf_space_url.replace(/\/$/, "")}${buildResult.download_url}` : null;
        await supabase.from("projects").update({
          build_status: `${build_type}_built`,
          build_metadata: {
            ...(project.build_metadata || {}),
            native_build: {
              type: build_type,
              build_id: buildResult.build_id,
              download_url: downloadUrl,
              built_at: new Date().toISOString(),
              build_time_ms: Date.now() - startTime,
            },
          },
          installer_url: downloadUrl || project.installer_url,
        }).eq("id", project_id);

        await supabase.from("memory_logs").insert({
          action: `native_${build_type}_built`,
          details: { project_id, build_id: buildResult.build_id, download_url: downloadUrl, build_time_ms: Date.now() - startTime },
        });

        return jsonResponse({
          success: true,
          build_type,
          build_id: buildResult.build_id,
          download_url: downloadUrl,
          pipeline,
          build_time_ms: Date.now() - startTime,
        });
      } catch (fetchErr) {
        pipeline.push({ step: "hf_connection_error", error: fetchErr instanceof Error ? fetchErr.message : "Unknown" });
        return jsonResponse({
          success: false,
          error: `Cannot connect to HF Build Engine: ${fetchErr instanceof Error ? fetchErr.message : "Unknown error"}`,
          hint: "Make sure your HF Space is running and the URL is correct",
          pipeline,
        }, 502);
      }
    }

    // === FULL STACK BUILD (Generate + Build Native in one call) ===
    if (action === "full-stack-build") {
      const { description, framework, features, user_id, build_type, hf_space_url, app_name, package_name } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const startTime = Date.now();

      // 1. Auto-build the web project first
      const autoBuildResp = await fetch(req.url.replace("full-stack-build", "auto-build"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-master-secret": req.headers.get("x-master-secret") || "",
        },
        body: JSON.stringify({ description, framework, features, user_id }),
      });

      const autoBuild = await autoBuildResp.json();
      if (!autoBuild.success || !autoBuild.project_id) {
        return jsonResponse({ success: false, error: "Auto-build failed", auto_build_result: autoBuild }, 500);
      }

      const result: any = {
        success: true,
        project_id: autoBuild.project_id,
        project_name: autoBuild.project_name,
        audit_score: autoBuild.audit_score,
        web_url: autoBuild.public_url,
        web_download_url: autoBuild.download_url,
      };

      // 2. If native build requested and HF Space URL provided
      if (build_type && hf_space_url) {
        const nativeBuildResp = await fetch(req.url.replace("full-stack-build", "build-native"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-master-secret": req.headers.get("x-master-secret") || "",
          },
          body: JSON.stringify({
            project_id: autoBuild.project_id,
            build_type,
            hf_space_url,
            app_name: app_name || autoBuild.project_name,
            package_name,
          }),
        });

        const nativeBuild = await nativeBuildResp.json();
        result.native_build = nativeBuild;
        result.native_download_url = nativeBuild.download_url;
      }

      result.total_build_time_ms = Date.now() - startTime;
      return jsonResponse(result);
    }

    // === REFACTOR CODE ===
    if (action === "refactor") {
      const { code, language, goal } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `TIVO DEV AGENT Code Refactorer. ${language ? `Language: ${language}` : ""}
${goal ? `Goal: ${goal}` : "Improve readability, performance, and maintainability."}
Return the COMPLETE refactored code with explanations of changes.
Apply: DRY, SOLID, clean code principles, modern patterns.`,
        },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, refactored: result });
    }

    // === CONVERT/MIGRATE CODE ===
    if (action === "convert") {
      const { code, from_language, to_language, from_framework, to_framework } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `TIVO DEV AGENT Code Converter.
${from_language ? `From: ${from_language}` : ""} ${to_language ? `To: ${to_language}` : ""}
${from_framework ? `From framework: ${from_framework}` : ""} ${to_framework ? `To framework: ${to_framework}` : ""}
Return COMPLETE converted code. Maintain all functionality. Use idiomatic patterns for the target.`,
        },
        { role: "user", content: code },
      ], false, "google/gemini-2.5-pro");
      return jsonResponse({ success: true, converted: result });
    }

    // === GENERATE API ===
    if (action === "generate-api") {
      const { description, endpoints, database_schema, auth_type } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `TIVO DEV AGENT API Builder. Generate a complete REST API.
${endpoints ? `Endpoints: ${JSON.stringify(endpoints)}` : ""}
${database_schema ? `Database: ${JSON.stringify(database_schema)}` : ""}
${auth_type ? `Auth: ${auth_type}` : "JWT auth"}
Return JSON: {"files":[{"path":"string","content":"string"}],"endpoints":[{"method":"string","path":"string","description":"string"}],"setup":"string"}
Include: routes, controllers, middleware, models, validation, error handling.`,
        },
        { role: "user", content: description },
      ], false, "google/gemini-2.5-pro");

      return jsonResponse({ success: true, api: parseJsonFromAI(result) || { raw: result } });
    }

    // === GENERATE DOCUMENTATION ===
    if (action === "generate-docs") {
      const { code, project_id, doc_type } = body;

      let codeToDoc = code;
      if (!codeToDoc && project_id) {
        const { data: project } = await supabase.from("projects").select("files, name, description").eq("id", project_id).single();
        if (project?.files) {
          codeToDoc = (project.files as any[]).map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        }
      }
      if (!codeToDoc) return jsonResponse({ error: "code or project_id required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Generate ${doc_type || "comprehensive"} documentation in Markdown.
Include: overview, setup, API reference, component docs, examples, troubleshooting.`,
        },
        { role: "user", content: codeToDoc },
      ], false, "google/gemini-2.5-pro");

      return jsonResponse({ success: true, documentation: result });
    }

    return jsonResponse({ error: `Unknown AI action: ${action}` }, 404);
  } catch (e) {
    console.error("AI Engine error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  } finally {
    releaseSlot();
  }
});
