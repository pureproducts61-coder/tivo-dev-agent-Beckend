import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

interface Log {
  id: string;
  action: string;
  actor: string;
  target: string | null;
  created_at: string;
  details: any;
}

/** Activity — read-only audit trail from the existing `audit_logs` table. */
export default function Activity() {
  const [items, setItems] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase
      .from("audit_logs")
      .select("id, action, actor, target, created_at, details")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setItems((data as Log[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((l) =>
      `${l.action} ${l.actor} ${l.target ?? ""}`.toLowerCase().includes(s),
    );
  }, [items, q]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-4 max-w-2xl mx-auto space-y-3 pb-8">
        <h1 className="text-lg font-bold">📈 Activity</h1>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activity…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm"
          />
        </div>

        {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
            কোনো activity রেকর্ড নেই।
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((l) => (
            <li key={l.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-amber-300/90 truncate">{l.action}</span>
                <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </div>
              <div className="text-zinc-400 mt-1 truncate">
                {l.actor}
                {l.target ? ` → ${l.target}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
