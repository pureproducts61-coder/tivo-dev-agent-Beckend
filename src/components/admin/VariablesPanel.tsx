import { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Trash2, Plus, X, Check, Copy, KeyRound, Search, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Variable {
  id: string;
  key: string;
  value: string;
  description: string | null;
  is_secret: boolean;
  updated_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function VariablesPanel({ open, onClose }: Props) {
  const [list, setList] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Variable | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("ai_variables")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) setError(error.message);
    else setList((data || []) as Variable[]);
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function save(v: Partial<Variable> & { key: string; value: string }) {
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setError("Not signed in");
      return false;
    }
    if (v.id) {
      const { error } = await supabase
        .from("ai_variables")
        .update({ key: v.key, value: v.value, description: v.description ?? null, is_secret: !!v.is_secret })
        .eq("id", v.id);
      if (error) {
        setError(error.message);
        return false;
      }
    } else {
      const { error } = await supabase
        .from("ai_variables")
        .insert({ user_id: uid, key: v.key, value: v.value, description: v.description ?? null, is_secret: !!v.is_secret });
      if (error) {
        setError(error.message);
        return false;
      }
    }
    await load();
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Delete this variable?")) return;
    const { error } = await supabase.from("ai_variables").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  const filtered = list.filter(
    (v) =>
      !search ||
      v.key.toLowerCase().includes(search.toLowerCase()) ||
      (v.description || "").toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-gradient-to-b from-zinc-950 to-zinc-900 border-t sm:border border-amber-900/30 sm:rounded-2xl shadow-2xl shadow-amber-950/40 animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-800/30 border border-amber-700/40 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-zinc-100">AI Variables</h2>
              <p className="text-[11px] text-zinc-500">Key/Value তথ্য যা AI প্রয়োজনে ব্যবহার করবে</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-3 flex items-center gap-2 border-b border-zinc-900">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search key or description..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-900/80 border border-zinc-800 rounded-lg outline-none focus:border-amber-700/60 transition"
            />
          </div>
          <button
            onClick={() => {
              setCreating(true);
              setEditing({ id: "", key: "", value: "", description: "", is_secret: true, updated_at: "" });
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white flex items-center gap-1.5 shadow-md shadow-amber-900/40 active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-2">{error}</div>
          )}
          {loading && <div className="text-center text-xs text-zinc-500 py-8">Loading...</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <KeyRound className="w-10 h-10 text-zinc-700 mx-auto" />
              <p className="text-sm text-zinc-500">এখনো কোনো variable নেই</p>
              <p className="text-[11px] text-zinc-600">Add বাটনে চাপ দিয়ে শুরু করুন</p>
            </div>
          )}
          {filtered.map((v) => {
            const show = revealed[v.id];
            return (
              <div
                key={v.id}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-amber-800/40 hover:bg-zinc-900 transition p-3 animate-fade-in"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs font-mono font-bold text-amber-300 bg-amber-950/30 px-1.5 py-0.5 rounded">
                        {v.key}
                      </code>
                      {v.is_secret && (
                        <span className="text-[10px] inline-flex items-center gap-1 text-amber-500/80">
                          <Lock className="w-2.5 h-2.5" /> secret
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 font-mono text-xs text-zinc-300 break-all">
                      {v.is_secret && !show ? "•".repeat(Math.min(v.value.length, 28)) || "••••••" : v.value || <span className="text-zinc-600">(empty)</span>}
                    </div>
                    {v.description && (
                      <p className="text-[11px] text-zinc-500 mt-1.5">{v.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 transition">
                    {v.is_secret && (
                      <button
                        onClick={() => setRevealed((r) => ({ ...r, [v.id]: !r[v.id] }))}
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition"
                        title={show ? "Hide" : "Show"}
                      >
                        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => navigator.clipboard?.writeText(v.value)}
                      className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition"
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditing(v)}
                      className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => remove(v.id)}
                      className="p-1.5 rounded-md hover:bg-red-950/40 text-zinc-400 hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Edit modal */}
        {editing && (
          <EditDialog
            initial={editing}
            isNew={creating}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSave={async (v) => {
              const ok = await save(v);
              if (ok) {
                setEditing(null);
                setCreating(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function EditDialog({
  initial,
  isNew,
  onCancel,
  onSave,
}: {
  initial: Variable;
  isNew: boolean;
  onCancel: () => void;
  onSave: (v: Partial<Variable> & { key: string; value: string }) => void | Promise<void>;
}) {
  const [key, setKey] = useState(initial.key);
  const [value, setValue] = useState(initial.value);
  const [desc, setDesc] = useState(initial.description || "");
  const [isSecret, setIsSecret] = useState(initial.is_secret);

  return (
    <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-zinc-950 border-t sm:border border-amber-900/40 sm:rounded-2xl p-4 space-y-3 animate-scale-in shadow-2xl"
      >
        <h3 className="font-bold flex items-center gap-2">
          {isNew ? <Plus className="w-4 h-4 text-amber-400" /> : <Pencil className="w-4 h-4 text-amber-400" />}
          {isNew ? "নতুন Variable" : "Edit Variable"}
        </h3>
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] text-zinc-500">Key</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.replace(/\s+/g, "_"))}
              placeholder="e.g. STRIPE_API_KEY"
              className="w-full mt-0.5 px-3 py-2 text-sm font-mono bg-zinc-900 border border-zinc-800 rounded-lg outline-none focus:border-amber-700"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-500">Value</span>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              placeholder="Variable value..."
              className="w-full mt-0.5 px-3 py-2 text-sm font-mono bg-zinc-900 border border-zinc-800 rounded-lg outline-none focus:border-amber-700 resize-none"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-zinc-500">Description (AI কে গাইড করার জন্য)</span>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="কখন/কিভাবে ব্যবহার হবে"
              className="w-full mt-0.5 px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg outline-none focus:border-amber-700"
            />
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              className="accent-amber-500"
            />
            <span className="text-zinc-300">Secret (mask the value)</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-3 py-2 text-xs rounded-lg hover:bg-zinc-800 text-zinc-400">
            Cancel
          </button>
          <button
            onClick={() => key.trim() && onSave({ id: initial.id || undefined, key: key.trim(), value, description: desc, is_secret: isSecret })}
            disabled={!key.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
