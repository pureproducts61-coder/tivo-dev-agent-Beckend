// ============================================================================
// TIVO — PROJECT ACTIONS: SINGLE SOURCE OF TRUTH
// ----------------------------------------------------------------------------
// Every project capability (Publish, Rebuild, Download, Delete, …) lives here
// exactly once. The Chat three-dot menu and the Projects card ⋮ menu both build
// their items from `buildProjectActions()` — different presentation, identical
// business logic. Do NOT re-implement any of these handlers elsewhere.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import type { Artifact } from "@/components/chat/ChatMessage";
import { ActionIcons, type InputAction } from "@/components/chat/ChatInput";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

export interface ProjectRef {
  id: string;
  name: string;
}

export interface ProjectActionsCtx {
  /** Super Admin master secret used for edge-function calls. */
  masterSecret: string;
  /** Resolves which project the action applies to (chat → latest, card → that row). */
  resolveProject: () => Promise<ProjectRef | null>;
  /** Surface progress / result text (chat pushes a system message, Projects shows a banner). */
  report: (msg: string, artifacts?: Artifact[]) => void;
  /** Opens the Security Scan panel. Omit if the host has no panel — action is then hidden. */
  openSecurityScan?: () => void;
  /** Opens the AI Variables panel. Omit if unsupported — action is then hidden. */
  openVariables?: () => void;
  /** Navigate to the project files surface. Omit if the host already is that surface. */
  openFiles?: () => void;
  /** Called after a mutation so the host can refresh its list. */
  onChanged?: () => void;
}

