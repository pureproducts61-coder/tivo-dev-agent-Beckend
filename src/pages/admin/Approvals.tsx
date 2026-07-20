import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Trash2, RefreshCw, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { logAudit } from "@/lib/audit";

type Proposal = {
  id: string;
  title: string | null;
  description: string | null;
  status: string;
  risk_level: string | null;
  proposed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  payload: any;
  reason: string | null;
};

const STATUS_TONE: Record<string, string> = {
  pending:  "bg-amber-950/40 text-amber-300 border-amber-800/60",
  approved: "bg-emerald-950/40 text-emerald-300 border-emerald-800/60",
  denied:   "bg-red-950/40 text-red-300 border-red-800/60",
  applied:  "bg-sky-950/40 text-sky-300 border-sky-800/60",
  cancelled:"bg-zinc-900 text-zinc-400 border-zinc-800",
};

export default function Approvals() {
  const { session } = useSuperAdmin();
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "history" | "all">("pending");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    let q = supabase
      .from("proposed_changes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (tab === "pending") q = q.eq("status", "pending");
    if (tab === "history") q = q.in("status", ["approved", "denied", "applied", "cancelled"]);
    const { data, error } = await q;
    if (error) setErr(error.message);
    else setItems((data || []) as Proposal[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  async function updateStatus(id: string, next: "approved" | "denied") {
    if (!session) return;
    setBusy(id);
    try {
      const { error } = await supabase
        .from("proposed_changes")
        .update({
          status: next,
          reviewed_at: new Date().toISOString(),
          reviewed_by: session.email,
        } as any)
        .eq("id", id);
      if (error) throw new Error(error.message);
      logAudit(`proposal.${next}`, id, {});
      await load();
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("এই proposal ডিলিট করবে? undo করা যাবে না।")) return;
    setBusy(id);
    try {
      const { error } = await supabase.from("proposed_changes").delete().eq("id", id);
      if (error) throw new Error(error.message);
      logAudit("proposal.delete", id, {});
      await load();
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Proposals</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Super Admin approval queue</p>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-amber-400"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="inline-flex bg-zinc-900/60 border border-zinc-800 rounded-full p-1 mb-4 text-xs">
          {(["pending", "history", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full transition ${
                tab === t ? "bg-amber-600/90 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t === "pending" ? "Pending" : t === "history" ? "History" : "All"}
            </button>
          ))}
        </div>

        {err && (
          <div className="rounded-lg border border-red-900 bg-red-950/30 text-red-300 text-xs px-3 py-2 mb-3">
            {err}
          </div>
        )}

        {loading && items.length === 0 && (
          <div className="text-center text-xs text-zinc-500 py-12">Loading…</div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-center text-xs text-zinc-500 py-12">
            কোনো proposal নাই।
          </div>
        )}

        <div className="space-y-2">
          {items.map((p) => {
            const isOpen = !!open[p.id];
            const tone = STATUS_TONE[p.status] || STATUS_TONE.cancelled;
            return (
              <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [p.id]: !isOpen }))}
                  className="w-full text-left px-3 sm:px-4 py-3 flex items-start gap-3 hover:bg-zinc-900/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${tone}`}>
                        {p.status}
                      </span>
                      {p.risk_level && (
                        <span className="text-[10px] text-zinc-500">risk: {p.risk_level}</span>
                      )}
                      <span className="text-[10px] text-zinc-600 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(p.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm font-medium mt-1 truncate">
                      {p.title || "(no title)"}
                    </div>
                    {p.description && (
                      <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{p.description}</div>
                    )}
                  </div>
                  <div className="text-zinc-500">
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-3 sm:px-4 pb-3 pt-1 space-y-3 border-t border-zinc-800/60 animate-fade-in">
                    {p.reason && (
                      <div className="text-xs">
                        <div className="text-zinc-500 mb-1">Reason / notes</div>
                        <div className="text-zinc-300 whitespace-pre-wrap">{p.reason}</div>
                      </div>
                    )}
                    {p.payload && (
                      <div className="text-xs">
                        <div className="text-zinc-500 mb-1">Payload</div>
                        <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
                          {JSON.stringify(p.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
                      {p.status === "pending" && (
                        <>
                          <button
                            disabled={busy === p.id}
                            onClick={() => updateStatus(p.id, "approved")}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            disabled={busy === p.id}
                            onClick={() => updateStatus(p.id, "denied")}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-800 hover:bg-red-700 text-white disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Deny
                          </button>
                        </>
                      )}
                      <button
                        disabled={busy === p.id}
                        onClick={() => remove(p.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-red-200 disabled:opacity-50 sm:ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                    {p.reviewed_at && (
                      <div className="text-[10px] text-zinc-500 pt-1">
                        Reviewed {new Date(p.reviewed_at).toLocaleString()}
                        {p.reviewed_by ? ` · by ${p.reviewed_by}` : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
