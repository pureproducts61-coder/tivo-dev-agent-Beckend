import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";
import { ChatMessage, ChatMsg, Artifact } from "@/components/chat/ChatMessage";
import { ChatInput, ActionIcons } from "@/components/chat/ChatInput";
import { SecurityScanPanel } from "@/components/chat/SecurityScanPanel";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

const SYSTEM_PROMPT = `You are TIVO DEV AGENT — autonomous full-stack DevOps AI for the Super Admin.
You operate the entire platform: vector memory, GitHub dual-sync, worker queue, multi-server deploy, multi-tenant isolation.

When you produce a project, file, APK, EXE, ZIP, or any artifact for the user, return a JSON block at the end like:
\`\`\`tivo-artifacts
[{ "name": "app.apk", "url": "https://...", "mime": "application/vnd.android.package-archive", "size": 12345 }]
\`\`\`
The UI will render those as one-click download cards.

Reply in the user's language. Use markdown. Be concise but thorough.`;

function extractArtifacts(content: string): { clean: string; artifacts: Artifact[] } {
  const re = /```tivo-artifacts\s*([\s\S]*?)```/g;
  const out: Artifact[] = [];
  const clean = content.replace(re, (_m, json) => {
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) out.push(...arr);
    } catch {}
    return "";
  }).trim();
  return { clean, artifacts: out };
}

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

export default function ChatScreen() {
  const { session } = useSuperAdmin();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, statusText]);

  async function readFileAsBase64(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(",")[1] || "");
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  async function send(overrideText?: string) {
    if (!session) return;
    const text = overrideText ?? input;
    if (!text.trim() && files.length === 0) return;

    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      content: text,
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      ts: Date.now(),
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    const filesToSend = files;
    setFiles([]);
    setStreaming(true);
    setStatusText("চিন্তা করছি...");

    let fileContext = "";
    for (const f of filesToSend) {
      try {
        setStatusText(`📁 প্রসেস করছি: ${f.name}`);
        const isText =
          /^(text\/|application\/(json|xml|javascript|typescript))/.test(f.type) ||
          /\.(txt|md|json|js|ts|tsx|jsx|py|html|css|csv|log|yml|yaml)$/i.test(f.name);
        const content = isText ? await f.text() : await readFileAsBase64(f);
        const r = await fetch(`${BACKEND}/functions/v1/ai-engine/process-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-master-secret": session.masterSecret },
          body: JSON.stringify({
            file_content: content,
            file_type: f.type,
            file_name: f.name,
            instruction: "Summarize for context",
          }),
        });
        const data = await r.json();
        if (data.analysis) fileContext += `\n\n[FILE: ${f.name}]\n${data.analysis}`;
      } catch {
        fileContext += `\n\n[FILE: ${f.name}] — failed to process`;
      }
    }

    setStatusText("🧠 Generating response...");

    const chatHistory = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    if (fileContext && chatHistory.length > 0) {
      chatHistory[chatHistory.length - 1].content += fileContext;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let assistantText = "";
    const assistantId = uid();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "", ts: Date.now() }]);

    try {
      const res = await fetch(`${BACKEND}/functions/v1/ai-engine/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-master-secret": session.masterSecret },
        body: JSON.stringify({
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...chatHistory],
          stream: true,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`AI error ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") break;
          try {
            const p = JSON.parse(j);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              const { clean, artifacts } = extractArtifacts(assistantText);
              setMessages((m) => {
                const out = [...m];
                const idx = out.findIndex((x) => x.id === assistantId);
                if (idx >= 0) out[idx] = { ...out[idx], content: clean, artifacts };
                return out;
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((m) => {
          const out = [...m];
          const idx = out.findIndex((x) => x.id === assistantId);
          if (idx >= 0) out[idx] = { ...out[idx], content: `❌ Error: ${e.message}` };
          return out;
        });
      }
    } finally {
      setStreaming(false);
      setStatusText(null);
      abortRef.current = null;
    }
  }

  function handleEdit(id: string, newText: string) {
    // Truncate history to that message and resend
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const before = messages.slice(0, idx);
    setMessages(before);
    setTimeout(() => send(newText), 0);
  }

  const actions = [
    { id: "publish", label: "Publish", icon: ActionIcons.Globe, desc: "Push current build live", onClick: () => alert("Publish triggered (wire to backend)"), tone: "primary" as const },
    { id: "update", label: "Update", icon: ActionIcons.RefreshCw, desc: "Pull latest changes & redeploy", onClick: () => alert("Update queued") },
    { id: "history", label: "History", icon: ActionIcons.History, desc: "Past conversations & snapshots", onClick: () => alert("History panel coming up") },
    { id: "share", label: "Share", icon: ActionIcons.Share2, desc: "Create a shareable link", onClick: () => navigator.clipboard?.writeText(window.location.href) },
    { id: "files", label: "Files", icon: ActionIcons.Folder, desc: "Browse project files", onClick: () => alert("File browser") },
    { id: "download", label: "Download", icon: ActionIcons.Download, desc: "Export project ZIP", onClick: () => alert("Download bundle") },
    { id: "preview", label: "Preview", icon: ActionIcons.Eye, desc: "Open live preview", onClick: () => window.open("/", "_blank") },
    { id: "security", label: "Security Scan", icon: ActionIcons.ShieldCheck, desc: "Scan & fix vulnerabilities", onClick: () => setScanOpen(true) },
  ];

  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] sm:h-[calc(100dvh-3.5rem)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-3xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center py-16 space-y-4 animate-fade-in">
            <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-800 items-center justify-center shadow-xl shadow-amber-900/40">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Welcome, Super Admin</h1>
              <p className="text-sm text-zinc-500 mt-1">যেকোনো কাজ — কোড, ডিপ্লয়, APK, customer message — সবই আমি করবো।</p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-md mx-auto pt-4">
              {[
                "একটি নতুন landing page বানাও",
                "সব tenant এর health দেখাও",
                "নতুন mobile app project শুরু করো",
                "Security audit চালাও",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left text-xs p-3 rounded-xl border border-zinc-800 hover:border-amber-700/60 hover:bg-zinc-900 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            msg={m}
            streaming={streaming && m.id === messages[messages.length - 1]?.id}
            onEdit={handleEdit}
          />
        ))}

        {statusText && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/30 border border-amber-800/30 text-amber-200 text-xs animate-fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
              {statusText}
            </div>
          </div>
        )}
      </div>

      <div className="max-w-3xl w-full mx-auto">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => send()}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          files={files}
          onFilesChange={setFiles}
          actions={actions}
        />
      </div>

      <SecurityScanPanel open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  );
}