export async function projectBackendCall(
  masterSecret: string,
  fn: string,
  path: string,
  body: unknown,
  method: "POST" | "GET" | "PUT" | "DELETE" = "POST",
) {
  const res = await fetch(`${BACKEND}/functions/v1/${fn}/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-master-secret": masterSecret },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `${path} → HTTP ${res.status}`);
  return data as any;
}

export function buildProjectActions(ctx: ProjectActionsCtx): InputAction[] {
  const call = (fn: string, path: string, body: unknown, method?: "POST" | "GET" | "PUT" | "DELETE") =>
    projectBackendCall(ctx.masterSecret, fn, path, body, method);

  async function withProject(label: string, fn: (projectId: string) => Promise<void>) {
    ctx.report(`⏳ ${label}…`);
    try {
      const project = await ctx.resolveProject();
      if (!project) {
        ctx.report(`⚠️ ${label} cancelled — কোনো project নেই। প্রথমে Projects ট্যাবে একটা তৈরি করো।`);
        return;
      }
      await fn(project.id);
      ctx.report(`✅ ${label} — done (${project.name}).`);
      ctx.onChanged?.();
    } catch (e: any) {
      ctx.report(`❌ ${label} failed: ${e?.message || "unknown error"}`);
    }
  }

  const actions: InputAction[] = [
    {
      id: "publish",
      group: "project",
      label: "Publish",
      icon: ActionIcons.Globe,
      desc: "Push current build live",
      tone: "primary",
      onClick: () =>
        withProject("Publishing", async (id) => {
          const data = await call("project-manager", "publish", { project_id: id });
          logAudit("project.publish", id, { public_url: data?.public_url });
          if (data?.public_url) {
            ctx.report(`🌐 Live: ${data.public_url}`, [
              { name: "Open live site", url: data.public_url, mime: "text/html" },
            ]);
          }
        }),
    },
    {
      id: "update",
      group: "tools",
      label: "Update & Rebuild",
      icon: ActionIcons.RefreshCw,
      desc: "Trigger a fresh build",
      onClick: () =>
        withProject("Rebuilding", async (id) => {
          // project-manager exposes `update` as PUT — method must match or the
          // rebuild silently 404s.
          await call("project-manager", "update", { id, build_status: "queued" }, "PUT");
          logAudit("project.update", id, { build_status: "queued" });
        }),
    },
    {
      id: "history",
      group: "project",
      label: "Version History",
      icon: ActionIcons.History,
      desc: "Recent snapshots",
      onClick: () =>
        withProject("Loading history", async (id) => {
          const data = await call("project-manager", `versions?id=${id}`, null, "GET");
          const versions = (data?.versions || data?.items || []).slice(0, 5);
          if (!versions.length) {
            ctx.report("📜 কোনো version snapshot এখনো নেই।");
            return;
          }
          ctx.report(
            "📜 Latest versions:\n" +
              versions.map((v: any, i: number) => `${i + 1}. ${v.label || v.id} — ${v.created_at || ""}`).join("\n"),
          );
        }),
    },
    {
      id: "share",
      group: "project",
      label: "Share Link",
      icon: ActionIcons.Share2,
      desc: "Copy public URL",
      onClick: () =>
        withProject("Generating share link", async (id) => {
          const { data } = await supabase.from("projects").select("public_url").eq("id", id).maybeSingle();
          const url = data?.public_url || `${window.location.origin}/projects/${id}`;
          await navigator.clipboard?.writeText(url);
          ctx.report(`🔗 Copied to clipboard: ${url}`);
        }),
    },
    {
      id: "download",
      group: "project",
      label: "Download ZIP",
      icon: ActionIcons.Download,
      desc: "Export project bundle",
      onClick: () =>
        withProject("Preparing download", async (id) => {
          const data = await call("project-manager", `download?id=${id}`, null, "GET");
          const url = data?.url || data?.download_url;
          if (url) {
            ctx.report("📦 Bundle ready.", [
              { name: `${data?.name || "project"}.zip`, url, mime: "application/zip", size: data?.size },
            ]);
          } else if (data?.base64) {
            ctx.report("📦 Bundle ready.", [
              { name: `${data?.name || "project"}.zip`, base64: data.base64, mime: "application/zip" },
            ]);
          } else {
            throw new Error("No download URL returned");
          }
        }),
    },
    {
      id: "preview",
      group: "tools",
      label: "Open Preview",
      icon: ActionIcons.Eye,
      desc: "Live preview in new tab",
      onClick: () =>
        withProject("Opening preview", async (id) => {
          // Must open the SELECTED project's real preview URL — never the TIVO root
          // and never a fabricated URL.
          const { data, error } = await supabase
            .from("projects")
            .select("public_url")
            .eq("id", id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          const url = data?.public_url?.trim();
          if (!url) {
            throw new Error("এই project-এর কোনো preview URL নেই — আগে Publish করো, তারপর preview খোলা যাবে।");
          }
          window.open(url, "_blank", "noopener");
        }),
    },
    {
      id: "rename",
      group: "project",
      label: "Rename Project",
      icon: ActionIcons.Pencil,
      desc: "Edit project name",
      onClick: () =>
        withProject("Renaming", async (id) => {
          const name = window.prompt("নতুন project name:");
          if (!name?.trim()) throw new Error("Cancelled");
          const { error } = await supabase.from("projects").update({ name: name.trim() }).eq("id", id);
          if (error) throw new Error(error.message);
          logAudit("project.rename", id, { name: name.trim() });
        }),
    },
    {
      id: "analytics",
      group: "analytics",
      label: "Analytics",
      icon: ActionIcons.BarChart3,
      desc: "Build & deploy metrics",
      onClick: () =>
        withProject("Loading analytics", async (id) => {
          const data = await call("project-manager", `analytics?id=${id}`, null, "GET").catch(() => null);
          ctx.report("📊 Analytics:\n```json\n" + JSON.stringify(data ?? { note: "no data" }, null, 2) + "\n```");
        }),
    },
    {
      id: "visitors",
      group: "analytics",
      label: "Visitors",
      icon: ActionIcons.Users,
      desc: "Live visitor stats",
      onClick: () =>
        withProject("Fetching visitors", async (id) => {
          const data = await call("project-manager", `visitors?id=${id}`, null, "GET").catch(() => null);
          ctx.report("👥 Visitors:\n```json\n" + JSON.stringify(data ?? { note: "no data" }, null, 2) + "\n```");
        }),
    },
    {
      id: "performance",
      group: "analytics",
      label: "Performance",
      icon: ActionIcons.Gauge,
      desc: "Speed & uptime",
      onClick: () =>
        withProject("Profiling", async (id) => {
          const data = await call("project-manager", `performance?id=${id}`, null, "GET").catch(() => null);
          ctx.report("⚡ Performance:\n```json\n" + JSON.stringify(data ?? { note: "no data" }, null, 2) + "\n```");
        }),
    },
    {
      id: "reopen",
      group: "more",
      label: "Reopen Project",
      icon: ActionIcons.RotateCcw,
      desc: "Restore archived project",
      onClick: () =>
        withProject("Reopening", async (id) => {
          const { error } = await supabase.from("projects").update({ archived: false } as any).eq("id", id);
          if (error) throw new Error(error.message);
          logAudit("project.reopen", id);
        }),
    },
    {
      id: "delete",
      group: "more",
      label: "Delete Project",
      icon: ActionIcons.Trash2,
      desc: "Permanently remove",
      tone: "danger",
      onClick: () =>
        withProject("Deleting", async (id) => {
          if (!confirm("সত্যিই delete করবে? এটা undo করা যাবে না।")) throw new Error("Cancelled");
          // Canonical secure path: project-manager verifies ownership/super-admin
          // and removes the project's storage artifacts before deleting the row.
          await call("project-manager", "delete", { id }, "DELETE");
          logAudit("project.delete", id);
        }),
    },
  ];

  // Host-dependent actions — only offered when the host can actually service them.
  if (ctx.openFiles) {
    actions.push({
      id: "files",
      group: "project",
      label: "Project Files",
      icon: ActionIcons.Folder,
      desc: "Browse files",
      onClick: ctx.openFiles,
    });
  }
  if (ctx.openSecurityScan) {
    actions.push({
      id: "security",
      group: "tools",
      label: "Security Scan",
      icon: ActionIcons.ShieldCheck,
      desc: "Scan & fix vulnerabilities",
      onClick: ctx.openSecurityScan,
    });
  }
  if (ctx.openVariables) {
    actions.push({
      id: "variables",
      group: "tools",
      label: "AI Variables",
      icon: ActionIcons.KeyRound,
      desc: "Key/Value AI access",
      onClick: ctx.openVariables,
    });
  }

  return actions;
}
