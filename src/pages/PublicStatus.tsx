import { useEffect, useMemo, useState } from "react";

const PUBLIC_NOTICES = [
  "সতর্কতা: কোনো ব্যক্তিগত পাসওয়ার্ড, OTP বা সিক্রেট এখানে শেয়ার করবেন না।",
  "সতর্কতা: সিস্টেম রক্ষণাবেক্ষণ চলমান—গুরুত্বপূর্ণ কাজের আগে ব্যাকআপ রাখুন।",
  "সতর্কতা: অনুমোদন ছাড়া অ্যাডমিন এক্সেস বা মাস্টার সিক্রেট কারও সাথে শেয়ার করবেন না।",
  "সতর্কতা: নতুন আপডেট লাইভে দেওয়ার আগে টেস্ট পরিবেশে যাচাই করুন।",
  "সতর্কতা: সন্দেহজনক ইনপুট বা অস্বাভাবিক আচরণ দেখলে সাথে সাথে রিপোর্ট করুন।",
  "সতর্কতা: এই সিস্টেমের অপারেশনাল কমান্ড শুধু অনুমোদিত উৎস থেকে গ্রহণযোগ্য।",
];

interface HealthData {
  status: string;
  version: string;
  database: string;
  storage: string;
  ai_gateway: string;
  master_secret: string;
  total_endpoints: number;
  ai_only_mode: boolean;
}

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    online: "bg-emerald-500",
    connected: "bg-emerald-500",
    configured: "bg-emerald-500",
    ok: "bg-emerald-500",
    degraded: "bg-amber-500",
    degraded_no_db: "bg-amber-500",
    missing: "bg-red-500",
    not_configured: "bg-zinc-500",
    error: "bg-red-500",
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || "bg-zinc-500"}`} />
  );
};

const PublicStatus = () => {
  const [noticeIndex, setNoticeIndex] = useState(() => new Date().getHours() % PUBLIC_NOTICES.length);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    const fetchHealth = async () => {
      if (!supabaseUrl) { setLoading(false); return; }
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/backend-api/health`);
        if (res.ok) setHealth(await res.json());
      } catch {}
      setLoading(false);
      setLastChecked(new Date());
    };
    fetchHealth();
    const id = setInterval(fetchHealth, 60_000);
    return () => clearInterval(id);
  }, [supabaseUrl]);

  useEffect(() => {
    const sync = () => setNoticeIndex(new Date().getHours() % PUBLIC_NOTICES.length);
    sync();
    const id = setInterval(sync, 3600_000);
    return () => clearInterval(id);
  }, []);

  const currentNotice = useMemo(() => PUBLIC_NOTICES[noticeIndex], [noticeIndex]);

  const services = health ? [
    { label: "Database", status: health.database },
    { label: "Storage", status: health.storage },
    { label: "AI Gateway", status: health.ai_gateway },
    { label: "Auth (Secret)", status: health.master_secret },
  ] : [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4 py-8">
      <section className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">TIVO DEV AGENT</h1>
          <p className="text-sm sm:text-base text-zinc-400">Autonomous Software Factory Engine</p>
          {health && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <StatusBadge status={health.status} />
              <span className="text-xs uppercase tracking-widest text-zinc-400">
                {health.status === "online" ? "All Systems Operational" : health.status === "degraded_no_db" ? "AI-Only Mode" : "Degraded"}
              </span>
              <span className="text-xs text-zinc-600">v{health.version}</span>
            </div>
          )}
        </div>

        {/* Service Status */}
        {loading ? (
          <div className="border border-zinc-800 rounded-xl p-6 text-center">
            <div className="animate-pulse text-zinc-500">Checking systems...</div>
          </div>
        ) : health ? (
          <div className="border border-zinc-800 rounded-xl divide-y divide-zinc-800">
            {services.map((s) => (
              <div key={s.label} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-zinc-300">{s.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 capitalize">{s.status}</span>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-zinc-300">Total Endpoints</span>
              <span className="text-sm font-mono text-emerald-400">{health.total_endpoints}</span>
            </div>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl p-6 text-center text-zinc-500">
            Backend URL not configured
          </div>
        )}

        {/* Capabilities */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: "🤖", label: "AI Code Gen" },
            { icon: "📱", label: "APK Build" },
            { icon: "🖥️", label: "EXE Build" },
            { icon: "🖼️", label: "Image Gen" },
            { icon: "🔄", label: "Auto Fix" },
            { icon: "👁️", label: "Visual Audit" },
            { icon: "🗄️", label: "DB Schema" },
            { icon: "📦", label: "ZIP Bundle" },
          ].map((c) => (
            <div key={c.label} className="border border-zinc-800 rounded-lg p-3 text-center hover:border-zinc-600 transition-colors">
              <div className="text-lg">{c.icon}</div>
              <div className="text-xs text-zinc-400 mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Notice */}
        <div className="border border-amber-900/40 bg-amber-950/20 rounded-xl p-5">
          <p className="text-sm text-amber-200/80 leading-relaxed">{currentNotice}</p>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1">
          {lastChecked && (
            <p className="text-xs text-zinc-600">
              Last checked: {lastChecked.toLocaleTimeString()}
            </p>
          )}
          <p className="text-xs text-zinc-700">Powered by TIVO AI OS • {new Date().getFullYear()}</p>
        </div>
      </section>
    </main>
  );
};

export default PublicStatus;
