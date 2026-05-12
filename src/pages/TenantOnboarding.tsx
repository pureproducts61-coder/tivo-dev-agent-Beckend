import { useEffect, useState } from "react";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

interface TenantInfo {
  your_tenant_id: string;
  total_tenants_configured: number;
  custom_database: boolean;
  database_active: boolean;
  isolation: string;
}

interface SetupResult {
  success: boolean;
  schema_applied?: boolean;
  auto_apply_failed?: boolean;
  hint?: string;
  sql_to_run?: string;
  error?: string;
  tenant_id?: string;
}

export default function TenantOnboarding() {
  const [secret, setSecret] = useState(() => localStorage.getItem("tivo_master_secret") || "");
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [errInfo, setErrInfo] = useState<string | null>(null);

  // Setup form
  const [supaUrl, setSupaUrl] = useState("");
  const [supaKey, setSupaKey] = useState("");
  const [migrate, setMigrate] = useState(true);
  const [setupRes, setSetupRes] = useState<SetupResult | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [steps, setSteps] = useState<{ label: string; status: "pending" | "running" | "done" | "fail" }[]>([]);

  async function loadInfo() {
    if (!secret) return;
    setLoading(true); setErrInfo(null); setInfo(null);
    try {
      const r = await fetch(`${BACKEND}/functions/v1/backend-api/tenant-info`, {
        headers: { "x-master-secret": secret },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setInfo(data);
      localStorage.setItem("tivo_master_secret", secret);
    } catch (e: any) {
      setErrInfo(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (secret) loadInfo(); }, []);

  async function setupCustomDb() {
    setSetupBusy(true); setSetupRes(null);
    const initial = [
      { label: "Validate credentials", status: "running" as const },
      { label: "Apply schema (tables + indexes)", status: "pending" as const },
      ...(migrate ? [{ label: "Migrate existing projects → tenant_projects", status: "pending" as const }] : []),
      { label: "Verify connection", status: "pending" as const },
    ];
    setSteps(initial);

    const setStep = (i: number, status: "running" | "done" | "fail", labelSuffix?: string) => {
      setSteps((s) => s.map((x, j) => j === i ? { ...x, status, label: labelSuffix ? `${x.label} ${labelSuffix}` : x.label } : x));
    };

    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastData: SetupResult | null = null;

    try {
      setStep(0, "done"); setStep(1, "running");

      while (attempt < MAX_RETRIES) {
        attempt++;
        if (attempt > 1) setStep(1, "running", `(retry ${attempt}/${MAX_RETRIES})`);
        const r = await fetch(`${BACKEND}/functions/v1/backend-api/setup-custom-db`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-master-secret": secret },
          body: JSON.stringify({
            supabase_url: supaUrl || undefined,
            service_role_key: supaKey || undefined,
            migrate_data: migrate,
          }),
        });
        lastData = await r.json();
        if (lastData?.success) break;
        // Don't retry validation errors (400 with no auto_apply_failed flag)
        if (!lastData?.auto_apply_failed && r.status >= 400 && r.status < 500) break;
        // backoff before retry
        await new Promise(res => setTimeout(res, 1500 * attempt));
      }

      setSetupRes(lastData);
      if (lastData?.success) {
        setStep(1, "done");
        if (migrate) setStep(2, "done");
        setStep(initial.length - 1, "done");
      } else {
        setStep(1, "fail");
      }
    } catch (e: any) {
      setSetupRes({ success: false, error: e.message });
      setStep(1, "fail");
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">← Back</a>
          <h1 className="text-xl font-bold">🏢 Tenant Onboarding</h1>
          <div className="w-12" />
        </div>

        {/* Step 1: Master secret */}
        <section className="border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="text-sm font-semibold">Step 1 — Your master secret</div>
          <input
            type="password"
            placeholder="Paste your MASTER_SECRET / MASTER_SECRET_2..."
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
          />
          <button
            onClick={loadInfo}
            disabled={!secret || loading}
            className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load Tenant Info"}
          </button>
          {errInfo && <div className="text-sm text-red-400">{errInfo}</div>}
        </section>

        {/* Step 2: Info */}
        {info && (
          <section className="border border-zinc-800 rounded-xl p-5 space-y-2">
            <div className="text-sm font-semibold mb-3">Step 2 — Your tenant snapshot</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-zinc-900 rounded-lg p-3">
                <div className="text-[10px] uppercase text-zinc-500">Tenant ID</div>
                <div className="font-mono text-amber-300">{info.your_tenant_id}</div>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3">
                <div className="text-[10px] uppercase text-zinc-500">Total tenants</div>
                <div className="font-mono">{info.total_tenants_configured}</div>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3">
                <div className="text-[10px] uppercase text-zinc-500">Custom DB</div>
                <div>{info.custom_database ? "✅ Yes" : "❌ No (using default)"}</div>
              </div>
              <div className="bg-zinc-900 rounded-lg p-3">
                <div className="text-[10px] uppercase text-zinc-500">DB Active</div>
                <div>{info.database_active ? "✅ Connected" : "❌ Down"}</div>
              </div>
            </div>
            <div className="text-xs text-zinc-400 pt-2">{info.isolation}</div>
          </section>
        )}

        {/* Step 3: Setup custom DB */}
        {info && (
          <section className="border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="text-sm font-semibold">Step 3 — Connect your own Supabase (optional)</div>
            <p className="text-xs text-zinc-500">Leave blank to use the values already configured in HF Space secrets (CUSTOM_SUPABASE_URL / CUSTOM_SUPABASE_SERVICE_ROLE_KEY).</p>
            <input
              placeholder="https://xxx.supabase.co (optional override)"
              value={supaUrl}
              onChange={(e) => setSupaUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
            />
            <input
              type="password"
              placeholder="Service role key (optional override)"
              value={supaKey}
              onChange={(e) => setSupaKey(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-700"
            />
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={migrate} onChange={(e) => setMigrate(e.target.checked)} />
              Migrate existing projects to new DB (recommended)
            </label>
            <button
              onClick={setupCustomDb}
              disabled={setupBusy}
              className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-sm font-medium disabled:opacity-50"
            >
              {setupBusy ? "Running..." : "🚀 Run Setup"}
            </button>
          </section>
        )}

        {/* Step 4: Migration progress dashboard */}
        {steps.length > 0 && (
          <section className="border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="text-sm font-semibold">Migration Progress</div>
            <ul className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-5">
                    {s.status === "done" ? "✅" : s.status === "fail" ? "❌" : s.status === "running" ? <span className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse" /> : "⏳"}
                  </span>
                  <span className={s.status === "done" ? "text-emerald-300" : s.status === "fail" ? "text-red-400" : "text-zinc-300"}>{s.label}</span>
                </li>
              ))}
            </ul>

            {setupRes && (
              <div className={`mt-4 rounded-lg p-3 text-xs ${setupRes.success ? "bg-emerald-950/30 border border-emerald-800/40 text-emerald-200" : "bg-red-950/30 border border-red-900/40 text-red-200"}`}>
                {setupRes.success && <div>✅ Schema applied to tenant <code>{setupRes.tenant_id}</code></div>}
                {setupRes.error && <div>Error: {setupRes.error}</div>}
                {setupRes.hint && <div className="mt-1 opacity-80">{setupRes.hint}</div>}
                {setupRes.sql_to_run && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">📜 SQL to run manually</summary>
                    <pre className="mt-2 max-h-64 overflow-auto bg-black/40 p-2 rounded text-[10px] text-zinc-300 whitespace-pre-wrap">{setupRes.sql_to_run}</pre>
                  </details>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
