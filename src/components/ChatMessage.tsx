import { Bot, User, Copy, Check } from "lucide-react";
import { useState } from "react";
// @ts-ignore
import ReactMarkdown from "react-markdown";
// @ts-ignore
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

const ChatMessage = ({ role, content, isStreaming }: ChatMessageProps) => {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group flex gap-3 py-4 px-4 ${isUser ? "" : "bg-card/50"}`}>
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
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-muted-foreground">
            {isUser ? "You" : "Raz Dev"}
          </p>
          {!isStreaming && content && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary"
            >
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
            {content}
          </div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-foreground prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-primary prose-code:bg-secondary/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-li:text-foreground prose-blockquote:text-muted-foreground prose-blockquote:border-primary/50">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
            {isStreaming && <span className="typing-cursor" />}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
