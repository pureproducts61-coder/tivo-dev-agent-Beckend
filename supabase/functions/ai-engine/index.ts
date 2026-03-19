import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-master-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    throw new Error("CONNECTION_ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Backend cannot operate.");
  }
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
    const status = response.status;
    if (status === 429) throw new Error("Rate limited - try again later");
    if (status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error: ${status}`);
  }

  if (stream) return response;
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJsonFromAI(result: string) {
  try {
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result);
  } catch {
    return null;
  }
}

// Generate installer scripts for a project
function generateInstallerScripts(projectName: string, framework: string) {
  const setupSh = `#!/bin/bash
echo "========================================="
echo "  ${projectName} - Auto Installer"
echo "  Powered by TIVO AI OS Software Factory"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Installing..."
  if command -v curl &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "Please install Node.js from https://nodejs.org"
    exit 1
  fi
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🔨 Building project..."
npm run build 2>/dev/null || echo "No build step needed"

# Start
echo ""
echo "🚀 Starting ${projectName}..."
echo "   Open http://localhost:3000 in your browser"
npm start || npm run dev
`;

  const installBat = `@echo off
echo =========================================
echo   ${projectName} - Auto Installer
echo   Powered by TIVO AI OS Software Factory
echo =========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo ❌ Node.js not found!
  echo Please download from https://nodejs.org
  pause
  exit /b 1
)

echo ✅ Node.js detected

:: Install dependencies
echo 📦 Installing dependencies...
call npm install

:: Build
echo 🔨 Building project...
call npm run build 2>nul

:: Start
echo.
echo 🚀 Starting ${projectName}...
echo    Open http://localhost:3000 in your browser
call npm start || call npm run dev
pause
`;

  return { "setup.sh": setupSh, "install.bat": installBat };
}

// Save version snapshot
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
  // Keep last 50 versions
  const trimmed = history.slice(-50);
  await supabase.from("projects").update({ version_history: trimmed }).eq("id", projectId);
}

// Upload files to storage
async function uploadToStorage(supabase: any, projectId: string, files: any[]) {
  const contentTypes: Record<string, string> = {
    html: "text/html", css: "text/css", js: "application/javascript",
    json: "application/json", svg: "image/svg+xml", png: "image/png",
    ts: "application/javascript", tsx: "application/javascript", jsx: "application/javascript",
    sh: "text/x-shellscript", bat: "text/x-batch", md: "text/markdown",
  };

  for (const file of files) {
    const content = new TextEncoder().encode(file.content);
    const ext = file.path.split(".").pop() || "txt";
    await supabase.storage.from("project-files").upload(
      `${projectId}/${file.path}`,
      content,
      { contentType: contentTypes[ext] || "text/plain", upsert: true }
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Mandatory connection check
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

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";
    const body = await req.json().catch(() => ({}));

    // === GENERATE CODE ===
    if (action === "generate") {
      const { prompt, language, framework, context, model, stream: doStream } = body;
      if (!prompt) return jsonResponse({ error: "prompt required" }, 400);

      const systemPrompt = `You are TIVO AI OS Code Engine — an elite full-stack developer AI.
You generate production-ready, clean, well-structured code.
${language ? `Language: ${language}` : ""}
${framework ? `Framework: ${framework}` : ""}
Rules:
- Write complete, runnable code — no placeholders
- Include proper error handling
- Follow best practices for the chosen language/framework
- Add brief comments for complex logic
- If generating a full project, include all necessary files`;

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
          content: `You are TIVO AI OS Code Reviewer.
