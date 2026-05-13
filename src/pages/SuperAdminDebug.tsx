import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

interface LogRow {
  id: string;
  action: string;
  details: any;
  created_at: string;
}
interface ProjectRow {
  id: string;
  name: string;
  description: string;
  build_status: string;
  tenant_id: string;
  public_url?: string;
  installer_url?: string;
  updated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  live: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
  active: "bg-sky-900/40 text-sky-300 border-sky-700/40",
  pending: "bg-amber-900/40 text-amber-300 border-amber-700/40",
  paused: "bg-zinc-800 text-zinc-300 border-zinc-700",
  stopped: "bg-red-900/40 text-red-300 border-red-700/40",
  error: "bg-red-900/40 text-red-300 border-red-700/40",
};

export default function SuperAdminDebug() {
  const { session } = useSuperAdmin();
  const [secret, setSecret] = useState(() => {
    // Clean any legacy localStorage copy on mount
    try { localStorage.removeItem("tivo_master_secret"); } catch {}
    return session?.masterSecret || sessionStorage.getItem("tivo_master_secret") || "";
  });
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tab, setTab] = useState<"logs" | "projects">("projects");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-master-secret": secret,
  }), [secret]);

  const fetchAll = useCallback(async () => {
    if (!secret) return;
    setBusy(true); setErr(null);
    try {
      const [lr, pr] = await Promise.all([
        fetch(`${BACKEND}/functions/v1/backend-api/logs?limit=80`, { headers: headers() }),
        fetch(`${BACKEND}/functions/v1/backend-api/tenant-projects`, { headers: headers() }),
      ]);
      const ld = await lr.json();
      const pd = await pr.json();
      if (!lr.ok) throw new Error(ld.error || "logs failed");
      if (!pr.ok) throw new Error(pd.error || "projects failed");
      setLogs(ld.logs || []);
      setProjects(pd.projects || []);
      sessionStorage.setItem("tivo_master_secret", secret);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [headers, secret]);

  useEffect(() => { if (secret) fetchAll(); }, [fetchAll, secret]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (autoRefresh && secret) {
      timer.current = setInterval(fetchAll, 5000);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [autoRefresh, secret, fetchAll]);

  async function killSwitch(projectId: string, status: string) {
    setActing(projectId);
    try {
      const r = await fetch(`${BACKEND}/functions/v1/backend-api/kill-switch`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ project_id: projectId, status }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Kill switch failed");
      await fetchAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  const filteredLogs = logs.filter(l =>
    !filter ||
    l.action.toLowerCase().includes(filter.toLowerCase()) ||
    JSON.stringify(l.details).toLowerCase().includes(filter.toLowerCase())
  );
  const filteredProjects = projects.filter(p =>
    !filter ||
    p.name?.toLowerCase().includes(filter.toLowerCase()) ||
    p.tenant_id?.toLowerCase().includes(filter.toLowerCase()) ||
    p.build_status?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-zinc-950/85 border-b border-zinc-800 px-3 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300">←</Link>
          <h1 className="text-sm sm:text-base font-semibold">🔍 Tenant Debug</h1>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-zinc-400">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              Auto
            </label>
            <button onClick={fetchAll} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-zinc-800 hover:border-amber-700 disabled:opacity-40">
              {busy ? "..." : "↻"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Secret */}
        {!session && (
          <input
            type="password"
            placeholder="Master secret"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
          />
        )}

        {/* Tabs + filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg w-fit">
            <button
              onClick={() => setTab("projects")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "projects" ? "bg-amber-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Projects ({projects.length})
            </button>
            <button
              onClick={() => setTab("logs")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "logs" ? "bg-amber-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              Logs ({logs.length})
            </button>
          </div>
          <input
            placeholder="🔎 Filter..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs focus:outline-none focus:border-amber-700"
          />
        </div>

        {err && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg p-2">{err}</div>}

        {/* Projects */}
        {tab === "projects" && (
          <div className="space-y-2">
            {filteredProjects.length === 0 && (
              <div className="text-center text-zinc-600 text-xs py-12">No projects</div>
            )}
            {filteredProjects.map(p => {
              const cls = STATUS_COLOR[p.build_status] || STATUS_COLOR.pending;
              const isStoppable = !["stopped", "paused"].includes(p.build_status);
              return (
                <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name || "(unnamed)"}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{p.tenant_id}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
                      {p.build_status}
                    </span>
                  </div>
                  {p.description && (
                    <div className="text-xs text-zinc-400 line-clamp-2">{p.description}</div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {isStoppable && (
                      <>
                        <button
                          disabled={acting === p.id}
                          onClick={() => killSwitch(p.id, "paused")}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-amber-900/40 hover:bg-amber-800/60 text-amber-200 border border-amber-700/40 disabled:opacity-40"
                        >
                          ⏸ Pause
                        </button>
                        <button
                          disabled={acting === p.id}
                          onClick={() => {
                            if (confirm(`Stop "${p.name}"? This will halt any running build.`)) killSwitch(p.id, "stopped");
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-red-900/40 hover:bg-red-800/60 text-red-200 border border-red-700/40 disabled:opacity-40"
                        >
                          ⛔ Stop
                        </button>
                      </>
                    )}
                    {!isStoppable && (
                      <button
                        disabled={acting === p.id}
                        onClick={() => killSwitch(p.id, "active")}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-200 border border-emerald-700/40 disabled:opacity-40"
                      >
                        ▶ Resume
                      </button>
                    )}
                    {p.public_url && (
                      <a href={p.public_url} target="_blank" rel="noreferrer" className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700">
                        🌐 Open
                      </a>
                    )}
                    {p.installer_url && (
                      <a href={p.installer_url} target="_blank" rel="noreferrer" className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700">
                        ⬇ Installer
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Logs */}
        {tab === "logs" && (
          <div className="space-y-1.5">
            {filteredLogs.length === 0 && (
              <div className="text-center text-zinc-600 text-xs py-12">No logs</div>
            )}
            {filteredLogs.map(l => (
              <details key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-lg group">
                <summary className="cursor-pointer px-3 py-2 text-xs flex items-center gap-2 hover:bg-zinc-800/50">
                  <span className="font-mono text-amber-300 text-[11px] shrink-0">{l.action}</span>
                  <span className="text-zinc-500 text-[10px] ml-auto shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                </summary>
                <pre className="text-[10px] text-zinc-400 px-3 pb-2 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(l.details, null, 2)}</pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
