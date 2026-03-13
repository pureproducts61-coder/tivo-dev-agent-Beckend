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

async function callAI(messages: any[], stream = false) {
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
      stream,
    }),
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
      const { prompt, language, framework, context, user_id, stream: doStream } = body;
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

      // Deduct credits if user_id provided
      if (user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits, is_blocked")
          .eq("user_id", user_id)
          .single();
        if (profile?.is_blocked) return jsonResponse({ error: "Account blocked" }, 403);
        if (profile && profile.credits < 2) return jsonResponse({ error: "Insufficient credits", credits: profile.credits }, 402);

        await supabase.from("profiles").update({ credits: profile!.credits - 2 }).eq("user_id", user_id);
        await supabase.from("memory_logs").insert({
          user_id,
          action: "ai_generate",
          details: { prompt: prompt.slice(0, 200), cost: 2 },
        });
      }

      if (doStream) {
        const streamResp = await callAI(messages, true);
        return new Response(streamResp.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const result = await callAI(messages);
      return jsonResponse({ success: true, code: result });
    }

    // === CODE REVIEW ===
    if (action === "review") {
      const { code, language, focus, user_id } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const systemPrompt = `You are TIVO AI OS Code Reviewer — a senior code review AI.
Analyze the given code and provide:
1. **Security Issues** - vulnerabilities, injection risks
2. **Performance** - bottlenecks, memory leaks, optimization
3. **Best Practices** - naming, structure, patterns
4. **Bug Detection** - logical errors, edge cases
5. **Suggestions** - improvements with code examples
${focus ? `Focus area: ${focus}` : ""}
${language ? `Language: ${language}` : ""}
Be specific with line references and provide fixed code snippets.`;

      if (user_id) {
        const { data: profile } = await supabase.from("profiles").select("credits, is_blocked").eq("user_id", user_id).single();
        if (profile?.is_blocked) return jsonResponse({ error: "Account blocked" }, 403);
        if (profile && profile.credits < 1) return jsonResponse({ error: "Insufficient credits" }, 402);
        await supabase.from("profiles").update({ credits: profile!.credits - 1 }).eq("user_id", user_id);
      }

      const result = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: code },
      ]);
      return jsonResponse({ success: true, review: result });
    }

    // === BUG FIX ===
    if (action === "fix") {
      const { code, error_message, language, user_id } = body;
      if (!code) return jsonResponse({ error: "code required" }, 400);

      const systemPrompt = `You are TIVO AI OS Bug Fixer — an expert debugging AI.
Given code and an optional error message:
1. Identify the root cause of the bug
2. Explain what went wrong
3. Provide the COMPLETE fixed code
4. List all changes made
${language ? `Language: ${language}` : ""}
Return response in this format:
**Root Cause:** ...
**Explanation:** ...
**Fixed Code:** \`\`\`...
**Changes Made:** ...`;

      if (user_id) {
        const { data: profile } = await supabase.from("profiles").select("credits, is_blocked").eq("user_id", user_id).single();
        if (profile?.is_blocked) return jsonResponse({ error: "Account blocked" }, 403);
        if (profile && profile.credits < 2) return jsonResponse({ error: "Insufficient credits" }, 402);
        await supabase.from("profiles").update({ credits: profile!.credits - 2 }).eq("user_id", user_id);
      }

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Code:\n\`\`\`\n${code}\n\`\`\`\n${error_message ? `\nError: ${error_message}` : ""}` },
      ];

      const result = await callAI(messages);
      return jsonResponse({ success: true, fix: result });
    }

    // === MULTI-FILE PROJECT GENERATION ===
    if (action === "generate-project") {
      const { description, framework, features, user_id } = body;
      if (!description) return jsonResponse({ error: "description required" }, 400);

      const systemPrompt = `You are TIVO AI OS Project Builder — you generate complete multi-file projects.
Given a project description, generate ALL files needed for a working project.
${framework ? `Framework: ${framework}` : "Use the best framework for the task."}
${features ? `Required features: ${features.join(", ")}` : ""}

Return a JSON object with this exact structure:
{
  "project_name": "string",
  "files": [
    { "path": "relative/path/to/file.ext", "content": "file content here" }
  ],
  "dependencies": ["package1", "package2"],
  "setup_commands": ["npm install", "npm run dev"],
  "description": "Brief project description"
}

Rules:
- Generate complete, production-ready files
- Include package.json, config files, README
- All code must be functional — no TODOs or placeholders
- Include proper error handling and validation`;

      if (user_id) {
        const { data: profile } = await supabase.from("profiles").select("credits, is_blocked").eq("user_id", user_id).single();
        if (profile?.is_blocked) return jsonResponse({ error: "Account blocked" }, 403);
        if (profile && profile.credits < 5) return jsonResponse({ error: "Insufficient credits (need 5)" }, 402);
        await supabase.from("profiles").update({ credits: profile!.credits - 5 }).eq("user_id", user_id);
      }

      const result = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: description },
      ]);

      // Try to parse as JSON
      let projectData;
      try {
        const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
        projectData = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result);
      } catch {
        projectData = { raw_response: result };
      }

      return jsonResponse({ success: true, project: projectData });
    }

    // === CHAT (General AI) ===
    if (action === "chat") {
      const { messages: userMessages, system_prompt, user_id, stream: doStream } = body;
      if (!userMessages?.length) return jsonResponse({ error: "messages required" }, 400);

      const messages = [
        {
          role: "system",
          content: system_prompt || "You are TIVO AI OS Assistant — a powerful AI that helps with coding, development, and technical tasks. Be concise and precise.",
        },
        ...userMessages,
      ];

      if (user_id) {
        const { data: profile } = await supabase.from("profiles").select("credits, is_blocked").eq("user_id", user_id).single();
        if (profile?.is_blocked) return jsonResponse({ error: "Account blocked" }, 403);
        if (profile && profile.credits < 1) return jsonResponse({ error: "Insufficient credits" }, 402);
        await supabase.from("profiles").update({ credits: profile!.credits - 1 }).eq("user_id", user_id);
      }

      if (doStream) {
        const streamResp = await callAI(messages, true);
        return new Response(streamResp.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      const result = await callAI(messages);
      return jsonResponse({ success: true, response: result });
    }

    return jsonResponse({ error: `Unknown AI action: ${action}` }, 404);
  } catch (e) {
    console.error("AI Engine error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
