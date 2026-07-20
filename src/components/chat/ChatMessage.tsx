import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy, Check, Pencil, ChevronDown, ChevronUp, Download, FileText,
  ThumbsUp, ThumbsDown, MoreVertical, Clock, Coins,
} from "lucide-react";

export interface Artifact {
  name: string;
  url?: string;
  mime?: string;
  size?: number;
  base64?: string;
  error?: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system" | "status";
  content: string;
  files?: { name: string; type: string; size: number }[];
  artifacts?: Artifact[];
  invalidArtifactJson?: string;
  ts: number;
  durationMs?: number;
  creditsUsed?: number;
  feedback?: "up" | "down" | null;
}

const COLLAPSE_LIMIT = 380;

export function validateArtifact(a: any): Artifact | null {
  if (!a || typeof a !== "object") return null;
  const name = typeof a.name === "string" && a.name.trim() ? a.name.trim() : null;
  if (!name) return null;
  const url = typeof a.url === "string" ? a.url : undefined;
  const base64 = typeof a.base64 === "string" ? a.base64 : undefined;
  if (!url && !base64) return { name, mime: a.mime, size: a.size, error: "No url or base64 data" };
  if (url && !/^(https?:|data:|blob:)/i.test(url)) return { name, mime: a.mime, size: a.size, error: "Unsafe URL scheme" };
  return {
    name, url, base64,
    mime: typeof a.mime === "string" ? a.mime : undefined,
    size: typeof a.size === "number" ? a.size : undefined,
  };
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 transition px-2 py-1 rounded-md hover:bg-zinc-800/60"
      title="Copy"
    >
      {done ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function ArtifactCard({ a }: { a: Artifact }) {
  const href = a.url || (a.base64 ? `data:${a.mime || "application/octet-stream"};base64,${a.base64}` : undefined);
  if (a.error || !href) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-900/50 bg-red-950/20 px-3 py-2.5">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-red-900/30 border border-red-800/40 flex items-center justify-center">
          <FileText className="w-4 h-4 text-red-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{a.name}</div>
          <div className="text-[11px] text-red-300/80 truncate">{a.error || "No download source"}</div>
        </div>
      </div>
    );
  }
  return (
    <a
      href={href}
      download={a.name}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 hover:border-amber-700/60 hover:bg-zinc-900 transition"
    >
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-800/40 flex items-center justify-center">
        <FileText className="w-4 h-4 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{a.name}</div>
        <div className="text-[11px] text-zinc-500 truncate">
          {a.mime || "file"}{a.size ? ` · ${(a.size / 1024).toFixed(1)} KB` : ""}
        </div>
      </div>
      <Download className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition" />
    </a>
  );
}

