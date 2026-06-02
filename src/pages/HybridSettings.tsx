import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Local-only settings for Replit/Capacitor mobile build.
// Keys are saved to localStorage and read by AI calls when mode === "local".
type Mode = "cloud" | "local" | "hybrid";

const LS_KEY = "tivo_hybrid_settings";

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

export default function HybridSettings() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
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
          <div className="text-xs text-zinc-400 mb-1">API Keys (device-only, localStorage)</div>
          {field("geminiKey", "Gemini API Key", "AIza...")}
          {field("deepseekKey", "DeepSeek API Key", "sk-...")}
          {field("groqKey", "Groq API Key", "gsk_...")}
          {field("hfToken", "Hugging Face Token", "hf_...")}
          {field("tavilyKey", "Tavily Search Key", "tvly-...")}
          {field("githubToken", "GitHub Token", "ghp_...")}
        </div>

        <button
          onClick={save}
          className="w-full py-3 rounded-lg bg-amber-700 hover:bg-amber-600 font-medium transition"
        >
          {saved ? "✓ Saved" : "Save Locally"}
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
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}
