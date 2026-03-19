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

async function callAI(messages: any[], model = "google/gemini-3-flash-preview") {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!response.ok) throw new Error(`AI gateway error: ${response.status}`);
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

    // === VALIDATE CODE ===
    if (action === "validate") {
      const { code, language, rules } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Code Validator. Analyze for syntax errors, type errors, logic bugs, security issues, performance.
${rules ? `Custom rules: ${rules}` : ""} ${language ? `Language: ${language}` : ""}
Return JSON: {"valid":boolean,"score":0-100,"errors":[{"line":0,"type":"error|warning","message":"string","fix":"string"}],"summary":"string"}`,
        },
        { role: "user", content: code },
      ]);

      return jsonResponse({ success: true, validation: parseJsonFromAI(result) || { valid: true, score: 50, summary: result } });
    }

    // === GENERATE TESTS ===
    if (action === "generate-tests") {
      const { code, language, framework, test_framework } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Test Generator. Generate comprehensive unit tests, edge case tests, error handling tests.
${language ? `Language: ${language}` : ""} ${framework ? `Framework: ${framework}` : ""} ${test_framework ? `Test framework: ${test_framework}` : ""}
Return complete, runnable test files.`,
        },
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
        {
          role: "system",
          content: `Project Auditor. Audit:
1. Code Quality (0-100) 2. Security 3. Performance 4. Accessibility 5. SEO 6. Architecture
Return JSON: {"overall_score":0-100,"security":{"score":0-100,"issues":[]},"performance":{"score":0-100,"issues":[]},"code_quality":{"score":0-100,"issues":[]},"recommendations":[],"critical_fixes":[]}`,
        },
        { role: "user", content: summary },
      ], "google/gemini-2.5-pro");

      const audit = parseJsonFromAI(result) || { raw_audit: result };
      if (project_id) {
        await supabase.from("projects").update({
          build_status: "audited",
          last_build_log: JSON.stringify(audit).slice(0, 5000),
        }).eq("id", project_id);
      }

      return jsonResponse({ success: true, audit });
    }

    // === OPTIMIZE CODE ===
    if (action === "optimize") {
      const { code, language, focus } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Code Optimizer. ${language ? `Language: ${language}` : ""} ${focus ? `Focus: ${focus}` : "Optimize for performance and readability."}
Return optimized code with explanations.`,
        },
        { role: "user", content: code },
      ]);

      return jsonResponse({ success: true, optimized: result });
    }

    // === AUTO TEST & FIX PIPELINE ===
    if (action === "auto-test-fix") {
      const { code, language, project_id, max_iterations } = body;
      if (!code && !project_id) return jsonResponse({ error: "code or project_id required" }, 400);

      let currentCode = code;
      if (!currentCode && project_id) {
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        const files = (project?.files as any[]) || [];
        currentCode = files.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      }

      const iterations = [];
      const maxIter = Math.min(max_iterations || 3, 5);

      for (let i = 0; i < maxIter; i++) {
        // Step 1: Find bugs
        const bugResult = await callAI([
          {
            role: "system",
            content: `Find ALL bugs, errors, and issues in this code. ${language ? `Language: ${language}` : ""}
Return JSON: {"has_issues":boolean,"issues":[{"severity":"critical|high|medium|low","description":"string","location":"string"}]}
If no issues, set has_issues to false.`,
          },
          { role: "user", content: currentCode },
        ]);

        const bugs = parseJsonFromAI(bugResult);
        if (!bugs?.has_issues) {
          iterations.push({ iteration: i + 1, status: "clean", message: "No issues found" });
          break;
        }

        // Step 2: Fix all bugs
        const fixResult = await callAI([
          {
            role: "system",
            content: `Fix ALL these issues in the code. Return ONLY the complete fixed code, nothing else.
Issues: ${JSON.stringify(bugs.issues)}`,
          },
          { role: "user", content: currentCode },
        ], "google/gemini-2.5-pro");

        currentCode = fixResult;
        iterations.push({
          iteration: i + 1,
          status: "fixed",
          issues_found: bugs.issues?.length || 0,
          issues: bugs.issues,
        });
      }

      // Update project if project_id provided
      if (project_id && currentCode) {
        await supabase.from("projects").update({
          last_build_log: JSON.stringify({ iterations }).slice(0, 5000),
          build_status: "tested",
        }).eq("id", project_id);
      }

      return jsonResponse({
        success: true,
        fixed_code: currentCode,
        iterations,
        total_iterations: iterations.length,
        final_status: iterations[iterations.length - 1]?.status || "unknown",
      });
    }

    // === EXECUTE COMMAND ===
    if (action === "execute") {
      const { command, params } = body;
      if (!command) return jsonResponse({ error: "command required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `Command Executor for TIVO AI OS. Command: "${command}", Params: ${JSON.stringify(params || {})}
Process and return JSON: {"status":"success|error","result":any,"message":"string"}`,
        },
        { role: "user", content: `Execute: ${command}` },
      ]);

      const parsed = parseJsonFromAI(result) || { status: "success", result, message: "Executed" };
      await supabase.from("memory_logs").insert({
        action: "command_executed",
        details: { command, params, result_preview: JSON.stringify(parsed).slice(0, 500) },
      });

      return jsonResponse({ success: true, ...parsed });
    }

    return jsonResponse({ error: `Unknown sandbox action: ${action}` }, 404);
  } catch (e) {
    console.error("Sandbox error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
