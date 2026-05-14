import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { supabase } from "@/integrations/supabase/client";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

type Tab = "report" | "proposals" | "notifications" | "audit" | "memory" | "security" | "snapshots" | "map";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "report", label: "Overview", icon: "📊" },
  { id: "proposals", label: "Approvals", icon: "✅" },
  { id: "notifications", label: "Alerts", icon: "🔔" },
  { id: "audit", label: "Audit", icon: "📜" },
  { id: "memory", label: "Memory", icon: "🧠" },
  { id: "security", label: "Security", icon: "🛡️" },
  { id: "snapshots", label: "Snapshots", icon: "💾" },
  { id: "map", label: "Map", icon: "🗺️" },
];

export default function SuperAdminDashboard() {
  const { session, logout } = useSuperAdmin();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("report");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

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

  // Realtime notifications
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

  // Lazy-load projects when menu opens
  useEffect(() => {
    if (!menuOpen || !session) return;
    supabase.auth.getUser().then(({ data: u }) => {
      if (!u?.user) return;
      supabase.from("projects")
        .select("id,name,build_status,public_url,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50)
        .then(({ data }) => setProjects(data || []));
    });
  }, [menuOpen, session]);

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

  const publishedProjects = useMemo(() => projects.filter((p) => p.public_url), [projects]);

  if (!session) return null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/70 border-b border-zinc-800/80 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="w-9 h-9 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-center hover:border-amber-700/60 active:scale-95 transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">⚡ TIVO</span>
              <span className="text-zinc-500 text-[10px] font-normal">Command Center</span>
            </div>
            <div className="text-[10px] text-zinc-500 truncate max-w-[180px]">{session.email}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {unread > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse">{unread}</span>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="w-9 h-9 rounded-lg bg-zinc-900/80 border border-zinc-800 flex items-center justify-center hover:border-amber-700/60 active:scale-95 transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="sticky top-[57px] z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 px-2 py-2 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[11px] sm:text-xs px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition active:scale-95 ${
                tab === t.id
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/30"
                  : "bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {loading && <div className="text-center text-xs text-zinc-500 py-12">Loading…</div>}
        {!loading && data?.error && (
          <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg p-3">{data.error}</div>
        )}

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
                  <div key={k} className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5">
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
              <List items={data.recent?.audit_logs?.slice(0, 8) || []} render={(a: any) => <span className="text-[11px]"><span className="text-amber-400">{a.actor}</span> · {a.action} <em className="text-zinc-600">{a.target?.slice(0, 16)}</em></span>} />
            </Section>
            <button onClick={snapshot} className="w-full text-xs py-2 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-amber-700/60">💾 Create Snapshot</button>
          </div>
        )}

        {tab === "proposals" && data?.proposals && (
          <div className="space-y-2">
            {data.proposals.length === 0 && <Empty msg="No proposals yet" />}
            {data.proposals.map((p: any) => (
              <div key={p.id} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-[10px] text-zinc-500">{new Date(p.created_at).toLocaleString()} · risk: <span className={p.risk_level === "high" ? "text-red-400" : "text-amber-400"}>{p.risk_level}</span></div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    p.status === "pending" ? "bg-amber-900/50 text-amber-300" :
                    p.status === "approved" || p.status === "applied" ? "bg-emerald-900/50 text-emerald-300" :
                    p.status === "rejected" ? "bg-red-900/50 text-red-300" : "bg-zinc-800 text-zinc-400"
                  }`}>{p.status}</span>
                </div>
                {p.description && <div className="text-xs text-zinc-400 whitespace-pre-wrap">{p.description}</div>}
                <details className="text-[10px]"><summary className="text-zinc-500 cursor-pointer">payload</summary><pre className="mt-1 bg-black/40 p-2 rounded overflow-x-auto text-zinc-400">{JSON.stringify(p.payload, null, 2)}</pre></details>
                {p.status === "pending" && (
                  <div className="flex gap-1.5">
                    <button onClick={() => decide(p.id, "approve")} className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 transition">✓ Approve</button>
                    <button onClick={() => decide(p.id, "reject")} className="flex-1 text-xs py-1.5 rounded-lg bg-red-800 hover:bg-red-700 active:scale-95 transition">✗ Reject</button>
                  </div>
                )}
                {p.status === "applied" && (
                  <button onClick={() => rollback(p.id)} className="w-full text-xs py-1.5 rounded-lg border border-amber-800/50 text-amber-300 hover:bg-amber-950/30">↩️ Rollback</button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "notifications" && data?.notifications && (
          <div className="space-y-2">
            {data.notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-amber-700/60">Mark all read</button>
            )}
            {data.notifications.length === 0 && <Empty msg="No notifications" />}
            {data.notifications.map((n: any) => (
              <div key={n.id} className={`bg-zinc-900/60 border rounded-lg p-2.5 ${n.read_at ? "border-zinc-800 opacity-60" : "border-amber-900/40"}`}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <span className={n.level === "error" ? "text-red-400" : n.level === "warn" ? "text-amber-400" : "text-emerald-400"}>●</span>
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
              <div key={a.id} className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span><span className="text-amber-400">{a.actor}</span> · {a.action} {a.target && <em className="text-zinc-500">→ {a.target.slice(0, 18)}</em>}</span>
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
              <div key={m.id} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
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
              <div key={e.id} className={`border rounded-lg p-2.5 ${e.severity === "critical" || e.severity === "high" ? "bg-red-950/30 border-red-900/50" : "bg-zinc-900/60 border-zinc-800"}`}>
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
              <div key={s.id} className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs flex justify-between">
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
                    <div key={i.name} className="text-[11px] text-zinc-400 px-2 py-1 bg-zinc-900/60 border border-zinc-800 rounded flex justify-between">
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

      {/* Left Drawer — Menu */}
      {menuOpen && (
        <Drawer side="left" onClose={() => setMenuOpen(false)} title="📁 Workspace">
          <div className="space-y-4">
            <DrawerLink onClick={() => { setMenuOpen(false); nav("/super-admin/workspace"); }} icon="💬" label="AI Chat" hint="Talk to TIVO" />
            <DrawerLink onClick={() => { setMenuOpen(false); setTab("audit"); }} icon="📜" label="Logs & Audit" hint="System activity" />
            <DrawerLink onClick={() => { setMenuOpen(false); nav("/super-admin/debug"); }} icon="🐛" label="Debug Console" hint="Raw API tools" />

            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 px-1">All Projects ({projects.length})</div>
              <div className="space-y-1 max-h-[28vh] overflow-y-auto">
                {projects.length === 0 && <div className="text-[11px] text-zinc-600 px-2 py-2">No projects yet</div>}
                {projects.map((p) => (
                  <div key={p.id} className="text-[11px] bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[9px] text-zinc-500 flex justify-between">
                      <span>{p.build_status}</span>
                      <span>{new Date(p.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 px-1">🌐 Published ({publishedProjects.length})</div>
              <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                {publishedProjects.length === 0 && <div className="text-[11px] text-zinc-600 px-2 py-2">Nothing published yet</div>}
                {publishedProjects.map((p) => (
                  <a key={p.id} href={p.public_url} target="_blank" rel="noreferrer"
                     className="block text-[11px] bg-emerald-950/20 border border-emerald-900/40 rounded-lg px-2.5 py-1.5 hover:border-emerald-700">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[9px] text-emerald-400/70 truncate">{p.public_url}</div>
                  </a>
                ))}
              </div>
            </div>

            <button onClick={() => { logout(); nav("/"); }} className="w-full text-xs py-2 rounded-lg border border-red-900/40 text-red-300 hover:bg-red-950/30">
              ⏻ Sign Out
            </button>
          </div>
        </Drawer>
      )}

      {/* Right Drawer — Settings */}
      {settingsOpen && (
        <Drawer side="right" onClose={() => setSettingsOpen(false)} title="⚙️ Settings">
          <CredentialsManager call={call} />
        </Drawer>
      )}
    </main>
  );
}

/* ============== Drawer ============== */
function Drawer({ side, onClose, title, children }: { side: "left" | "right"; onClose: () => void; title: string; children: any }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside
        className={`fixed top-0 bottom-0 z-50 w-[88vw] max-w-sm bg-zinc-950 border-zinc-800 shadow-2xl flex flex-col ${
          side === "left" ? "left-0 border-r animate-in slide-in-from-left" : "right-0 border-l animate-in slide-in-from-right"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950/95 backdrop-blur">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-zinc-900 flex items-center justify-center text-zinc-400">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  );
}
function DrawerLink({ icon, label, hint, onClick }: { icon: string; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-amber-700/60 active:scale-[.98] transition flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[10px] text-zinc-500">{hint}</div>
      </div>
      <span className="text-zinc-600">→</span>
    </button>
  );
}

/* ============== Credentials Manager ============== */
function CredentialsManager({ call }: { call: (path: string, opts?: RequestInit) => Promise<any> }) {
  const [creds, setCreds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await call("credentials/list");
    setCreds(r?.credentials || []);
    setLoading(false);
  }, [call]);
  useEffect(() => { reload(); }, [reload]);

  async function save(key: string) {
    if (!value && !confirm("Save empty value? (will fall back to env secret)")) return;
    setSaving(true);
    const r = await call("credentials/save", { method: "POST", body: JSON.stringify({ key_name: key, value }) });
    setSaving(false);
    if (r?.error) { alert("Error: " + r.error); return; }
    setEditing(null); setValue(""); reload();
  }
  async function del(key: string) {
    if (!confirm(`Delete ${key} from database? (env secret will still be used if set)`)) return;
    await call("credentials/delete", { method: "POST", body: JSON.stringify({ key_name: key }) });
    reload();
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5">
        🔐 Credentials are stored encrypted in your database. The system also reads from HF/Supabase environment secrets — <b>both work simultaneously</b>. Database value takes priority when active.
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">{creds.length} keys</div>
        <button onClick={() => setReveal((r) => !r)} className="text-[10px] px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-100">
          {reveal ? "🙈 Hide" : "👁 Reveal inputs"}
        </button>
      </div>

      {loading && <div className="text-xs text-zinc-500 text-center py-6">Loading…</div>}

      <div className="space-y-2">
        {creds.map((c) => (
          <div key={c.key_name} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{c.label}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{c.key_name}</div>
              </div>
              <SourceBadge source={c.source} />
            </div>
            <div className="text-[10px] text-zinc-500 mb-2">{c.help}</div>
            <div className="flex flex-wrap gap-1.5 mb-2 text-[10px]">
              <Pill on={c.env_set} label="ENV" />
              <Pill on={c.db_set} label="DB" />
              {c.updated_at && <span className="text-zinc-600">updated {new Date(c.updated_at).toLocaleDateString()}</span>}
            </div>

            {editing === c.key_name ? (
              <div className="space-y-2">
                <input
                  type={reveal ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Paste new key value…"
                  autoFocus
                  className="w-full text-xs bg-black/50 border border-zinc-800 rounded-lg px-2.5 py-2 font-mono focus:border-amber-700 outline-none"
                />
                <div className="flex gap-1.5">
                  <button onClick={() => save(c.key_name)} disabled={saving}
                          className="flex-1 text-xs py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50">
                    {saving ? "Saving…" : "💾 Save"}
                  </button>
                  <button onClick={() => { setEditing(null); setValue(""); }}
                          className="px-3 text-xs py-1.5 rounded-lg border border-zinc-800 text-zinc-400">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={() => { setEditing(c.key_name); setValue(""); }}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition">
                  {c.db_set ? "✏️ Update" : "+ Add Key"}
                </button>
                {c.db_set && (
                  <button onClick={() => del(c.key_name)}
                          className="px-3 text-xs py-1.5 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-950/30">🗑</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const map: any = {
    db: { c: "bg-amber-900/40 text-amber-300 border-amber-800", t: "DB" },
    env: { c: "bg-blue-900/40 text-blue-300 border-blue-800", t: "ENV" },
    none: { c: "bg-zinc-800 text-zinc-500 border-zinc-700", t: "—" },
  };
  const s = map[source] || map.none;
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${s.c}`}>{s.t}</span>;
}
function Pill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded ${on ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800/60 text-zinc-600"}`}>
      {on ? "✓" : "○"} {label}
    </span>
  );
}

/* ============== Shared ============== */
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: any = {
    amber: "from-amber-950/40 to-amber-900/10 border-amber-900/40 text-amber-400",
    blue: "from-blue-950/40 to-blue-900/10 border-blue-900/40 text-blue-400",
    red: "from-red-950/40 to-red-900/10 border-red-900/40 text-red-400",
  };
  return (
    <div className={`bg-gradient-to-br border rounded-xl p-3 text-center ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">{title}</div>
      {children}
    </div>
  );
}
function List({ items, render }: { items: any[]; render: (i: any) => any }) {
  if (!items?.length) return <Empty msg="—" />;
  return (
    <div className="space-y-1">
      {items.map((i: any, k: number) => (
        <div key={i.id || k} className="text-xs text-zinc-300 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-1.5">{render(i)}</div>
      ))}
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="text-center text-xs text-zinc-500 py-8">{msg}</div>;
}
