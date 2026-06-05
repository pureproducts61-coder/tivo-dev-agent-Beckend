import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Pencil, ChevronDown, ChevronUp, User, Sparkles, Download, FileText } from "lucide-react";

export interface Artifact {
  name: string;
  url?: string;
  mime?: string;
  size?: number;
  base64?: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system" | "status";
  content: string;
  files?: { name: string; type: string; size: number }[];
  artifacts?: Artifact[];
  ts: number;
}

const COLLAPSE_LIMIT = 380;

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
  return (
    <a
      href={href}
      download={a.name}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 hover:border-amber-700/60 hover:bg-zinc-900 transition"
    >
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-amber-600/30 to-amber-900/20 border border-amber-800/40 flex items-center justify-center">
        <FileText className="w-4 h-4 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{a.name}</div>
        <div className="text-[11px] text-zinc-500 truncate">
          {a.mime || "file"}
          {a.size ? ` · ${(a.size / 1024).toFixed(1)} KB` : ""}
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
}: {
  msg: ChatMsg;
  streaming?: boolean;
  onEdit?: (id: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);

  const isLong = msg.content.length > COLLAPSE_LIMIT;
  const visible = useMemo(
    () => (msg.role === "user" && isLong && !expanded ? msg.content.slice(0, COLLAPSE_LIMIT) + "…" : msg.content),
    [msg.content, expanded, isLong, msg.role]
  );

  if (msg.role === "user") {
    return (
      <div className="group flex justify-end animate-fade-in">
        <div className="max-w-[88%] sm:max-w-[78%] space-y-1.5">
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-zinc-500">
            <span>You</span>
            <User className="w-3 h-3" />
          </div>
          <div className="rounded-2xl rounded-tr-md bg-gradient-to-br from-amber-700 to-amber-800 text-white px-4 py-2.5 text-sm whitespace-pre-wrap break-words shadow-md shadow-amber-950/30">
            {editing ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(10, Math.max(2, draft.split("\n").length))}
                className="w-full bg-transparent outline-none resize-none text-white placeholder:text-amber-200/60"
              />
            ) : (
              visible
            )}
            {msg.files && msg.files.length > 0 && (
              <div className="mt-2 space-y-1">
                {msg.files.map((f) => (
                  <div key={f.name} className="text-[10px] opacity-80 bg-black/25 rounded px-2 py-1 truncate">
                    📎 {f.name} ({(f.size / 1024).toFixed(1)} KB)
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
            {isLong && !editing && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 px-2 py-1 rounded-md hover:bg-zinc-800/60"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(msg.content);
                  }}
                  className="text-[11px] text-zinc-400 hover:text-red-400 px-2 py-1 rounded-md hover:bg-zinc-800/60"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onEdit?.(msg.id, draft);
                    setEditing(false);
                  }}
                  className="text-[11px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded-md hover:bg-zinc-800/60"
                >
                  Save & resend
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 px-2 py-1 rounded-md hover:bg-zinc-800/60"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <CopyBtn text={msg.content} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // assistant / system
  return (
    <div className="group flex justify-start animate-fade-in">
      <div className="max-w-[92%] sm:max-w-[85%] space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>TIVO Agent</span>
        </div>
        <div className="rounded-2xl rounded-tl-md bg-zinc-900/80 border border-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-100 shadow-sm">
          {msg.content ? (
            <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-lg prose-code:text-amber-300 prose-headings:text-zinc-100 prose-a:text-amber-400">
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
              {msg.artifacts.map((a, i) => (
                <ArtifactCard key={i} a={a} />
              ))}
            </div>
          )}
        </div>
        {msg.content && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <CopyBtn text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}
