// TIVO — Dynamic Resource & Credential Vault (Roadmap Step 6)
// Credential != Runtime != Capability. Secrets are written to the backend vault
// and never read back; the UI shows only secret-free status.
import { useCallback, useEffect, useState } from "react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

type Health = { state: "unknown" | "checking" | "online" | "degraded" | "offline"; note?: string; at?: string };

function useApi() {
  const { session } = useSuperAdmin();
  const secret = session?.masterSecret || "";
  const call = useCallback(
    async (action: string, body?: unknown) => {
      const res = await fetch(`${BACKEND}/functions/v1/backend-api/${action}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", "x-master-secret": secret },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      return j;
    },
    [secret],
  );
  return { call, ready: !!secret };
}

const Badge = ({ h }: { h: Health }) => {
  const map: Record<Health["state"], string> = {
    unknown: "text-zinc-500 border-zinc-700",
    checking: "text-zinc-300 border-zinc-600",
    online: "text-green-400 border-green-800",
    degraded: "text-amber-400 border-amber-800",
    offline: "text-red-400 border-red-900",
  };
  const label = { unknown: "not checked", checking: "checking…", online: "connected", degraded: "degraded", offline: "unavailable" }[h.state];
  return (
    <span title={h.note} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${map[h.state]}`}>{label}</span>
  );
};

const inp = "w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs";
const btn = "px-2.5 py-1.5 rounded-lg bg-zinc-800 text-xs disabled:opacity-50 hover:bg-zinc-700";
const box = "rounded-xl border border-zinc-800 p-3 space-y-2";

// ---------------- Credentials ----------------
interface CredRow { key_name: string; label: string; help: string; source: "db" | "env" | "none"; is_active: boolean; updated_at: string | null }

export function CredentialVault() {
  const { call, ready } = useApi();
  const [rows, setRows] = useState<CredRow[]>([]);
  const [err, setErr] = useState("");
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");

  const load = useCallback(() => {
    if (!ready) return;
    call("credentials/list").then((j) => { setRows(j.credentials || []); setErr(""); }).catch((e) => setErr(e.message));
  }, [call, ready]);
  useEffect(load, [load]);

  async function save(key: string) {
    const value = edit[key];
    if (!value) return;
    try {
      await call("credentials/save", { key_name: key, value });
      setEdit((e) => ({ ...e, [key]: "" }));
      load();
      test(key);
    } catch (e: any) { setErr(e.message); }
  }
  async function remove(key: string) {
    if (!confirm(`${key} মুছে ফেলবে?`)) return;
    try { await call("credentials/delete", { key_name: key }); load(); } catch (e: any) { setErr(e.message); }
  }
  async function test(key: string) {
    setHealth((h) => ({ ...h, [key]: { state: "checking" } }));
    try {
      const j = await call("credentials/test", { provider: key });
      setHealth((h) => ({ ...h, [key]: { state: j.ok ? "online" : "offline", note: j.detail, at: new Date().toLocaleTimeString() } }));
    } catch (e: any) {
      setHealth((h) => ({ ...h, [key]: { state: "offline", note: e.message } }));
    }
  }

  if (!ready) return <p className="text-[11px] text-zinc-500">Super Admin লগইন দরকার।</p>;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500">চাবি সার্ভারের নিরাপদ ভল্টে যায় — আর কখনো স্ক্রিনে দেখানো হয় না।</p>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      {rows.map((r) => {
        const h = health[r.key_name] || { state: r.source === "none" ? "offline" : "unknown", note: r.source === "none" ? "not set" : undefined };
        return (
          <div key={r.key_name} className={box}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-200 truncate">{r.label}</span>
              <Badge h={h as Health} />
            </div>
            <div className="text-[10px] text-zinc-600">
              {r.key_name} · {r.source === "none" ? "যুক্ত নেই" : r.source === "env" ? "cloud-managed" : "vault"}
              {r.updated_at && ` · ${new Date(r.updated_at).toLocaleDateString()}`}
              {h.note && ` · ${h.note}`}
            </div>
            <div className="flex gap-2">
              <input type="password" className={inp} placeholder={r.source === "none" ? "নতুন চাবি" : "নতুন মান দিয়ে বদলাও"}
                value={edit[r.key_name] || ""} onChange={(e) => setEdit((x) => ({ ...x, [r.key_name]: e.target.value }))} />
              <button className={btn} disabled={!edit[r.key_name]} onClick={() => save(r.key_name)}>Save</button>
              <button className={btn} disabled={r.source === "none"} onClick={() => test(r.key_name)}>Test</button>
              {r.source === "db" && <button className={btn} onClick={() => remove(r.key_name)}>✕</button>}
            </div>
          </div>
        );
      })}
      <div className={box}>
        <div className="text-xs text-zinc-300">নতুন ধরনের চাবি যোগ করো</div>
        <div className="flex gap-2">
          <input className={inp} placeholder="KEY_NAME (যেমন VERCEL_TOKEN)" value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} />
          <input type="password" className={inp} placeholder="মান" value={edit[newKey] || ""}
            onChange={(e) => setEdit((x) => ({ ...x, [newKey]: e.target.value }))} />
          <button className={btn} disabled={newKey.length < 2 || !edit[newKey]} onClick={() => { save(newKey); setNewKey(""); }}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Runtimes: models servers, hosting, execution ----------------
