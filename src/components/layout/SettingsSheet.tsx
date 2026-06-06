import { useEffect, useState } from "react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;
// Keys kept tab-scoped in sessionStorage; never persisted to localStorage.
const SS_KEY = "tivo_hybrid_settings";
const LEGACY_LS_KEY = "tivo_hybrid_settings";

type Mode = "cloud" | "hybrid" | "local";

interface Settings {
  mode: Mode;
  geminiKey: string;
  deepseekKey: string;
  groqKey: string;
  hfToken: string;
  tavilyKey: string;
  githubToken: string;
  redirectUrl: string;
  useCloudKeys: boolean;
}

const DEFAULTS: Settings = {
  mode: "hybrid",
  geminiKey: "",
  deepseekKey: "",
  groqKey: "",
  hfToken: "",
  tavilyKey: "",
  githubToken: "",
  redirectUrl: "app.lovable.tivo://auth",
  useCloudKeys: true,
};

const PROVIDERS: { key: keyof Settings; label: string; placeholder: string; testName: string }[] = [
  { key: "geminiKey", label: "Gemini API Key", placeholder: "AIza...", testName: "gemini" },
  { key: "deepseekKey", label: "DeepSeek API Key", placeholder: "sk-...", testName: "deepseek" },
  { key: "groqKey", label: "Groq API Key", placeholder: "gsk_...", testName: "groq" },
  { key: "hfToken", label: "Hugging Face Token", placeholder: "hf_...", testName: "hf" },
  { key: "tavilyKey", label: "Tavily Search Key", placeholder: "tvly-...", testName: "tavily" },
  { key: "githubToken", label: "GitHub Token", placeholder: "ghp_...", testName: "github" },
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useSuperAdmin();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, "ok" | "fail" | undefined>>({});

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
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, [open]);

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

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          {/* Mode */}
          <section className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <div className="text-xs text-zinc-400">Runtime Mode</div>
            <div className="grid grid-cols-3 gap-2">
              {(["cloud", "hybrid", "local"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setS({ ...s, mode: m })}
                  className={`py-2 rounded-lg text-xs border transition ${
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
              <b>cloud</b>: সব backend দিয়ে · <b>hybrid</b>: login cloud, AI device key · <b>local</b>: পুরোটাই device-এ
            </p>
            <label className="flex items-center gap-2 text-xs text-zinc-300 pt-1">
              <input
                type="checkbox"
                checked={s.useCloudKeys}
                onChange={(e) => setS({ ...s, useCloudKeys: e.target.checked })}
              />
              Cloud secrets fallback (device key খালি থাকলে cloud থেকে নিবে)
            </label>
          </section>

          {/* Magic link redirect */}
          <section className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <div className="text-xs text-zinc-400">Magic Link Redirect URL</div>
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
              Supabase Dashboard → Authentication → URL Configuration → Redirect URLs-এ paste করো।
            </p>
          </section>

          {/* Provider keys */}
          <section className="rounded-xl border border-zinc-800 p-3 space-y-3">
            <div className="text-xs text-zinc-400">Provider Keys (tab-only, sessionStorage)</div>
            <p className="text-[11px] text-amber-400/90">⚠️ Tab বন্ধ করলে keys মুছে যাবে — শেয়ার্ড ডিভাইসে keys rotate করুন।</p>
            {PROVIDERS.map((p) => (
              <div key={p.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300">{p.label}</span>
                  {results[p.testName] === "ok" && <span className="text-green-500 text-[11px]">✓ OK</span>}
                  {results[p.testName] === "fail" && <span className="text-red-500 text-[11px]">✕ Fail</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={s[p.key] as string}
                    placeholder={p.placeholder}
                    onChange={(e) => setS({ ...s, [p.key]: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs"
                  />
                  <button
                    disabled={testing === p.testName}
                    onClick={() => testConnection(p.testName, s[p.key] as string)}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-xs disabled:opacity-50"
                  >
                    {testing === p.testName ? "..." : "Test"}
                  </button>
                </div>
              </div>
            ))}
          </section>
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
