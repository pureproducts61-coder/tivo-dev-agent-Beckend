import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { projectBackendCall } from "@/lib/projectActions";

/**
 * Current-project selector for the chat top bar.
 *
 * Reads the project list through project-manager (master-secret edge call) so
 * it works for every login mode — direct table reads are hidden by projects
 * RLS when the row was created under a different user_id.
 */
export function ProjectSelector({
  masterSecret,
  selectedId,
  onChange,
}: {
  masterSecret: string;
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; build_status?: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!masterSecret) return;
    setLoading(true);
    setError(null);
    try {
      const data = await projectBackendCall(masterSecret, "project-manager", "list", null, "GET");
      setProjects((data?.projects ?? []) as Array<{ id: string; name: string; build_status?: string | null }>);
    } catch (e: any) {
      setError(e?.message || "list failed");
    } finally {
      setLoading(false);
    }
  }, [masterSecret]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  return (
    <div className="flex items-center gap-2 max-w-3xl w-full mx-auto text-xs">
      <FolderOpen className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
      <span className="text-zinc-500 shrink-0 hidden sm:inline">প্রজেক্ট</span>
      <select
        value={selectedId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-0 flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-700"
        aria-label="Current project"
      >
        <option value="">— কোনো প্রজেক্ট নির্বাচিত নেই —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.build_status ? ` (${p.build_status})` : ""}
          </option>
        ))}
      </select>
      <button
        onClick={refresh}
        disabled={loading}
        className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition disabled:opacity-50"
        aria-label="Refresh project list"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
      {selected?.public_hint}
      {error && <span className="text-red-400 shrink-0 truncate max-w-[40%]">⚠ {error}</span>}
      {!error && selectedId && !selected && !loading && (
        <span className="text-zinc-600 shrink-0">নির্বাচিত প্রজেক্টটি লিস্টে নেই</span>
      )}
    </div>
  );
}
