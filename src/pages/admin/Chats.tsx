import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export default function Chats() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setItems((data as Conversation[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">💬 Chats</h1>
        <Link
          to="/super-admin/workspace"
          className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs font-medium"
        >
          + New Chat
        </Link>
      </div>

      {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          এখনো কোনো chat নেই। নতুন chat শুরু করো।
        </div>
      )}

      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 hover:border-zinc-700 transition"
          >
            <Link to={`/super-admin/workspace?conv=${c.id}`} className="block">
              <div className="text-sm font-medium truncate">{c.title || "Untitled"}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {new Date(c.updated_at).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