type RClass = "model" | "hosting" | "execution";
interface RuntimeRow { id: string; name: string; endpoint: string; auth_type: string; has_credential: boolean; enabled: boolean; capabilities: string[]; runtime_class: string; local: boolean }

const CLASS_INFO: Record<RClass, { label: string; caps: string; hint: string }> = {
  model: { label: "মডেল সার্ভার", caps: "generate,understand", hint: "Ollama, LM Studio, OpenAI-compatible endpoint" },
  hosting: { label: "হোস্টিং", caps: "deploy", hint: "Vercel, Netlify, Cloudflare, নিজস্ব VPS" },
  execution: { label: "এক্সিকিউশন রানটাইম", caps: "command_execute,build,test", hint: "Docker worker, Replit, VPS (tivo/v1)" },
};

export function RuntimeVault() {
  const { call, ready } = useApi();
  const [rows, setRows] = useState<RuntimeRow[]>([]);
  const [err, setErr] = useState("");
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [f, setF] = useState({ name: "", endpoint: "", cls: "model" as RClass, auth_type: "none", credential_key: "", caps: CLASS_INFO.model.caps, local: false });

  const load = useCallback(() => {
    if (!ready) return;
    call("runtimes/list").then((j) => { setRows(j.runtimes || []); setErr(""); }).catch((e) => setErr(e.message));
  }, [call, ready]);
  useEffect(load, [load]);

  async function test(r: RuntimeRow) {
    setHealth((h) => ({ ...h, [r.id]: { state: "checking" } }));
    try {
      const j = await call("runtimes/test", { id: r.id });
      const state: Health["state"] = !j.online ? "offline" : r.runtime_class === "execution" ? "degraded" : "online";
      const note = !j.online ? j.reason : r.runtime_class === "execution"
        ? (j.execution_contract ? "tivo/v1 আছে, কিন্তু execution proxy এখনো চালু নয়" : "tivo/v1 contract নেই")
        : j.version ? `v${j.version}` : "reachable";
      setHealth((h) => ({ ...h, [r.id]: { state, note } }));
    } catch (e: any) { setHealth((h) => ({ ...h, [r.id]: { state: "offline", note: e.message } })); }
  }
  async function add() {
    try {
      await call("runtimes/save", {
        name: f.name, endpoint: f.endpoint, auth_type: f.auth_type,
        credential_key: f.auth_type === "none" ? null : f.credential_key,
        capabilities: f.caps.split(",").map((s) => s.trim()).filter(Boolean),
        metadata: { runtime_class: f.cls, local: f.local, priority: f.local ? 10 : 50 },
      });
      setF({ ...f, name: "", endpoint: "", credential_key: "" });
      load();
    } catch (e: any) { setErr(e.message); }
  }
  async function toggle(r: RuntimeRow) {
    try {
      await call("runtimes/save", { id: r.id, name: r.name, endpoint: r.endpoint, auth_type: r.auth_type, enabled: !r.enabled, capabilities: r.capabilities, metadata: { runtime_class: r.runtime_class, local: r.local } , credential_key: undefined });
      load();
    } catch (e: any) { setErr(e.message); }
  }
  async function remove(r: RuntimeRow) {
    if (!confirm(`${r.name} মুছে ফেলবে?`)) return;
    try { await call("runtimes/delete", { id: r.id }); load(); } catch (e: any) { setErr(e.message); }
  }

  if (!ready) return <p className="text-[11px] text-zinc-500">Super Admin লগইন দরকার।</p>;
  return (
    <div className="space-y-2">
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      {rows.length === 0 && <p className="text-[11px] text-zinc-500">এখনো কোনো সংযোগ যোগ করা হয়নি।</p>}
      {rows.map((r) => {
        const h = health[r.id] || { state: r.enabled ? "unknown" : "offline", note: r.enabled ? undefined : "disabled" };
        return (
          <div key={r.id} className={box}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-200 truncate">{r.name}</span>
              <Badge h={h as Health} />
            </div>
            <div className="text-[10px] text-zinc-600 break-all">
              {CLASS_INFO[r.runtime_class as RClass]?.label || r.runtime_class} · {r.endpoint}
              {r.local && " · local"} · {r.has_credential ? "চাবি যুক্ত" : "চাবি নেই"}
              {h.note && ` · ${h.note}`}
            </div>
            <div className="text-[10px] text-zinc-500">ক্ষমতা: {r.capabilities.join(", ") || "—"}{r.runtime_class === "hosting" && " · ডিপ্লয়ের আগে তোমার অনুমতি লাগবে"}</div>
            <div className="flex gap-2">
              <button className={btn} onClick={() => test(r)}>Test</button>
              <button className={btn} onClick={() => toggle(r)}>{r.enabled ? "Disable" : "Enable"}</button>
              <button className={btn} onClick={() => remove(r)}>✕</button>
            </div>
          </div>
        );
      })}
      <div className={box}>
        <div className="text-xs text-zinc-300">নতুন সংযোগ যোগ করো</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(CLASS_INFO) as RClass[]).map((c) => (
            <button key={c} onClick={() => setF({ ...f, cls: c, caps: CLASS_INFO[c].caps })}
              className={`py-1.5 rounded-lg text-[11px] border ${f.cls === c ? "bg-amber-700 border-amber-600 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}>
              {CLASS_INFO[c].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600">{CLASS_INFO[f.cls].hint}</p>
        <input className={inp} placeholder="নাম" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={inp} placeholder="https://..." value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value })} />
        <div className="flex gap-2">
          <select className={inp} value={f.auth_type} onChange={(e) => setF({ ...f, auth_type: e.target.value })}>
            <option value="none">চাবি লাগে না</option>
            <option value="token">Bearer token</option>
            <option value="api_key">API key</option>
          </select>
          {f.auth_type !== "none" && (
            <input className={inp} placeholder="ভল্টের KEY_NAME" value={f.credential_key}
              onChange={(e) => setF({ ...f, credential_key: e.target.value.toUpperCase() })} />
          )}
        </div>
        <input className={inp} placeholder="ক্ষমতা (কমা দিয়ে)" value={f.caps} onChange={(e) => setF({ ...f, caps: e.target.value })} />
        <label className="flex items-center gap-2 text-[11px] text-zinc-400">
          <input type="checkbox" checked={f.local} onChange={(e) => setF({ ...f, local: e.target.checked })} />
          আমার ডিভাইসে চলছে (local)
        </label>
        <button className={`${btn} w-full`} disabled={!f.name || !f.endpoint} onClick={add}>যোগ করো</button>
      </div>
    </div>
  );
}

// ---------------- Model registry ----------------
interface ModelRow { id: string; name: string; display_name?: string | null; provider: string; source_kind: string; status: string; is_active: boolean }

export function ModelVault() {
  const { call, ready } = useApi();
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", provider: "" });

  const load = useCallback(() => {
    if (!ready) return;
    call("models/list").then((j) => { setRows(j.models || []); setErr(""); }).catch((e) => setErr(e.message));
  }, [call, ready]);
  useEffect(load, [load]);

  const act = async (sub: string, body: unknown) => {
    try { await call(`models/${sub}`, body); load(); } catch (e: any) { setErr(e.message); }
  };

  if (!ready) return <p className="text-[11px] text-zinc-500">Super Admin লগইন দরকার।</p>;
  return (
    <div className="space-y-2">
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      {rows.length === 0 && <p className="text-[11px] text-zinc-500">কোনো মডেল যোগ করা হয়নি।</p>}
      {rows.map((m) => (
        <div key={m.id} className={box}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-200 truncate">{m.display_name || m.name}</span>
            <Badge h={{ state: m.is_active ? "online" : m.status === "failed" ? "offline" : "unknown", note: m.status }} />
          </div>
          <div className="text-[10px] text-zinc-600">{m.provider} · {m.source_kind === "remote_api" ? "remote" : "downloadable"} · {m.status}</div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => act(m.is_active ? "deactivate" : "activate", { id: m.id })}>
              {m.is_active ? "Deactivate" : "Activate"}
            </button>
            <button className={btn} onClick={() => confirm("মুছে ফেলবে?") && act("delete", { id: m.id })}>✕</button>
          </div>
        </div>
      ))}
      <div className={box}>
        <div className="text-xs text-zinc-300">নতুন মডেল যোগ করো</div>
        <input className={inp} placeholder="মডেলের নাম (যেমন deepseek-chat, llama3)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={inp} placeholder="প্রোভাইডার (যেমন DEEPSEEK_API_KEY, ollama)" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
        <button className={`${btn} w-full`} disabled={!f.name || !f.provider}
          onClick={() => { act("register", { name: f.name, provider: f.provider, source_kind: "remote_api", supported_runtimes: ["cloud_api"] }); setF({ name: "", provider: "" }); }}>
          যোগ করো
        </button>
      </div>
    </div>
  );
}
