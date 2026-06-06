import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Local-only settings for Replit/Capacitor mobile build.
// Keys are kept in sessionStorage so they are cleared when the tab closes
// (avoids leaving plaintext API keys persisted in localStorage).
type Mode = "cloud" | "local" | "hybrid";

const SS_KEY = "tivo_hybrid_settings";
const LEGACY_LS_KEY = "tivo_hybrid_settings";

interface Settings {
  mode: Mode;
  geminiKey: string;
  deepseekKey: string;
  groqKey: string;
  hfToken: string;
  tavilyKey: string;
  githubToken: string;
}

const DEFAULTS: Settings = {
  mode: "hybrid",
  geminiKey: "",
  deepseekKey: "",
  groqKey: "",
  hfToken: "",
  tavilyKey: "",
  githubToken: "",
};

function migrateFromLocalStorage(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      sessionStorage.setItem(SS_KEY, raw);
      localStorage.removeItem(LEGACY_LS_KEY);
      return raw;
    }
  } catch {}
  return null;
}

export default function HybridSettings() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY) || migrateFromLocalStorage();
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function save() {
    sessionStorage.setItem(SS_KEY, JSON.stringify(s));
    try { localStorage.removeItem(LEGACY_LS_KEY); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function field(k: keyof Settings, label: string, placeholder = "") {
    return (
      <label className="block space-y-1">
        <span className="text-xs text-zinc-400">{label}</span>
        <input
          type="password"
          value={s[k] as string}
          placeholder={placeholder}
          onChange={(e) => setS({ ...s, [k]: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
        />
      </label>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">⚙️ Hybrid Mode</h1>
          <Link to="/super-admin/workspace" className="text-xs text-zinc-400 hover:text-zinc-200">← Back</Link>
        </div>

        <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
          <div className="text-xs text-zinc-400">Runtime Mode</div>
          <div className="grid grid-cols-3 gap-2">
            {(["cloud", "hybrid", "local"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setS({ ...s, mode: m })}
                className={`py-2 rounded-lg text-sm border transition ${
                  s.mode === m
                    ? "bg-amber-700 border-amber-600 text-white"
                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <b>cloud</b>: সব Lovable Cloud দিয়ে। <b>hybrid</b>: লগইন/মেমোরি cloud, AI কল লোকাল key দিয়ে। <b>local</b>: পুরোটাই মোবাইলে, কোনো backend নেই।
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
          <div className="text-xs text-zinc-400 mb-1">API Keys (tab-only, sessionStorage)</div>
          {field("geminiKey", "Gemini API Key", "AIza...")}
          {field("deepseekKey", "DeepSeek API Key", "sk-...")}
          {field("groqKey", "Groq API Key", "gsk_...")}
          {field("hfToken", "Hugging Face Token", "hf_...")}
          {field("tavilyKey", "Tavily Search Key", "tvly-...")}
          {field("githubToken", "GitHub Token", "ghp_...")}
          <p className="text-[11px] text-amber-400/90 leading-relaxed">
            ⚠️ Keys শুধু এই tab-এর জন্য মেমরিতে থাকে — tab বন্ধ করলে মুছে যাবে। শেয়ার্ড ডিভাইস হলে অবশ্যই keys rotate করুন।
          </p>
        </div>

        <button
          onClick={save}
          className="w-full py-3 rounded-lg bg-amber-700 hover:bg-amber-600 font-medium transition"
        >
          {saved ? "✓ Saved" : "Save (this tab)"}
        </button>

        <p className="text-[11px] text-zinc-600 text-center">
          এই key গুলো শুধু এই ডিভাইসে থাকে — সার্ভারে পাঠানো হয় না।
        </p>
      </div>
    </main>
  );
}

export function getHybridSettings(): Settings {
  try {
    const raw = sessionStorage.getItem(SS_KEY) || migrateFromLocalStorage();
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}
