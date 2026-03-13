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

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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
    const supabase = getSupabaseAdmin();

    // === LIST PROJECTS ===
    if (action === "list" && req.method === "GET") {
      const user_id = url.searchParams.get("user_id");
      const status = url.searchParams.get("status");
      let query = supabase.from("projects").select("*").order("updated_at", { ascending: false });
      if (user_id) query = query.eq("user_id", user_id);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ projects: data });
    }

    // === GET PROJECT ===
    if (action === "get" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return jsonResponse({ error: "id required" }, 400);
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ project: data });
    }

    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // === CREATE PROJECT ===
    if (action === "create" && req.method === "POST") {
      const { user_id, name, description, repo_url, files } = body;
      if (!user_id || !name) return jsonResponse({ error: "user_id and name required" }, 400);

      const { data, error } = await supabase.from("projects").insert({
        user_id,
        name,
        description: description || "",
        repo_url: repo_url || "",
        files: files || [],
        status: "active",
        build_status: "pending",
      }).select().single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Generate public URL
      const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${data.id}/index.html`;
      await supabase.from("projects").update({ public_url: publicUrl }).eq("id", data.id);

      await supabase.from("memory_logs").insert({
        user_id,
        action: "project_created",
        details: { project_id: data.id, name },
      });

      return jsonResponse({ success: true, project: { ...data, public_url: publicUrl } });
    }

    // === UPDATE PROJECT ===
    if (action === "update" && req.method === "PUT") {
      const { id, ...updates } = body;
      if (!id) return jsonResponse({ error: "id required" }, 400);
      const { error } = await supabase.from("projects").update(updates).eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // === DELETE PROJECT ===
    if (action === "delete" && req.method === "DELETE") {
      const { id } = body;
      if (!id) return jsonResponse({ error: "id required" }, 400);

      // Delete project files from storage
      const { data: fileList } = await supabase.storage.from("project-files").list(id);
      if (fileList?.length) {
        const filePaths = fileList.map((f: any) => `${id}/${f.name}`);
        await supabase.storage.from("project-files").remove(filePaths);
      }

      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // === UPLOAD FILES TO PROJECT ===
    if (action === "upload-files" && req.method === "POST") {
      const { project_id, files } = body;
      if (!project_id || !files?.length) return jsonResponse({ error: "project_id and files required" }, 400);

      const uploadResults = [];
      for (const file of files) {
        const { path, content, content_type } = file;
        const storagePath = `${project_id}/${path}`;
        const fileContent = new TextEncoder().encode(content);

        const { error } = await supabase.storage
          .from("project-files")
          .upload(storagePath, fileContent, {
            contentType: content_type || "text/plain",
            upsert: true,
          });

        uploadResults.push({
          path,
          success: !error,
          error: error?.message,
          url: `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${storagePath}`,
        });
      }

      // Update project files metadata
      const { data: project } = await supabase.from("projects").select("files").eq("id", project_id).single();
      const existingFiles = (project?.files as any[]) || [];
      const newFilesList = [...existingFiles];

      for (const result of uploadResults) {
        if (!result.success) continue;
        const idx = newFilesList.findIndex((f: any) => f.path === result.path);
        if (idx >= 0) {
          newFilesList[idx] = { path: result.path, url: result.url, updated_at: new Date().toISOString() };
        } else {
          newFilesList.push({ path: result.path, url: result.url, updated_at: new Date().toISOString() });
        }
      }

      await supabase.from("projects").update({
        files: newFilesList,
        build_status: "files_uploaded",
      }).eq("id", project_id);

      return jsonResponse({ success: true, uploads: uploadResults });
    }

    // === PUBLISH PROJECT (make live) ===
    if (action === "publish" && req.method === "POST") {
      const { project_id } = body;
      if (!project_id) return jsonResponse({ error: "project_id required" }, 400);

      const { data: project } = await supabase.from("projects").select("*").eq("id", project_id).single();
      if (!project) return jsonResponse({ error: "Project not found" }, 404);

      const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-files/${project_id}/index.html`;

      await supabase.from("projects").update({
        status: "published",
        build_status: "live",
        public_url: publicUrl,
      }).eq("id", project_id);

      await supabase.from("memory_logs").insert({
        user_id: project.user_id,
        action: "project_published",
        details: { project_id, public_url: publicUrl },
      });

      return jsonResponse({ success: true, public_url: publicUrl });
    }

    // === GET PROJECT PUBLIC URL ===
    if (action === "public-url" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return jsonResponse({ error: "id required" }, 400);
      const { data } = await supabase.from("projects").select("public_url, status, build_status").eq("id", id).single();
      if (!data) return jsonResponse({ error: "Project not found" }, 404);
      return jsonResponse(data);
    }

    return jsonResponse({ error: `Unknown project action: ${action}` }, 404);
  } catch (e) {
    console.error("Project Manager error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
