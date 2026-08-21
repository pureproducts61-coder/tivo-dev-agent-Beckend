import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { PROVIDER_REGISTRY, type CredentialKey } from "@/lib/providers";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;
// Keys kept tab-scoped in sessionStorage; never persisted to localStorage.
const SS_KEY = "tivo_hybrid_settings";
const LEGACY_LS_KEY = "tivo_hybrid_settings";

type Mode = "cloud" | "hybrid" | "local" | "offline";

/** Provider keys are stored under their canonical credential key (see src/lib/providers.ts). */
type ProviderKeys = Partial<Record<CredentialKey, string>>;

interface Settings extends ProviderKeys {
  mode: Mode;
  redirectUrl: string;
  useCloudKeys: boolean;
}

/** Legacy shorthand → canonical credential key (migrates old sessionStorage blobs). */
const LEGACY_KEY_MAP: Record<string, CredentialKey> = {
  geminiKey: "GEMINI_API_KEY",
  deepseekKey: "DEEPSEEK_API_KEY",
  groqKey: "GROQ_API_KEY",
  hfToken: "HF_INFERENCE_TOKEN",
  tavilyKey: "TAVILY_API_KEY",
  githubToken: "GITHUB_TOKEN",
};

const DEFAULTS: Settings = {
  mode: "hybrid",
  redirectUrl: "app.lovable.tivo://auth",
  useCloudKeys: true,
};

/** Only user-suppliable providers are editable here; LOVABLE_API_KEY is cloud-managed. */
const PROVIDERS = PROVIDER_REGISTRY.filter((p) => p.key !== "LOVABLE_API_KEY");

function migrate(raw: string): Settings {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const [k, v] of Object.entries(parsed)) {
    const canonical = LEGACY_KEY_MAP[k];
    if (canonical) out[canonical] = v;
    else out[k] = v;
  }
  return out as unknown as Settings;
}

type SectionId = "general" | "ai" | "runtime" | "credentials" | "security" | "storage" | "advanced";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "ai", label: "AI" },
  { id: "runtime", label: "Runtime" },
  { id: "credentials", label: "Credentials" },
  { id: "security", label: "Security" },
  { id: "storage", label: "Storage" },
  { id: "advanced", label: "Advanced" },
];

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-zinc-800 p-3 space-y-2">
    <div className="text-xs text-zinc-400">{title}</div>
    {children}
  </section>
);

