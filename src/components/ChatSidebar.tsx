import { useState, useEffect } from "react";
import { Plus, MessageSquare, Trash2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ChatSidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

const ChatSidebar = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: ChatSidebarProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { user, signOut } = useAuth();

  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (data) setConversations(data);
  };

  useEffect(() => {
    loadConversations();
  }, [user, currentConversationId]);

  const deleteConversation = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    if (currentConversationId === id) onNewConversation();
    loadConversations();
  };

  return (
    <div className="flex flex-col h-full w-64 bg-card border-r border-border">
      <div className="p-3 border-b border-border">
        <Button
          onClick={onNewConversation}
          variant="outline"
          className="w-full justify-start gap-2 text-sm"
        >
          <Plus className="h-4 w-4" /> নতুন চ্যাট
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                currentConversationId === conv.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <Button
          onClick={signOut}
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground text-xs"
        >
          <LogOut className="h-3 w-3" /> লগআউট
        </Button>
      </div>
    </div>
  );
};

export default ChatSidebar;
