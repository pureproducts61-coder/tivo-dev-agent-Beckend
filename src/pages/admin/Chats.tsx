import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MoreVertical, Search } from "lucide-react";
import { logAudit } from "@/lib/audit";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

/**
 * Chat History — the canonical list surface for the existing `conversations`
 * table. No second storage system: Open/Rename/Delete all operate on the same
 * rows (messages are removed by the DB cascade).
 */
export default function Chats() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    setItems((data as Conversation[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const h = () => setMenu(null);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menu]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) => (c.title || "").toLowerCase().includes(s));
  }, [items, q]);

  function open(id: string) {
    nav(`/super-admin/app/chats?conv=${id}`);
  }

  async function rename(c: Conversation) {
    const title = window.prompt("নতুন chat title:", c.title || "");
    if (!title?.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("conversations")
      .update({ title: title.trim() })
      .eq("id", c.id);
    setBusy(false);
    if (error) return alert(`Rename failed: ${error.message}`);
    logAudit("conversation.rename", c.id, { title: title.trim() });
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, title: title.trim() } : x)));
  }

  async function remove(c: Conversation) {
    if (!confirm(`"${c.title || "Untitled"}" chat এবং এর সব message স্থায়ীভাবে মুছে যাবে। নিশ্চিত?`)) return;
    setBusy(true);
    // messages.conversation_id has ON DELETE CASCADE — one delete removes both.
    const { error } = await supabase.from("conversations").delete().eq("id", c.id);
    setBusy(false);
    if (error) return alert(`Delete failed: ${error.message}`);
    logAudit("conversation.delete", c.id);
    setItems((prev) => prev.filter((x) => x.id !== c.id));
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">🕘 Chat History</h1>
          <button
            onClick={() => nav("/super-admin/app/chats")}
            className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs font-medium"
          >
            + New Chat
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm"
          />
        </div>

        {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
            {items.length === 0 ? "এখনো কোনো chat নেই।" : "কোনো chat মেলেনি।"}
          </div>
        )}

        <ul className="space-y-2 pb-6">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3 hover:border-zinc-700 transition flex items-start gap-2"
            >
              <button onClick={() => open(c.id)} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium truncate">{c.title || "Untitled"}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {new Date(c.updated_at).toLocaleString()}
                </div>
              </button>

              <div className="relative shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenu((m) => (m === c.id ? null : c.id));
                  }}
                  disabled={busy}
                  aria-label="Chat actions"
                  className={`w-8 h-8 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 flex items-center justify-center transition ${
                    menu === c.id ? "bg-zinc-800 text-amber-400" : ""
                  }`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menu === c.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-9 w-44 rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-lg shadow-2xl shadow-black/60 p-1 z-50 animate-scale-in origin-top-right"
                  >
                    <button
                      onClick={() => { setMenu(null); open(c.id); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] text-zinc-200 hover:bg-zinc-900"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => { setMenu(null); rename(c); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] text-zinc-200 hover:bg-zinc-900"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => { setMenu(null); remove(c); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] text-red-400 hover:bg-red-950/30"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
