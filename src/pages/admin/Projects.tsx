import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  build_status: string;
  public_url: string;
  updated_at: string;
}

export default function Projects() {
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("id, name, description, status, build_status, public_url, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    setItems((data as Project[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createProject() {
    if (!newName.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return alert("Login first");
    await supabase.from("projects").insert({ name: newName, user_id: user.id, status: "active" });
    setNewName("");
    load();
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold">📦 Projects</h1>

      <div className="rounded-xl border border-zinc-800 p-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name…"
          className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm"
        />
        <button
          onClick={createProject}
          className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-sm font-medium"
        >
          Create
        </button>
      </div>

      {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          কোনো project নেই। উপরে নাম দিয়ে Create করো।
        </div>
      )}

      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                {p.description && (
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{p.description}</div>
                )}
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                  p.build_status === "success"
                    ? "bg-green-900/40 text-green-400"
                    : p.build_status === "failed"
                    ? "bg-red-900/40 text-red-400"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {p.build_status}
              </span>
            </div>
            {p.public_url && (
              <a
                href={p.public_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-amber-500 hover:underline mt-2 inline-block"
              >
                ↗ {p.public_url}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
