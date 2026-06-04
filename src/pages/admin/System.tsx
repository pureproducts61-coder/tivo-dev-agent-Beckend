import { Link } from "react-router-dom";

const TILES = [
  { to: "/super-admin/dashboard", icon: "📊", label: "Dashboard", desc: "Reports, proposed changes, audit" },
  { to: "/super-admin/debug", icon: "🔧", label: "Debug", desc: "Diagnostics, health, capabilities" },
  { to: "/super-admin/hybrid", icon: "🔑", label: "Credentials", desc: "API keys, mode, redirect URL" },
  { to: "/super-admin/workspace", icon: "🤖", label: "AI Workspace", desc: "Chat with TIVO agent" },
];

export default function System() {
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-lg font-bold">⚙️ System</h1>
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-amber-700 transition"
          >
            <div className="text-2xl mb-2">{t.icon}</div>
            <div className="text-sm font-semibold">{t.label}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{t.desc}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800 p-4 text-xs text-zinc-400 space-y-2">
        <div className="font-semibold text-zinc-200">🛡️ Security status</div>
        <ul className="space-y-1 list-disc list-inside text-zinc-500">
          <li>RLS enabled on all sensitive tables (deny-all)</li>
          <li>Realtime broadcast: proposed_changes / notifications / security_events <b>removed</b></li>
          <li>projects.tenant_id + user_id immutable (trigger)</li>
          <li>Super Admin lock: email + master secret required</li>
        </ul>
      </div>
    </div>
  );
}
