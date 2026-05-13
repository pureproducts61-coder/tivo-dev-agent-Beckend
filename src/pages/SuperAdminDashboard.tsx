import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { supabase } from "@/integrations/supabase/client";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

type Tab = "report" | "proposals" | "notifications" | "audit" | "memory" | "security" | "snapshots" | "map";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "report", label: "Report", icon: "📊" },
  { id: "proposals", label: "Approvals", icon: "✅" },
  { id: "notifications", label: "Alerts", icon: "🔔" },
  { id: "audit", label: "Audit", icon: "📜" },
  { id: "memory", label: "Memory", icon: "🧠" },
  { id: "security", label: "Security", icon: "🛡️" },
  { id: "snapshots", label: "Snapshots", icon: "💾" },
  { id: "map", label: "System Map", icon: "🗺️" },
];

export default function SuperAdminDashboard() {
  const { session, logout } = useSuperAdmin();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("report");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => { if (!session) nav("/super-admin/login"); }, [session, nav]);

  const call = useCallback(async (path: string, opts: RequestInit = {}) => {
    if (!session) return null;
    const r = await fetch(`${BACKEND}/functions/v1/backend-api/${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        "x-master-secret": session.masterSecret,
        ...(opts.headers || {}),
      },
    });
    return r.json();
  }, [session]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const map: Record<Tab, string> = {
        report: "system-report",
        proposals: "proposals/list",
        notifications: "notifications/list",
        audit: "audit/list",
        memory: "memory/search",
        security: "security/events",
        snapshots: "snapshots/list",
        map: "system-map/list",
      };
      const d = await call(map[tab]);
      setData(d);
    } finally { setLoading(false); }
  }, [tab, call, session]);

  useEffect(() => { load(); }, [load]);

  // Realtime notifications subscription
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel("sa-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (p: any) => {
        setUnread((u) => u + 1);
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(p.new?.title || "TIVO", { body: p.new?.message || "", icon: "/favicon.ico" });
        }
      })
      .subscribe();
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  async function decide(id: string, decision: "approve" | "reject") {
    await call("proposals/decide", { method: "POST", body: JSON.stringify({ id, decision }) });
    if (decision === "approve") await call("proposals/apply", { method: "POST", body: JSON.stringify({ id }) });
    load();
  }
  async function rollback(id: string) {
    if (!confirm("Rollback this change?")) return;
    await call("proposals/rollback", { method: "POST", body: JSON.stringify({ id }) });
    load();
  }
  async function markAllRead() {
    await call("notifications/mark-read", { method: "POST", body: JSON.stringify({ all: true }) });
    setUnread(0); load();
  }
  async function snapshot() {
    const label = prompt("Snapshot label?", "manual " + new Date().toLocaleString());
    if (!label) return;
    await call("snapshots/create", { method: "POST", body: JSON.stringify({ label }) });
    load();
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-20 backdrop-blur bg-zinc-950/85 border-b border-zinc-800 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">⚡ TIVO Command Center</div>
          <div className="text-[10px] text-zinc-500 truncate">{session.email}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {unread > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-700 text-white">{unread}</span>}
          <button onClick={snapshot} title="Create snapshot" className="text-[11px] px-2 py-1 rounded-md border border-zinc-800 hover:border-amber-700">💾</button>
          <a href="/super-admin/workspace" className="text-[11px] px-2 py-1 rounded-md border border-zinc-800 hover:border-amber-700">💬 Chat</a>
          <button onClick={() => { logout(); nav("/"); }} className="text-[11px] px-2 py-1 rounded-md border border-red-900/40 text-red-300">Out</button>
        </div>
      </header>

      {/* Tabs - horizontal scroll on mobile */}
      <nav className="sticky top-[52px] z-10 bg-zinc-950/85 backdrop-blur border-b border-zinc-800 overflow-x-auto">
        <div className="flex gap-1 px-2 py-1.5 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[11px] sm:text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap transition ${
                tab === t.id ? "bg-amber-700 text-white" : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {loading && <div className="text-center text-xs text-zinc-500 py-8">Loading...</div>}
        {!loading && data?.error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded p-3">{data.error}</div>}

        {tab === "report" && data && !data.error && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Pending" value={data.counts?.pending_proposals ?? 0} color="amber" />
              <Stat label="Unread" value={data.counts?.unread_notifications ?? 0} color="blue" />
              <Stat label="Threats" value={data.counts?.recent_threats ?? 0} color="red" />
            </div>
            <Section title="🛠️ Capabilities">
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {data.capabilities && Object.entries(data.capabilities).map(([k, v]: any) => (
                  <div key={k} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5">
                    <span className="text-zinc-400 truncate">{k}</span>
                    <span className={typeof v === "boolean" ? (v ? "text-emerald-400" : "text-zinc-600") : "text-amber-400 font-mono"}>
                      {typeof v === "boolean" ? (v ? "✓" : "—") : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="📦 Recent Projects">
              <List items={data.recent?.projects || []} render={(p: any) => <span><b>{p.name}</b> · <em className="text-zinc-500">{p.build_status}</em></span>} />
            </Section>
            <Section title="📜 Recent Audit">
              <List items={data.recent?.audit_logs?.slice(0, 8) || []} render={(a: any) => <span className="text-[11px]"><span className="text-amber-400">{a.actor}</span> · {a.action} <em className="text-zinc-600">{a.target?.slice(0, 12)}</em></span>} />
            </Section>
          </div>
        )}

        {tab === "proposals" && data?.proposals && (
          <div className="space-y-2">
            {data.proposals.length === 0 && <Empty msg="No proposals yet" />}
            {data.proposals.map((p: any) => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[10px] text-zinc-500">{new Date(p.created_at).toLocaleString()} · risk: <span className={p.risk_level === "high" ? "text-red-400" : "text-amber-400"}>{p.risk_level}</span></div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    p.status === "pending" ? "bg-amber-900/50 text-amber-300" :
                    p.status === "approved" || p.status === "applied" ? "bg-emerald-900/50 text-emerald-300" :
                    p.status === "rejected" ? "bg-red-900/50 text-red-300" : "bg-zinc-800 text-zinc-400"
                  }`}>{p.status}</span>
                </div>
                {p.description && <div className="text-xs text-zinc-400 whitespace-pre-wrap">{p.description}</div>}
                <details className="text-[10px]"><summary className="text-zinc-500 cursor-pointer">payload</summary><pre className="mt-1 bg-black/40 p-2 rounded overflow-x-auto text-zinc-400">{JSON.stringify(p.payload, null, 2)}</pre></details>
                {p.status === "pending" && (
                  <div className="flex gap-1.5">
                    <button onClick={() => decide(p.id, "approve")} className="flex-1 text-xs py-1.5 rounded bg-emerald-700 hover:bg-emerald-600">✓ Approve & Apply</button>
                    <button onClick={() => decide(p.id, "reject")} className="flex-1 text-xs py-1.5 rounded bg-red-800 hover:bg-red-700">✗ Reject</button>
                  </div>
                )}
                {p.status === "applied" && (
                  <button onClick={() => rollback(p.id)} className="w-full text-xs py-1.5 rounded border border-amber-800/50 text-amber-300 hover:bg-amber-950/30">↩️ Rollback</button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "notifications" && data?.notifications && (
          <div className="space-y-2">
            {data.notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs px-3 py-1.5 rounded border border-zinc-800 hover:border-amber-700">Mark all read</button>
            )}
            {data.notifications.length === 0 && <Empty msg="No notifications" />}
            {data.notifications.map((n: any) => (
              <div key={n.id} className={`bg-zinc-900 border rounded-lg p-2.5 ${n.read_at ? "border-zinc-800 opacity-60" : "border-amber-900/40"}`}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <span className={n.level === "error" ? "text-red-400" : n.level === "warn" ? "text-amber-400" : "text-zinc-300"}>●</span>
                    {n.title}
                  </div>
                  <span className="text-[9px] text-zinc-500">{new Date(n.created_at).toLocaleString()}</span>
                </div>
                {n.message && <div className="text-[11px] text-zinc-400 mt-1">{n.message}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === "audit" && data?.logs && (
          <div className="space-y-1">
            {data.logs.length === 0 && <Empty msg="No audit logs" />}
            {data.logs.map((a: any) => (
              <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span><span className="text-amber-400">{a.actor}</span> · {a.action} {a.target && <em className="text-zinc-500">→ {a.target.slice(0, 16)}</em>}</span>
                  <span className="text-[9px] text-zinc-500 shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "memory" && data?.memories && (
          <div className="space-y-2">
            {data.memories.length === 0 && <Empty msg="No memories yet" />}
            {data.memories.map((m: any) => (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded p-2.5">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>🧠 {m.kind} · importance {m.importance}</span>
                  <span>{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-[12px] text-zinc-300 whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "security" && data?.events && (
          <div className="space-y-2">
            {data.events.length === 0 && <Empty msg="No threats detected. System secure ✅" />}
            {data.events.map((e: any) => (
              <div key={e.id} className={`border rounded p-2.5 ${e.severity === "critical" || e.severity === "high" ? "bg-red-950/30 border-red-900/50" : "bg-zinc-900 border-zinc-800"}`}>
                <div className="flex justify-between text-xs">
                  <span><b>🛡️ {e.threat_type}</b> · {e.severity} · {e.blocked ? <span className="text-emerald-400">BLOCKED</span> : <span className="text-amber-400">DETECTED</span>}</span>
                  <span className="text-[10px] text-zinc-500">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">IP: {e.source_ip || "unknown"}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "snapshots" && data?.snapshots && (
          <div className="space-y-1">
            {data.snapshots.length === 0 && <Empty msg="No snapshots" />}
            {data.snapshots.map((s: any) => (
              <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs flex justify-between">
                <span>💾 {s.label}</span>
                <span className="text-[10px] text-zinc-500">{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "map" && data?.map && (
          <div className="space-y-2">
            {data.map.length === 0 && <Empty msg="System map empty. TIVO will index automatically." />}
            {Object.entries((data.map as any[]).reduce((acc: any, m: any) => { (acc[m.kind] ||= []).push(m); return acc; }, {})).map(([kind, items]: any) => (
              <Section key={kind} title={`${kind} (${items.length})`}>
                <div className="space-y-0.5">
                  {items.map((i: any) => (
                    <div key={i.name} className="text-[11px] text-zinc-400 px-2 py-1 bg-zinc-900 border border-zinc-800 rounded flex justify-between">
                      <span>{i.name}</span>
                      <span className="text-zinc-600 truncate ml-2">{i.path}</span>
                    </div>
                  ))}
                </div>
              </Section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: any = {
    amber: "border-amber-900/40 text-amber-400",
    blue: "border-blue-900/40 text-blue-400",
    red: "border-red-900/40 text-red-400",
  };
  return (
    <div className={`bg-zinc-900 border rounded-lg p-3 text-center ${colors[color]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}
function List({ items, render }: { items: any[]; render: (i: any) => any }) {
  if (!items?.length) return <Empty msg="—" />;
  return (
    <div className="space-y-1">
      {items.map((i: any, k: number) => (
        <div key={i.id || k} className="text-xs text-zinc-300 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5">{render(i)}</div>
      ))}
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="text-center text-xs text-zinc-500 py-6">{msg}</div>;
}
