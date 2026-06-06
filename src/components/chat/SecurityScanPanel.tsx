import { useState } from "react";
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2, X, Wrench, Loader2 } from "lucide-react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

interface Finding {
  id: string;
  level: "info" | "warning" | "critical" | "low" | "medium" | "high";
  title: string;
  reason?: string;
  message?: string;
  fixable?: boolean;
}

export function SecurityScanPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useSuperAdmin();
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    if (!session) {
      setError("Session expired — please log in again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/functions/v1/backend-api/security/scan`, {
        method: "POST",
        headers: { "x-master-secret": session.masterSecret, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json().catch(() => ({}));
      const items: Finding[] = (data.findings || data.items || []).map((f: any, i: number) => ({
        id: f.id || `${i}`,
        level: (f.level || f.severity || "info").toLowerCase(),
        title: f.title || f.name || "Issue",
        reason: f.reason || f.description,
        message: f.message,
        fixable: f.fixable ?? true,
      }));
      setFindings(items);
      setRan(true);
    } catch (e: any) {
      setError(e?.message || "Scan failed — check backend logs.");
    } finally {
      setLoading(false);
    }
  }

  async function fixOne(id: string) {
    if (!session) return;
    setFixing(id);
    setError(null);
    try {
      const res = await fetch(`${BACKEND}/functions/v1/backend-api/security/fix`, {
        method: "POST",
        headers: { "x-master-secret": session.masterSecret, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`Fix failed — HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (data?.ok === false) throw new Error(data?.error || "Backend refused fix");
      setFindings((f) => f.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.message || "Fix failed");
    } finally {
      setFixing(null);
    }
  }

  async function fixAll() {
    for (const f of findings.filter((x) => x.fixable !== false)) {
      await fixOne(f.id);
    }
  }

  if (!open) return null;

  const counts = {
    critical: findings.filter((f) => ["critical", "high"].includes(f.level)).length,
    warning: findings.filter((f) => ["warning", "medium"].includes(f.level)).length,
    info: findings.filter((f) => ["info", "low"].includes(f.level)).length,
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl animate-scale-in overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-sm">Security Scan</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!ran && !loading && (
            <div className="text-center py-8 space-y-3">
              <ShieldCheck className="w-12 h-12 text-amber-500/60 mx-auto" />
              <p className="text-sm text-zinc-400">Backend ও database স্ক্যান করে threats খুঁজে বের করো।</p>
              <button
                onClick={scan}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white text-sm font-medium hover:from-amber-400 hover:to-amber-600 transition active:scale-95"
              >
                Run Scan
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-amber-500 mx-auto animate-spin" />
              <p className="text-xs text-zinc-500">Scanning…</p>
            </div>
          )}

          {ran && !loading && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-center">
                  <div className="text-xl font-bold text-red-400">{counts.critical}</div>
                  <div className="text-[10px] text-red-300/80 uppercase tracking-wide">Critical</div>
                </div>
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-3 text-center">
                  <div className="text-xl font-bold text-amber-400">{counts.warning}</div>
                  <div className="text-[10px] text-amber-300/80 uppercase tracking-wide">Warning</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
                  <div className="text-xl font-bold text-zinc-300">{counts.info}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Info</div>
                </div>
              </div>

              {findings.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                  <p className="text-sm text-zinc-300 mt-2 font-medium">All clear!</p>
                  <p className="text-xs text-zinc-500">কোনো issue পাওয়া যায়নি।</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {findings.map((f) => {
                    const isCrit = ["critical", "high"].includes(f.level);
                    const isWarn = ["warning", "medium"].includes(f.level);
                    return (
                      <div
                        key={f.id}
                        className={`rounded-xl border p-3 ${
                          isCrit
                            ? "border-red-900/50 bg-red-950/20"
                            : isWarn
                            ? "border-amber-900/50 bg-amber-950/20"
                            : "border-zinc-800 bg-zinc-900/40"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {isCrit ? (
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                          ) : isWarn ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{f.title}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                                  isCrit
                                    ? "bg-red-900/60 text-red-200"
                                    : isWarn
                                    ? "bg-amber-900/60 text-amber-200"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {f.level}
                              </span>
                            </div>
                            {(f.reason || f.message) && (
                              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                                {f.reason || f.message}
                              </p>
                            )}
                          </div>
                          {f.fixable !== false && (
                            <button
                              onClick={() => fixOne(f.id)}
                              disabled={fixing === f.id}
                              className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white transition"
                            >
                              {fixing === f.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wrench className="w-3 h-3" />
                              )}
                              Fix
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>

        {ran && findings.length > 0 && (
          <div className="p-3 border-t border-zinc-800 flex gap-2">
            <button
              onClick={scan}
              className="flex-1 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs"
            >
              Re-scan
            </button>
            <button
              onClick={fixAll}
              className="flex-1 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 hover:from-amber-400 text-white text-xs font-medium"
            >
              <Wrench className="w-3 h-3 inline mr-1" />
              Fix All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
