import { HfInference } from "@huggingface/inference";

// HF_TOKEN is injected at build time via env var
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "";
const MODEL = import.meta.env.VITE_HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";

const hf = new HfInference(HF_TOKEN);

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

const SYSTEM_PROMPT: Message = {
  role: "system",
  content: `You are Raz Dev, a helpful AI coding assistant. You help developers build, debug, and deploy applications. You are friendly, concise, and always provide working code examples when relevant. Respond in the same language the user writes in.`,
};

export async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: Message[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  if (!HF_TOKEN) {
    onError("HF Token কনফিগার করা হয়নি। VITE_HF_TOKEN সেট করুন।");
    return;
  }

  try {
    const stream = hf.chatCompletionStream({
      model: MODEL,
      messages: [SYSTEM_PROMPT, ...messages],
      max_tokens: 2048,
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        onDelta(content);
      }
    }
    onDone();
  } catch (err: any) {
    console.error("HF Inference error:", err);
    onError(err?.message || "AI থেকে রেসপন্স পেতে সমস্যা হয়েছে।");
  }
}
