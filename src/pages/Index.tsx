import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Terminal, Loader2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import ChatMessage from "@/components/ChatMessage";
import ChatSidebar from "@/components/ChatSidebar";
import { streamChat, type Message } from "@/lib/hf-inference";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data as Message[]);
      setConversationId(id);
    }
  }, []);

  const createConversation = async (firstMessage: string) => {
    if (!user) return null;
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    const { data } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    return data?.id || null;
  };

  const saveMessage = async (convId: string, role: string, content: string) => {
    if (!user) return;
    await supabase.from("messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role,
      content,
    });
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let convId = conversationId;
    if (!convId) {
      convId = await createConversation(text);
      setConversationId(convId);
    }

    if (convId) await saveMessage(convId, "user", text);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    await streamChat({
      messages: newMessages,
      onDelta: upsert,
      onDone: async () => {
        setIsLoading(false);
        if (convId && assistantSoFar) {
          await saveMessage(convId, "assistant", assistantSoFar);
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId);
        }
      },
      onError: (err) => {
        setIsLoading(false);
        toast({ title: "Error", description: err, variant: "destructive" });
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-auto transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:hidden"
        }`}
      >
        <ChatSidebar
          currentConversationId={conversationId}
          onSelectConversation={loadConversation}
          onNewConversation={handleNewConversation}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/60 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/15">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground">Raz Dev</h1>
            <p className="text-[10px] text-muted-foreground">AI Coding Assistant</p>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 px-4">
              <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10">
                <Terminal className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Raz Dev এ স্বাগতম</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                আমাকে আপনার প্রজেক্ট নিয়ে বলুন। কোড লেখা, বাগ ফিক্স, বা ডিপ্লয়মেন্ট — সব কাজে আমি সাহায্য করতে পারি।
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 w-full max-w-md">
                {[
                  "একটি React প্রজেক্ট সেটআপ করে দাও",
                  "Python দিয়ে API বানাতে সাহায্য করো",
                  "আমার কোডে বাগ আছে, ফিক্স করো",
                  "Git/GitHub শিখতে চাই",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role as "user" | "assistant"}
                  content={msg.content}
                  isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"}
                />
              ))}
              <div ref={scrollEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border bg-card/40 backdrop-blur-sm p-3 sm:p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="আপনার মেসেজ লিখুন..."
              className="min-h-[44px] max-h-32 resize-none bg-secondary/50 border-border focus-visible:ring-primary"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="shrink-0 h-[44px] w-[44px] bg-primary text-primary-foreground hover:bg-primary/80"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Raz Dev ওপেন সোর্স AI মডেল দিয়ে চলে
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
