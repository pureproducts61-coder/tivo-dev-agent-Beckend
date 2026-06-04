import { ReactNode, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { useAlerts } from "@/hooks/useAlerts";
import { SettingsSheet } from "./SettingsSheet";

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout } = useSuperAdmin();
  const nav = useNavigate();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 top-0 h-full w-72 bg-zinc-950 border-r border-zinc-800 p-4 space-y-2 overflow-y-auto"
      >
        <div className="text-amber-500 font-bold text-lg mb-4">TIVO</div>
        {[
          { to: "/super-admin/app/chats", label: "💬 Chats" },
          { to: "/super-admin/app/projects", label: "📦 Projects" },
          { to: "/super-admin/app/users", label: "👥 Users" },
          { to: "/super-admin/app/system", label: "⚙️ System" },
          { to: "/super-admin/workspace", label: "🤖 AI Workspace" },
          { to: "/super-admin/dashboard", label: "📊 Legacy Dashboard" },
          { to: "/super-admin/debug", label: "🔧 Debug" },
        ].map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            onClick={onClose}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm transition ${
                isActive ? "bg-amber-700 text-white" : "text-zinc-300 hover:bg-zinc-900"
              }`
            }
          >
            {i.label}
          </NavLink>
        ))}
        <div className="pt-4 border-t border-zinc-800">
          <button
            onClick={() => {
              logout();
              nav("/super-admin/login");
            }}
            className="w-full px-3 py-2 text-sm rounded-lg text-red-400 hover:bg-red-950/30"
          >
            🚪 Logout
          </button>
        </div>
      </aside>
    </div>
  );
}

function BellButton({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button onClick={onClick} className="relative p-2 rounded-lg hover:bg-zinc-900" aria-label="Alerts">
      <span className="text-xl">🔔</span>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-bold flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function AlertsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { alerts, markAllRead } = useAlerts();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-80 max-w-[90vw] bg-zinc-950 border-l border-zinc-800 flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="font-bold">🔔 Alerts</h2>
          <button onClick={markAllRead} className="text-xs text-amber-500 hover:underline">
            Mark all read
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {alerts.length === 0 && <p className="text-xs text-zinc-500 text-center py-8">No alerts yet</p>}
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`p-3 rounded-lg border text-xs ${
                a.level === "critical"
                  ? "bg-red-950/30 border-red-800"
                  : a.level === "warning"
                  ? "bg-amber-950/30 border-amber-800"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <div className="font-semibold">{a.title}</div>
              {a.message && <div className="text-zinc-400 mt-1">{a.message}</div>}
              <div className="text-zinc-600 mt-1">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function BottomTabs() {
  const tabs = [
    { to: "/super-admin/app/chats", icon: "💬", label: "Chats" },
    { to: "/super-admin/app/projects", icon: "📦", label: "Projects" },
    { to: "/super-admin/app/users", icon: "👥", label: "Users" },
    { to: "/super-admin/app/system", icon: "⚙️", label: "System" },
  ];
  return (
    <nav className="sticky bottom-0 z-30 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 grid grid-cols-4">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `flex flex-col items-center py-2.5 text-[11px] transition ${
              isActive ? "text-amber-500" : "text-zinc-500"
            }`
          }
        >
          <span className="text-lg">{t.icon}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { session } = useSuperAdmin();
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { unreadCount } = useAlerts();

  if (!session) {
    nav("/super-admin/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 flex items-center justify-between px-3 py-2">
        <button onClick={() => setDrawer(true)} className="p-2 rounded-lg hover:bg-zinc-900" aria-label="Menu">
          <span className="text-xl">☰</span>
        </button>
        <Link to="/super-admin/app/chats" className="font-bold text-amber-500 tracking-wide">
          TIVO
        </Link>
        <div className="flex items-center gap-1">
          <BellButton onClick={() => setAlertsOpen(true)} count={unreadCount} />
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-zinc-900"
            aria-label="Settings"
          >
            <span className="text-xl">⚙️</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children ?? <Outlet />}</main>

      <BottomTabs />

      <Drawer open={drawer} onClose={() => setDrawer(false)} />
      <AlertsPanel open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