export function SettingsSheet({
  open,
  onClose,
  section = "general",
}: {
  open: boolean;
  onClose: () => void;
  section?: string;
}) {
  const { session } = useSuperAdmin();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [tab, setTab] = useState<SectionId>("general");
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, "ok" | "fail" | undefined>>({});
  const [constitution, setConstitution] = useState<string | null>(null);

  useEffect(() => {
    const valid = SECTIONS.some((x) => x.id === section);
    setTab((valid ? section : "general") as SectionId);
  }, [section, open]);

  useEffect(() => {
    try {
      let raw = sessionStorage.getItem(SS_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_LS_KEY);
        if (legacy) {
          sessionStorage.setItem(SS_KEY, legacy);
          localStorage.removeItem(LEGACY_LS_KEY);
          raw = legacy;
        }
      }
      if (raw) setS(migrate(raw));
    } catch {}
  }, [open]);

  // Canonical constitution lives in the DB — read-only preview here.
  useEffect(() => {
    if (!open || tab !== "ai" || constitution !== null) return;
    supabase
      .from("ai_constitution")
      .select("content")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setConstitution((data as any)?.content ?? ""));
  }, [open, tab, constitution]);

  if (!open) return null;

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(s));
    try { localStorage.removeItem(LEGACY_LS_KEY); } catch {}
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  async function testConnection(provider: string, value: string) {
    if (!value && !s.useCloudKeys) {
      setResults((r) => ({ ...r, [provider]: "fail" }));
      return;
    }
    setTesting(provider);
    try {
      const res = await fetch(`${BACKEND}/functions/v1/backend-api/credentials/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.masterSecret ? { "x-master-secret": session.masterSecret } : {}),
        },
        body: JSON.stringify({ provider, value: value || undefined, useCloud: !value || s.useCloudKeys }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      setResults((r) => ({ ...r, [provider]: res.ok && data.ok !== false ? "ok" : "fail" }));
    } catch {
      setResults((r) => ({ ...r, [provider]: "fail" }));
    } finally {
      setTesting(null);
    }
  }

  function copyRedirect() {
    navigator.clipboard?.writeText(s.redirectUrl);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  const linkCls =
    "py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-center hover:border-amber-700";

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-[420px] max-w-[95vw] bg-zinc-950 border-l border-zinc-800 flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="font-bold">⚙️ Settings</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        {/* Section tabs — one canonical settings surface, no scattered tool lists */}
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-zinc-900 shrink-0">
          {SECTIONS.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border transition ${
                tab === x.id
                  ? "bg-amber-700 border-amber-600 text-white"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {tab === "general" && (
            <>
              <Card title="Super Admin">
                <div className="text-xs text-zinc-300 truncate">{session?.email || "—"}</div>
                <p className="text-[11px] text-zinc-500">Tab-scoped session · 8 ঘন্টা পরে auto logout।</p>
              </Card>
              <Card title="Magic Link Redirect URL">
                <div className="flex gap-2">
                  <input
                    value={s.redirectUrl}
                    onChange={(e) => setS({ ...s, redirectUrl: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs"
                  />
                  <button onClick={copyRedirect} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs">
                    Copy
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Auth settings-এ Redirect URL হিসেবে এটি যোগ করো।
                </p>
              </Card>
            </>
          )}

          {tab === "ai" && (
            <>
              <Card title="Models">
                <p className="text-[11px] text-zinc-500">
                  Model Manager (register / activate / delete) backend প্রস্তুত; UI এখানে আসবে।
                </p>
              </Card>
              <Card title="Providers">
                <p className="text-[11px] text-zinc-500">
                  Provider keys Credentials ট্যাবে — এখানে ডুপ্লিকেট নেই।
                </p>
                <button
                  onClick={() => setTab("credentials")}
                  className="w-full py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs hover:border-amber-700"
                >
                  Open Credentials →
                </button>
              </Card>
              <Card title="Routing">
                <p className="text-[11px] text-zinc-500">
                  Cloud AI Gateway default; device key থাকলে সেটি আগে ব্যবহার হয় (Runtime mode অনুযায়ী)।
                </p>
              </Card>
              <Card title="AI Constitution (read-only)">
                <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {constitution === null ? "Loading…" : constitution || "DB-তে constitution পাওয়া যায়নি — fallback ব্যবহার হচ্ছে।"}
                </pre>
              </Card>
            </>
          )}

          {tab === "runtime" && (
            <Card title="Runtime Mode">
              <div className="grid grid-cols-4 gap-2">
                {(["cloud", "hybrid", "local", "offline"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setS({ ...s, mode: m })}
                    className={`py-2 rounded-lg text-[11px] border transition ${
                      s.mode === m
                        ? "bg-amber-700 border-amber-600 text-white"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">
                <b>cloud</b>: সব backend দিয়ে · <b>hybrid</b>: login cloud, AI device key · <b>local</b>: পুরোটাই device-এ · <b>offline</b>: শুধু cached data
              </p>
              <label className="flex items-center gap-2 text-xs text-zinc-300 pt-1">
                <input
                  type="checkbox"
                  checked={s.useCloudKeys}
                  onChange={(e) => setS({ ...s, useCloudKeys: e.target.checked })}
                />
                Cloud secrets fallback (device key খালি থাকলে cloud থেকে নিবে)
              </label>
            </Card>
          )}

          {tab === "credentials" && (
            <Card title="Provider Keys (tab-only, sessionStorage)">
              <p className="text-[11px] text-amber-400/90">⚠️ Tab বন্ধ করলে keys মুছে যাবে — শেয়ার্ড ডিভাইসে keys rotate করুন।</p>
              {PROVIDERS.map((p) => (
                <div key={p.key} className="space-y-1 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-300">{p.label}</span>
                    {results[p.key] === "ok" && <span className="text-green-500 text-[11px]">✓ OK</span>}
                    {results[p.key] === "fail" && <span className="text-red-500 text-[11px]">✕ Fail</span>}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={s[p.key] ?? ""}
                      placeholder={p.placeholder}
                      onChange={(e) => setS({ ...s, [p.key]: e.target.value })}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs"
                    />
                    <button
                      disabled={testing === p.key}
                      onClick={() => testConnection(p.key, s[p.key] ?? "")}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-xs disabled:opacity-50"
                    >
                      {testing === p.key ? "..." : "Test"}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-600">{p.key} · {p.help}</p>
                </div>
              ))}
            </Card>
          )}

          {tab === "security" && (
            <>
              <Card title="Security status">
                <ul className="space-y-1 list-disc list-inside text-[11px] text-zinc-500">
                  <li>RLS enabled on all sensitive tables (deny-all default)</li>
                  <li>Super Admin lock: email + master secret required</li>
                  <li>Backend rate limiting active (60 req/min)</li>
                  <li>Project ownership verified server-side for update/delete/publish</li>
                </ul>
              </Card>
              <Card title="Diagnostics">
                <Link onClick={onClose} to="/super-admin/debug" className={`block ${linkCls} text-xs`}>
                  🔧 Debug &amp; health
                </Link>
              </Card>
            </>
          )}

          {tab === "storage" && (
            <Card title="Storage">
              <p className="text-[11px] text-zinc-500">
                Project artifacts ও model files Cloud storage-এ থাকে। Download link গুলো signed URL (1 ঘণ্টা TTL)।
              </p>
            </Card>
          )}

          {tab === "advanced" && (
            <Card title="Legacy tools">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <Link onClick={onClose} to="/super-admin/app/system" className={linkCls}>⚙️ System</Link>
                <Link onClick={onClose} to="/super-admin/workspace" className={linkCls}>🤖 AI Workspace</Link>
                <Link onClick={onClose} to="/super-admin/dashboard" className={linkCls}>📊 Dashboard</Link>
                <Link onClick={onClose} to="/super-admin/app/users" className={linkCls}>👥 Users</Link>
              </div>
              <p className="text-[11px] text-zinc-600">
                এই screen গুলো compatibility-এর জন্য রাখা — primary navigation-এ নেই।
              </p>
            </Card>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={save}
            className="w-full py-2.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-sm font-medium"
          >
            {savedFlash ? "✓ Saved" : "Save"}
          </button>
        </div>
      </aside>
    </div>
  );
}
