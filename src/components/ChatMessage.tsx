import { Bot, User } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

const ChatMessage = ({ role, content, isStreaming }: ChatMessageProps) => {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 py-4 px-4 ${isUser ? "" : "bg-card/50"}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-primary/15 text-primary"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-1 text-muted-foreground">
          {isUser ? "You" : "Raz Dev"}
        </p>
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
          {content}
          {isStreaming && <span className="typing-cursor" />}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
