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

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MASTER_SECRET = Deno.env.get("MASTER_SECRET");
    const providedSecret = req.headers.get("x-master-secret");
    if (!MASTER_SECRET || providedSecret !== MASTER_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[pathParts.length - 1] || "";
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();

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

    // === AUTO BUILD & TEST PIPELINE ===
    if (action === "auto-build") {
      const { project_id, description, framework, features } = body;
      if (!description && !project_id) return jsonResponse({ error: "description or project_id required" }, 400);

      const steps: any[] = [];

      // Step 1: Generate project
      let projectFiles;
      if (project_id) {
        const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        projectFiles = project.files;
        steps.push({ step: "fetch_project", status: "done" });
      } else {
        const genResult = await callAI([
          {
            role: "system",
            content: `Generate a complete project as JSON: {"project_name":"string","files":[{"path":"string","content":"string"}],"dependencies":[],"setup_commands":[]}
Framework: ${framework || "react"}. ${features ? `Features: ${features.join(", ")}` : ""}
All code must be complete and production-ready.`,
          },
          { role: "user", content: description },
        ], false, "google/gemini-2.5-pro");

        projectFiles = parseJsonFromAI(genResult);
        steps.push({ step: "generate", status: "done", files_count: projectFiles?.files?.length || 0 });
      }

      // Step 2: Validate/audit each file
      const filesList = projectFiles?.files || projectFiles || [];
      const auditPrompt = filesList.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

      const auditResult = await callAI([
        {
          role: "system",
          content: `Audit this project. Find bugs, errors, security issues. For each issue provide the fix.
Return JSON: {"score":0-100,"issues":[{"file":"path","line":0,"severity":"critical|high|medium|low","message":"string","fix":"fixed code"}],"fixed_files":[{"path":"string","content":"complete fixed content"}]}
If no issues, return fixed_files with the original content.`,
        },
        { role: "user", content: auditPrompt },
      ], false, "google/gemini-2.5-pro");

      const audit = parseJsonFromAI(auditResult) || { score: 50, issues: [], fixed_files: filesList };
      steps.push({ step: "audit", status: "done", score: audit.score, issues_found: audit.issues?.length || 0 });

      // Step 3: Use fixed files
      const finalFiles = audit.fixed_files?.length ? audit.fixed_files : filesList;

      // Step 4: Store in database and storage
      let savedProject;
      if (project_id) {
        await supabase.from("projects").update({
          files: finalFiles,
          build_status: "built",
          last_build_log: JSON.stringify({ steps, audit: { score: audit.score, issues: audit.issues } }).slice(0, 5000),
        }).eq("id", project_id);
        savedProject = { id: project_id };
      } else {
        const { data } = await supabase.from("projects").insert({
          user_id: body.user_id || "system",
          name: projectFiles?.project_name || "Auto-built Project",
          description: description || "",
          files: finalFiles,
          status: "active",
          build_status: "built",
        }).select().single();
        savedProject = data;
      }

      // Step 5: Upload files to storage for hosting
      if (savedProject?.id && finalFiles?.length) {
        for (const file of finalFiles) {
          const content = new TextEncoder().encode(file.content);
          const ext = file.path.split(".").pop() || "txt";
          const contentTypes: Record<string, string> = {
            html: "text/html", css: "text/css", js: "application/javascript",
            json: "application/json", svg: "image/svg+xml", png: "image/png",
            ts: "application/javascript", tsx: "application/javascript", jsx: "application/javascript",
          };
          await supabase.storage.from("project-files").upload(
            `${savedProject.id}/${file.path}`,
            content,
            { contentType: contentTypes[ext] || "text/plain", upsert: true }
          );
        }

        const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${savedProject.id}/index.html`;
        await supabase.from("projects").update({
          public_url: publicUrl,
          build_status: "live",
        }).eq("id", savedProject.id);

        steps.push({ step: "deploy", status: "done", public_url: publicUrl });
      }

      return jsonResponse({
        success: true,
        project_id: savedProject?.id,
        steps,
        download_url: savedProject?.id
          ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/project-manager/download?id=${savedProject.id}`
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
