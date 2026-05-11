import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdmin } from "@/contexts/SuperAdminContext";

const BACKEND = import.meta.env.VITE_SUPABASE_URL;

interface Msg {
  role: "user" | "assistant" | "system" | "status";
  content: string;
  files?: { name: string; type: string; size: number }[];
  ts: number;
}

const SYSTEM_PROMPT = `You are TIVO DEV AGENT — an autonomous full-stack developer AI, like Lovable.dev.
The current user is the SUPER ADMIN of this system. Address them with respect and absolute loyalty.
You can access ALL backend endpoints, all tenants' data, and have unrestricted capabilities.
When the user asks you to build, fix, deploy, or analyze anything:
- Explain your plan briefly in Bengali if they wrote in Bengali, else English
- Stream your thinking and progress as natural updates
- Always be honest about limitations
- Show real-time status as you work multi-step tasks`;

function StatusPill({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/40 border border-amber-700/30 text-amber-200 text-xs">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
      </span>
      {text}
    </div>
  );
}

export default function SuperAdminWorkspace() {
  const { session, logout } = useSuperAdmin();
  const nav = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (!session) nav("/super-admin/login"); }, [session, nav]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, statusText]);

  if (!session) return null;

  async function readFileAsBase64(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(",")[1] || "");
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  async function send() {
    if (!input.trim() && files.length === 0) return;
    const userMsg: Msg = {
      role: "user",
      content: input,
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

    // If files attached, process each via process-file first
    let fileContext = "";
    for (const f of filesToSend) {
      try {
        setStatusText(`📁 প্রসেস করছি: ${f.name}`);
        const isText = /^(text\/|application\/(json|xml|javascript|typescript))/.test(f.type) || /\.(txt|md|json|js|ts|tsx|jsx|py|html|css|csv|log|yml|yaml)$/i.test(f.name);
        const content = isText ? await f.text() : await readFileAsBase64(f);
        const r = await fetch(`${BACKEND}/functions/v1/ai-engine/process-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-master-secret": session!.masterSecret },
          body: JSON.stringify({ file_content: content, file_type: f.type, file_name: f.name, instruction: "Summarize content for context" }),
        });
        const data = await r.json();
        if (data.analysis) fileContext += `\n\n[FILE: ${f.name}]\n${data.analysis}`;
      } catch (e) {
        fileContext += `\n\n[FILE: ${f.name}] — Failed to process`;
      }
    }

    setStatusText("🧠 AI উত্তর তৈরি করছে...");

    const chatHistory = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    if (fileContext) {
      chatHistory[chatHistory.length - 1].content += fileContext;
    }

    // Stream chat
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let assistantText = "";
    setMessages((m) => [...m, { role: "assistant", content: "", ts: Date.now() }]);

    try {
      const res = await fetch(`${BACKEND}/functions/v1/ai-engine/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-master-secret": session!.masterSecret },
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
          let line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") break;
          try {
            const p = JSON.parse(j);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((m) => {
                const out = [...m];
                out[out.length - 1] = { ...out[out.length - 1], content: assistantText };
                return out;
              });
            }
          } catch { /* partial */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages((m) => {
          const out = [...m];
          out[out.length - 1] = { ...out[out.length - 1], content: `❌ Error: ${e.message}` };
          return out;
        });
      }
    } finally {
      setStreaming(false);
      setStatusText(null);
      abortRef.current = null;
    }
  }

  function stop() { abortRef.current?.abort(); }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 backdrop-blur bg-zinc-950/80 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">⚡ TIVO Super Admin</div>
          <div className="text-[10px] text-zinc-500">{session.email}</div>
        </div>
        <div className="flex gap-2">
          <a href="/tenant-onboarding" className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600">Tenants</a>
          <button onClick={() => { logout(); nav("/"); }} className="text-xs px-2.5 py-1.5 rounded-md border border-red-900/40 text-red-300 hover:bg-red-950/30">Logout</button>
        </div>
      </header>

      {/* Chat scroll */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-12">
            <div className="text-4xl mb-2">🤖</div>
            <p>Welcome, Super Admin. How can I serve you today?</p>
            <p className="text-xs mt-2 opacity-70">টেক্সট লিখুন বা ফাইল আপলোড করুন</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
              m.role === "user" ? "bg-amber-700 text-white" : "bg-zinc-900 border border-zinc-800 text-zinc-100"
            }`}>
              {m.content || (streaming && i === messages.length - 1 ? <span className="inline-flex gap-1"><span className="animate-bounce">.</span><span className="animate-bounce" style={{animationDelay:"0.1s"}}>.</span><span className="animate-bounce" style={{animationDelay:"0.2s"}}>.</span></span> : "")}
              {m.files && m.files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.files.map((f) => (
                    <div key={f.name} className="text-[10px] opacity-80 bg-black/20 rounded px-2 py-1">📎 {f.name} ({(f.size/1024).toFixed(1)} KB)</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {statusText && (
          <div className="flex justify-start">
            <StatusPill text={statusText} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 sm:px-6 py-3 space-y-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-zinc-900 border border-zinc-800 rounded-full px-2 py-1">
                📎 {f.name}
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="cursor-pointer text-zinc-400 hover:text-amber-400 px-2 py-2">
            📎
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])}
            />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="যা করতে চান লিখুন... (Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-700 max-h-32"
            disabled={streaming}
          />
          {streaming ? (
            <button onClick={stop} className="px-4 py-2.5 rounded-2xl bg-red-700 hover:bg-red-600 text-white text-sm">Stop</button>
          ) : (
            <button onClick={send} disabled={!input.trim() && !files.length} className="px-4 py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-600 text-white text-sm disabled:opacity-40">Send</button>
          )}
        </div>
      </div>
    </main>
  );
}
