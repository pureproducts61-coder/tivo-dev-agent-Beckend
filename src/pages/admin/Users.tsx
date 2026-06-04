import { useEffect, useState } from "react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

interface UserRow {
  user_id: string;
  display_name: string;
  credits: number;
  is_blocked: boolean;
  created_at: string;
}

export default function Users() {
  const { session } = useSuperAdmin();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/functions/v1/backend-api/users/list`, {
        headers: { "x-master-secret": session.masterSecret },
      });
      const data = await res.json().catch(() => ({}));
      setUsers(data.users ?? data.items ?? []);
    } catch {}
    setLoading(false);
  }

  async function toggleBlock(uid: string, blocked: boolean) {
    if (!session) return;
    await fetch(`${BACKEND}/functions/v1/backend-api/users/set-blocked`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-master-secret": session.masterSecret },
      body: JSON.stringify({ user_id: uid, is_blocked: blocked }),
    });
    load();
  }

  useEffect(() => {
    load();
  }, [session]);

  return (
    <div className="p-4 space-y-3 max-w-2xl mx-auto">
      <h1 className="text-lg font-bold">👥 Users</h1>
      {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {!loading && users.length === 0 && (
        <div className="rounded-xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          কোনো user নেই (অথবা backend endpoint এখনো ready নয়)।
        </div>
      )}
      <ul className="space-y-2">
        {users.map((u) => (
          <li
            key={u.user_id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{u.display_name || u.user_id}</div>
              <div className="text-[11px] text-zinc-500">
                Credits: {u.credits} · {new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => toggleBlock(u.user_id, !u.is_blocked)}
              className={`text-xs px-3 py-1.5 rounded-lg ${
                u.is_blocked
                  ? "bg-red-900/50 text-red-300 hover:bg-red-900"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {u.is_blocked ? "Unblock" : "Block"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
