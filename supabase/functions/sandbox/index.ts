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

async function callAI(messages: any[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("Rate limited");
    if (status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error: ${status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
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

    // === VALIDATE CODE (Static Analysis) ===
    if (action === "validate") {
      const { code, language, rules } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Code Validator. Analyze code for:
1. Syntax errors
2. Type errors
3. Logic bugs
4. Security vulnerabilities
5. Performance issues
${rules ? `Custom rules: ${rules}` : ""}
${language ? `Language: ${language}` : ""}

Return JSON:
{
  "valid": boolean,
  "score": 0-100,
  "errors": [{"line": number, "type": "error|warning|info", "message": "string", "fix": "string"}],
  "summary": "string"
}`,
        },
        { role: "user", content: code },
      ]);

      let parsed;
      try {
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result);
      } catch {
        parsed = { valid: true, score: 50, errors: [], summary: result };
      }

      return jsonResponse({ success: true, validation: parsed });
    }

    // === TEST GENERATION ===
    if (action === "generate-tests") {
      const { code, language, framework, test_framework } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Test Generator. Generate comprehensive test cases.
${language ? `Language: ${language}` : ""}
${framework ? `Framework: ${framework}` : ""}
${test_framework ? `Test framework: ${test_framework}` : "Use the standard test framework for the language."}

Generate:
1. Unit tests for every function
2. Edge case tests
3. Error handling tests
4. Integration tests if applicable

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
        // Fetch files from storage
        const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
        projectFiles = project?.files || [];
      }

      if (!projectFiles?.length) return jsonResponse({ error: "files or project_id required" }, 400);

      const filesSummary = projectFiles.map((f: any) =>
        typeof f === "string" ? f : `File: ${f.path}\n${f.content || "(stored in storage)"}`
      ).join("\n---\n");

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Project Auditor. Perform a complete project audit:

1. **Code Quality Score** (0-100)
2. **Security Audit** - XSS, injection, auth issues
3. **Performance Audit** - bundle size, rendering, memory
4. **Accessibility Audit** - ARIA, semantic HTML, contrast
5. **SEO Audit** - meta tags, structure
6. **Dependency Check** - outdated or vulnerable packages
7. **Architecture Review** - patterns, separation of concerns

Return JSON:
{
  "overall_score": 0-100,
  "security": {"score": 0-100, "issues": []},
  "performance": {"score": 0-100, "issues": []},
  "accessibility": {"score": 0-100, "issues": []},
  "seo": {"score": 0-100, "issues": []},
  "code_quality": {"score": 0-100, "issues": []},
  "recommendations": ["string"],
  "critical_fixes": ["string"]
}`,
        },
        { role: "user", content: filesSummary },
      ]);

      let parsed;
      try {
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result);
      } catch {
        parsed = { raw_audit: result };
      }

      // Log audit
      if (project_id) {
        await supabase.from("projects").update({ build_status: "audited", last_build_log: JSON.stringify(parsed).slice(0, 5000) }).eq("id", project_id);
      }

      return jsonResponse({ success: true, audit: parsed });
    }

    // === OPTIMIZE CODE ===
    if (action === "optimize") {
      const { code, language, focus } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Code Optimizer.
${language ? `Language: ${language}` : ""}
${focus ? `Optimization focus: ${focus}` : "Optimize for performance, readability, and best practices."}

Return the optimized code with explanations of changes.
Format:
**Changes Made:**
1. ...
2. ...

**Optimized Code:**
\`\`\`
...
\`\`\`

**Performance Impact:**
...`,
        },
        { role: "user", content: code },
      ]);

      return jsonResponse({ success: true, optimized: result });
    }

    // === EXECUTE COMMAND (General Purpose) ===
    if (action === "execute") {
      const { command, params, user_id } = body;
      if (!command) return jsonResponse({ error: "command required" }, 400);

      // Route to appropriate handler
      const result = await callAI([
        {
          role: "system",
          content: `You are TIVO AI OS Command Executor. You receive commands from TIVO AI OS and execute them.
The command is: "${command}"
Parameters: ${JSON.stringify(params || {})}

Process this command and return a structured response.
If the command involves code generation, generation complete code.
If it involves analysis, provide detailed analysis.
If it involves planning, create an actionable plan.
Always return JSON with: { "status": "success|error", "result": any, "message": "string" }`,
        },
        { role: "user", content: `Execute: ${command}\nParams: ${JSON.stringify(params || {})}` },
      ]);

      let parsed;
      try {
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result);
      } catch {
        parsed = { status: "success", result, message: "Command executed" };
      }

      // Log command
      await supabase.from("memory_logs").insert({
        user_id: user_id || null,
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