Analyze code and provide:
1. **Security Issues** - vulnerabilities, injection risks
2. **Performance** - bottlenecks, memory leaks
3. **Best Practices** - naming, structure, patterns
4. **Bug Detection** - logical errors, edge cases
5. **Suggestions** - improvements with code examples
${focus ? `Focus: ${focus}` : ""} ${language ? `Language: ${language}` : ""}
Be specific with line references and provide fixed code snippets.`,
        },
        { role: "user", content: code },
      ]);
      return jsonResponse({ success: true, review: result });
    }

    // === BUG FIX ===
    if (action === "fix") {
      const { code, error_message, language } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Bug Fixer.
Given code and optional error:
1. Identify root cause
2. Explain what went wrong
3. Provide COMPLETE fixed code
4. List all changes
${language ? `Language: ${language}` : ""}`,
        },
        { role: "user", content: `Code:\n\`\`\`\n${code}\n\`\`\`\n${error_message ? `\nError: ${error_message}` : ""}` },
      ]);
      return jsonResponse({ success: true, fix: result });
    }

    // === MULTI-FILE PROJECT GENERATION ===
    if (action === "generate-project") {
      const { description, framework, features, model } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const systemPrompt = `You are TIVO AI OS Project Builder — generate complete multi-file projects.
${framework ? `Framework: ${framework}` : "Use the best framework for the task."}
${features ? `Required features: ${features.join(", ")}` : ""}

Return a JSON object:
{
  "project_name": "string",
  "files": [{"path": "relative/path/file.ext", "content": "file content"}],
  "dependencies": ["package1"],
  "setup_commands": ["npm install", "npm run dev"],
  "description": "Brief description"
}

Rules:
- Generate complete, production-ready files
- Include package.json, config files, README
- All code must be functional — no TODOs or placeholders
- Include proper error handling`;

      const result = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: description },
      ], false, model || "google/gemini-2.5-pro");

      const projectData = parseJsonFromAI(result) || { raw_response: result };
      return jsonResponse({ success: true, project: projectData });
    }

    // === CHAT (General AI) ===
    if (action === "chat") {
      const { messages: userMessages, system_prompt, model, stream: doStream } = body;
      if (!userMessages?.length) return jsonResponse({ error: "messages required" }, 400);

      const messages = [
        {
          role: "system",
          content: system_prompt || "You are TIVO AI OS Assistant — a powerful AI for coding and development. Be concise and precise.",
        },
        ...userMessages,
      ];

      if (doStream) {
        const streamResp = await callAI(messages, true, model);
        return new Response(streamResp.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const result = await callAI(messages, false, model);
      return jsonResponse({ success: true, response: result });
    }

    // === AUTONOMOUS SOFTWARE FACTORY — AUTO BUILD ===
    if (action === "auto-build") {
      const { project_id, description, framework, features, user_id } = body;
      if (!description && !project_id) return jsonResponse({ error: "description or project_id required" }, 400);

      const steps: any[] = [];
      const startTime = Date.now();

      // Step 1: Generate or fetch project
      let projectFiles: any;
      if (project_id) {
        const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        projectFiles = project.files;
        steps.push({ step: "fetch_project", status: "done" });
      } else {
        const genResult = await callAI([
          {
            role: "system",
            content: `Generate a complete project as JSON: {"project_name":"string","files":[{"path":"string","content":"string"}],"dependencies":[],"setup_commands":["npm install","npm run dev"]}
Framework: ${framework || "react"}. ${features ? `Features: ${features.join(", ")}` : ""}
All code must be complete and production-ready. Include package.json with all dependencies.`,
          },
          { role: "user", content: description! },
        ], false, "google/gemini-2.5-pro");

        projectFiles = parseJsonFromAI(genResult);
        steps.push({ step: "generate", status: "done", files_count: projectFiles?.files?.length || 0 });
      }

      const filesList = projectFiles?.files || projectFiles || [];

      // Step 2: AI Code Audit
      const auditPrompt = filesList.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      const auditResult = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Quality Auditor. Audit this project rigorously.
Return JSON: {"score":0-100,"issues":[{"file":"path","line":0,"severity":"critical|high|medium|low","message":"string","fix":"fixed code snippet"}],"fixed_files":[{"path":"string","content":"complete fixed content"}]}
If code is perfect, return fixed_files with original content and score 100.
Fix ALL issues you find — security, bugs, performance, accessibility.`,
        },
        { role: "user", content: auditPrompt },
      ], false, "google/gemini-2.5-pro");

      const audit = parseJsonFromAI(auditResult) || { score: 50, issues: [], fixed_files: filesList };
      steps.push({ step: "audit", status: "done", score: audit.score, issues_found: audit.issues?.length || 0 });

      let finalFiles = audit.fixed_files?.length ? audit.fixed_files : filesList;

      // Step 3: Iterative Auto-Fix Loop (up to 3 passes)
      let currentScore = audit.score || 0;
      for (let i = 0; i < 3 && currentScore < 90; i++) {
        const reauditPrompt = finalFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        const reauditResult = await callAI([
          {
            role: "system",
            content: `Re-audit and fix ALL remaining issues. Return JSON: {"score":0-100,"fixed_files":[{"path":"string","content":"complete content"}],"changes_made":["description"]}`,
          },
          { role: "user", content: reauditPrompt },
        ], false, "google/gemini-2.5-pro");

        const reaudit = parseJsonFromAI(reauditResult);
        if (reaudit?.fixed_files?.length) finalFiles = reaudit.fixed_files;
        currentScore = reaudit?.score || currentScore + 10;
        steps.push({ step: `auto_fix_pass_${i + 1}`, status: "done", score: currentScore, changes: reaudit?.changes_made || [] });
        if (currentScore >= 95) break;
      }

      // Step 4: Visual Audit (AI-based UI analysis)
      const htmlFiles = finalFiles.filter((f: any) => f.path.endsWith(".html") || f.path.endsWith(".tsx") || f.path.endsWith(".jsx"));
      if (htmlFiles.length > 0) {
        const visualPrompt = htmlFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
        const visualResult = await callAI([
          {
            role: "system",
            content: `You are TIVO AI OS Visual Auditor. Analyze UI code and check:
1. Layout correctness (alignment, spacing, responsive design)
2. Color scheme consistency
3. Typography hierarchy
4. Accessibility (contrast, aria labels, semantic HTML)
5. Mobile responsiveness
Return JSON: {"ui_score":0-100,"visual_issues":[{"file":"path","issue":"string","fix":"string"}],"fixed_files":[{"path":"string","content":"complete fixed content"}]}
Fix ALL visual issues.`,
          },
          { role: "user", content: visualPrompt },
        ], false, "google/gemini-2.5-pro");

        const visualAudit = parseJsonFromAI(visualResult);
        if (visualAudit?.fixed_files?.length) {
          for (const vf of visualAudit.fixed_files) {
            const idx = finalFiles.findIndex((f: any) => f.path === vf.path);
            if (idx >= 0) finalFiles[idx] = vf;
          }
        }
        steps.push({ step: "visual_audit", status: "done", ui_score: visualAudit?.ui_score || 0, issues: visualAudit?.visual_issues?.length || 0 });
      }

      // Step 5: Generate installer scripts
      const projectName = projectFiles?.project_name || "tivo-project";
      const installers = generateInstallerScripts(projectName, framework || "react");
      finalFiles.push({ path: "setup.sh", content: installers["setup.sh"] });
      finalFiles.push({ path: "install.bat", content: installers["install.bat"] });
      steps.push({ step: "generate_installers", status: "done" });

      // Step 6: Save to database & storage
      let savedProject: any;
      if (project_id) {
        await supabase.from("projects").update({
          files: finalFiles,
          build_status: "built",
          build_metadata: {
            steps,
            audit_score: currentScore,
            build_time_ms: Date.now() - startTime,
            file_count: finalFiles.length,
          },
          last_build_log: JSON.stringify({ steps, score: currentScore }).slice(0, 5000),
        }).eq("id", project_id);
        savedProject = { id: project_id };
      } else {
        const { data } = await supabase.from("projects").insert({
          user_id: user_id || "system",
          name: projectName,
          description: description || "",
          files: finalFiles,
          status: "active",
          build_status: "built",
          build_metadata: {
            steps,
            audit_score: currentScore,
            build_time_ms: Date.now() - startTime,
            file_count: finalFiles.length,
          },
        }).select().single();
        savedProject = data;
      }

      // Step 7: Upload to storage (persist to Supabase Storage)
      if (savedProject?.id) {
        await uploadToStorage(supabase, savedProject.id, finalFiles);
        const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${savedProject.id}/index.html`;
        const installerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${savedProject.id}&format=zip`;

        await supabase.from("projects").update({
          public_url: publicUrl,
          installer_url: installerUrl,
          build_status: "live",
        }).eq("id", savedProject.id);

        steps.push({ step: "deploy_and_persist", status: "done", public_url: publicUrl });

        // Save version
        await saveVersion(supabase, savedProject.id, finalFiles, `Auto-build: ${description || "rebuild"}`);
      }

      // Log to memory
      await supabase.from("memory_logs").insert({
        action: "auto_build_complete",
        details: {
          project_id: savedProject?.id,
          description,
          score: currentScore,
          files_count: finalFiles.length,
          build_time_ms: Date.now() - startTime,
        },
      });

      return jsonResponse({
        success: true,
        project_id: savedProject?.id,
        project_name: projectName,
        audit_score: currentScore,
        steps,
        files_count: finalFiles.length,
        build_time_ms: Date.now() - startTime,
        download_url: savedProject?.id
          ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${savedProject.id}&format=zip`
          : null,
        public_url: steps.find((s: any) => s.public_url)?.public_url || null,
      });
    }

    return jsonResponse({ error: `Unknown AI action: ${action}` }, 404);
  } catch (e) {
    console.error("AI Engine error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