export function ChatMessage({
  msg,
  streaming,
  onEdit,
  onFeedback,
}: {
  msg: ChatMsg;
  streaming?: boolean;
  onEdit?: (id: string, text: string) => void;
  onFeedback?: (id: string, value: "up" | "down") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [metaOpen, setMetaOpen] = useState(false);

  const isLong = msg.content.length > COLLAPSE_LIMIT;
  const visible = useMemo(
    () => (isLong && !expanded ? msg.content.slice(0, COLLAPSE_LIMIT) + "…" : msg.content),
    [msg.content, expanded, isLong]
  );

  // USER — Lovable-style: plain text on canvas, subtle left rail, no bright bubble
  if (msg.role === "user") {
    return (
      <div className="group animate-fade-in">
        <div className="pl-3 border-l-2 border-amber-600/60">
          <div className="text-[10px] text-zinc-500 mb-1">You</div>
          {editing ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(10, Math.max(2, draft.split("\n").length))}
              className="w-full bg-zinc-900/60 rounded-lg p-2 outline-none resize-none text-zinc-100 text-sm border border-zinc-800 focus:border-amber-700"
            />
          ) : (
            <div className="text-sm text-zinc-100 whitespace-pre-wrap break-words leading-relaxed">
              {visible}
            </div>
          )}
          {msg.files && msg.files.length > 0 && (
            <div className="mt-2 space-y-1">
              {msg.files.map((f) => (
                <div key={f.name} className="text-[10px] text-zinc-500 bg-zinc-900/50 rounded px-2 py-1 truncate inline-block mr-1">
                  📎 {f.name} ({(f.size / 1024).toFixed(1)} KB)
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-0.5 mt-1.5 opacity-60 group-hover:opacity-100 transition">
            {isLong && !editing && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 px-1.5 py-0.5 rounded-md hover:bg-zinc-800/60"
                title={expanded ? "Show less" : "Show more"}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setDraft(msg.content); }}
                  className="text-[11px] text-zinc-400 hover:text-red-400 px-1.5 py-0.5 rounded-md hover:bg-zinc-800/60"
                >Cancel</button>
                <button
                  onClick={() => { onEdit?.(msg.id, draft); setEditing(false); }}
                  className="text-[11px] text-amber-400 hover:text-amber-300 px-1.5 py-0.5 rounded-md hover:bg-zinc-800/60"
                >Save & resend</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 px-1.5 py-0.5 rounded-md hover:bg-zinc-800/60"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <CopyBtn text={msg.content} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // SYSTEM
  if (msg.role === "system" || msg.role === "status") {
    return (
      <div className="flex justify-center animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400 max-w-[90%]">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="truncate">{msg.content}</span>
        </div>
      </div>
    );
  }

  // ASSISTANT — plain text on canvas (Lovable-style), no bubble
  return (
    <div className="group animate-fade-in">
      <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span>TIVO Agent</span>
      </div>
      <div className="text-sm leading-relaxed text-zinc-100">
        {msg.content ? (
          <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-lg prose-code:text-amber-300 prose-headings:text-zinc-100 prose-a:text-amber-400 prose-p:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        ) : streaming ? (
          <span className="inline-flex gap-1 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0.15s" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0.3s" }} />
          </span>
        ) : null}
        {msg.artifacts && msg.artifacts.length > 0 && (
          <div className="mt-3 grid gap-2">
            {msg.artifacts.map((a, i) => <ArtifactCard key={i} a={a} />)}
          </div>
        )}
        {msg.invalidArtifactJson && (
          <details className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px]">
            <summary className="cursor-pointer text-amber-300">⚠️ Artifact JSON parse error — view raw</summary>
            <pre className="mt-2 max-h-40 overflow-auto text-amber-200/80 whitespace-pre-wrap break-all">
              {msg.invalidArtifactJson}
            </pre>
          </details>
        )}
      </div>

      {msg.content && !streaming && (
        <div className="flex items-center gap-0.5 mt-2 opacity-70 group-hover:opacity-100 transition">
          <button
            onClick={() => onFeedback?.(msg.id, "up")}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md hover:bg-zinc-800/60 ${
              msg.feedback === "up" ? "text-emerald-400" : "text-zinc-400 hover:text-emerald-400"
            }`}
            title="Good response"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onFeedback?.(msg.id, "down")}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md hover:bg-zinc-800/60 ${
              msg.feedback === "down" ? "text-red-400" : "text-zinc-400 hover:text-red-400"
            }`}
            title="Bad response"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
          <CopyBtn text={msg.content} />
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setMetaOpen((v) => !v); }}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 px-2 py-1 rounded-md hover:bg-zinc-800/60"
              title="Details"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {metaOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full mt-1 w-56 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-lg shadow-2xl shadow-black/50 p-2 z-40 text-[11px] space-y-1.5"
              >
                <div className="flex items-center gap-2 text-zinc-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Time:</span>
                  <span className="ml-auto font-mono text-zinc-100">
                    {msg.durationMs != null ? `${(msg.durationMs / 1000).toFixed(2)}s` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-300">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>Credits:</span>
                  <span className="ml-auto font-mono text-zinc-100">
                    {msg.creditsUsed != null ? msg.creditsUsed.toFixed(3) : "—"}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
                  {new Date(msg.ts).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
