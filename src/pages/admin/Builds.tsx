import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BuildRow {
  id: string;
  name: string;
  build_status: string | null;
  public_url: string | null;
  installer_url: string | null;
  updated_at: string;
}

interface JobRow {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
}

const badge = (s?: string | null) =>
  s === "success" || s === "done"
    ? "bg-green-900/40 text-green-400"
    : s === "failed" || s === "error"
    ? "bg-red-900/40 text-red-400"
    : s === "running" || s === "building"
    ? "bg-amber-900/40 text-amber-300"
    : "bg-zinc-800 text-zinc-400";

/** Builds — read-only view of existing project build state and queued build jobs. */
export default function Builds() {
  const [projects, setProjects] = useState<BuildRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, j] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, build_status, public_url, installer_url, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("job_queue")
          .select("id, kind, status, error, created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      setProjects((p.data as BuildRow[]) ?? []);
      setJobs((j.data as JobRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-4 max-w-2xl mx-auto space-y-5 pb-8">
        <h1 className="text-lg font-bold">🏗️ Builds</h1>
        {loading && <p className="text-zinc-500 text-sm">Loading…</p>}

        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-600">Project builds</div>
          {!loading && projects.length === 0 && (
            <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
              কোনো build নেই।
            </div>
          )}
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-zinc-500">{new Date(p.updated_at).toLocaleString()}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${badge(p.build_status)}`}>
                  {p.build_status || "idle"}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {p.public_url && (
                  <a href={p.public_url} target="_blank" rel="noreferrer" className="text-[11px] text-amber-500 hover:underline">
                    ↗ Live preview
                  </a>
                )}
                {p.installer_url && (
                  <a href={p.installer_url} target="_blank" rel="noreferrer" className="text-[11px] text-amber-500 hover:underline">
                    ⬇ Installer
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-600">Build / job queue</div>
          {!loading && jobs.length === 0 && (
            <div className="rounded-xl border border-zinc-800 p-4 text-center text-xs text-zinc-500">
              Queue খালি।
            </div>
          )}
          {jobs.map((j) => (
            <div key={j.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{j.kind}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge(j.status)}`}>{j.status}</span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">{new Date(j.created_at).toLocaleString()}</div>
              {j.error && <div className="text-[11px] text-red-400 mt-1 break-words">{j.error}</div>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
