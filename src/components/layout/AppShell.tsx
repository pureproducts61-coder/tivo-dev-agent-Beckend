import { ReactNode, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  MessageSquare, FolderKanban, Users, Cog, CheckSquare,
  Bell, Settings as SettingsIcon, Menu, LogOut, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { useAlerts } from "@/hooks/useAlerts";
import { SettingsSheet } from "./SettingsSheet";
import { Petals } from "./Petals";

// Single source of truth — no duplicate "Tools" section.
// Legacy Dashboard / Debug / AI Workspace are reachable from the Settings gear.
const NAV_PRIMARY = [
  { to: "/super-admin/app/chats", icon: MessageSquare, label: "Chat" },
  { to: "/super-admin/app/approvals", icon: CheckSquare, label: "Approvals" },
  { to: "/super-admin/app/projects", icon: FolderKanban, label: "Projects" },
  { to: "/super-admin/app/users", icon: Users, label: "Users" },
  { to: "/super-admin/app/system", icon: Cog, label: "System" },
];

function SidebarItem({ to, icon: Icon, label, collapsed }: any) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition ${
          isActive
            ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
        }`
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function DesktopSidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const { logout, session } = useSuperAdmin();
  const nav = useNavigate();
  return (
    <aside
      className={`hidden md:flex sticky top-0 h-screen flex-col bg-zinc-950 border-r border-zinc-900 transition-all duration-200 ${
        collapsed ? "w-[68px]" : "w-64"
      }`}
    >
      <div className="flex items-center justify-end px-2 h-14 border-b border-zinc-900">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-8 h-8 rounded-md hover:bg-zinc-900 text-zinc-400 hover:text-amber-400 flex items-center justify-center"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <div className="space-y-0.5">
          {!collapsed && <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-widest text-zinc-600">Workspace</div>}
          {NAV_PRIMARY.map((i) => (
            <SidebarItem key={i.to} {...i} collapsed={collapsed} />
          ))}
        </div>
        {/* Legacy tools moved into Settings gear — no duplicates here. */}
      </div>

      <div className="border-t border-zinc-900 p-2">
        {!collapsed && session?.email && (
          <div className="px-2 py-1.5 text-[11px] text-zinc-500 truncate">{session.email}</div>
        )}
        <button
          onClick={() => {
            logout();
            nav("/super-admin/login");
          }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-red-400 hover:bg-red-950/20"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout, session } = useSuperAdmin();
  const nav = useNavigate();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 top-0 h-full w-72 bg-zinc-950 border-r border-zinc-900 flex flex-col animate-fade-in"
      >
        <div className="flex items-center px-3 h-14 border-b border-zinc-900">
          <div className="min-w-0 flex-1">
            <div className="tivo-wordmark text-sm">TIVO</div>
            <div className="text-[10px] text-zinc-500 truncate">{session?.email}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          <div>
            <div className="px-2 pb-1 text-[10px] uppercase tracking-widest text-zinc-600">Workspace</div>
            {NAV_PRIMARY.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm ${
                    isActive ? "bg-amber-500/10 text-amber-300" : "text-zinc-300 hover:bg-zinc-900"
                  }`
                }
              >
                <i.icon className="w-4 h-4" />
                {i.label}
              </NavLink>
            ))}
          </div>
          {/* Legacy tools moved into Settings gear — no duplicates here. */}
        </div>
        <div className="border-t border-zinc-900 p-2">
          <button
            onClick={() => {
              logout();
              nav("/super-admin/login");
            }}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-red-400 hover:bg-red-950/20"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>
    </div>
  );
}

function AlertsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { alerts, markAllRead } = useAlerts();
  const nav = useNavigate();

  function handleAlertClick(a: any) {
    // Preserve the alert as a draft in sessionStorage; ChatScreen will consume it.
    const draft = a.action_prompt || a.prompt || a.message || a.title || "";
    if (draft) {
      try { sessionStorage.setItem("tivo_input_draft", draft); } catch {}
      window.dispatchEvent(new CustomEvent("tivo:input-draft", { detail: draft }));
    }
    onClose();
    nav("/super-admin/app/chats");
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-80 max-w-[92vw] bg-zinc-950 border-l border-zinc-900 flex flex-col animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-900">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" /> Alerts
          </h2>
          <button onClick={markAllRead} className="text-[11px] text-amber-400 hover:underline">
            Mark all read
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {alerts.length === 0 && <p className="text-xs text-zinc-500 text-center py-10">No alerts yet</p>}
          {alerts.map((a) => (
            <button
              key={a.id}
              onClick={() => handleAlertClick(a)}
              className={`w-full text-left p-3 rounded-lg border text-xs transition hover:border-amber-700/60 ${
                a.level === "critical"
                  ? "bg-red-950/30 border-red-800"
                  : a.level === "warning"
                  ? "bg-amber-950/30 border-amber-800"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <div className="font-semibold">{a.title}</div>
              {a.message && <div className="text-zinc-400 mt-1">{a.message}</div>}
              <div className="text-zinc-600 mt-1 flex items-center justify-between">
                <span>{new Date(a.created_at).toLocaleString()}</span>
                <span className="text-amber-400/70">Open in chat →</span>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}


export function AppShell({ children }: { children?: ReactNode }) {
  const { session } = useSuperAdmin();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { unreadCount } = useAlerts();

  if (!session) {
    nav("/super-admin/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <DesktopSidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-900 relative overflow-hidden">
          <Petals count={12} />
          <div className="flex items-center justify-between px-3 sm:px-5 h-14 gap-2 relative">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <button
                onClick={() => setDrawer(true)}
                className="p-2 rounded-lg hover:bg-zinc-900 md:hidden"
                aria-label="Menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>

            {/* Centered golden animated wordmark */}
            <h1 className="tivo-wordmark absolute left-1/2 -translate-x-1/2 text-[13px] sm:text-base whitespace-nowrap pointer-events-none select-none">
              TIVO DEV AGENT
            </h1>

            <div className="flex items-center gap-1 flex-1 justify-end">
              <button
                onClick={() => setAlertsOpen(true)}
                className="relative p-2 rounded-lg hover:bg-zinc-900"
                aria-label="Alerts"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-zinc-900"
                aria-label="Settings"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col">{children ?? <Outlet />}</main>
      </div>

      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
      <AlertsPanel open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
