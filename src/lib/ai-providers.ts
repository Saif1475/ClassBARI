// Server only: asks one of the chat models and streams its answer. Claude through Anthropic's SDK; Gemini, Qwen and
// GPT through their OpenAI-compatible endpoints (one small client for all three).
import Anthropic from "@anthropic-ai/sdk";
import { MODELS, type ChatTurn } from "./ai-chat.ts";

type Provider = (typeof MODELS)[string]["provider"];
const SETUP: Record<Exclude<Provider, "anthropic">, { key: string; url: string }> = {
  google: { key: "GEMINI_API_KEY", url: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai" },
  qwen: { key: "DASHSCOPE_API_KEY", url: process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  openai: { key: "OPENAI_API_KEY", url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1" },
};
const providerOf = (model: string): Provider => MODELS[model]?.provider ?? "anthropic";
/** Is this model's API key set on the server? */
export const modelReady = (model: string) => !!process.env[providerOf(model) === "anthropic" ? "ANTHROPIC_API_KEY" : SETUP[providerOf(model) as keyof typeof SETUP].key];

export type Ask = {
  model: string;
  system: { text: string; cache?: boolean }[]; // cache: the same for every question (a lesson's text), so Claude re-reads it cheaply
  messages: ChatTurn[];
  image?: { media_type: "image/png" | "image/jpeg" | "image/webp"; data: string } | null; // goes with the last question
  maxTokens: number;
};
export type Answered = { usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }; declined: boolean; cut: boolean };

/** Pull the text pieces and the token count out of an OpenAI-style event stream. Exported for the unit test. */
export async function readSse(body: ReadableStream<Uint8Array>, onText: (t: string) => void) {
  const out = { input: 0, output: 0, finish: "" };
  const dec = new TextDecoder();
  let buf = "";
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? "\n" : dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      let ev: { choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null };
      try {
        ev = JSON.parse(data);
      } catch {
        continue; // a keep-alive or half line
      }
      const c = ev.choices?.[0];
      if (typeof c?.delta?.content === "string" && c.delta.content) onText(c.delta.content);
      if (c?.finish_reason) out.finish = c.finish_reason;
      if (ev.usage) {
        out.input = ev.usage.prompt_tokens ?? 0;
        // Everything that is not the question is billed as answer. Some providers leave the model's own thinking out
        // of completion_tokens but put it in the total, so the bigger of the two is counted.
        out.output = Math.max(ev.usage.completion_tokens ?? 0, (ev.usage.total_tokens ?? 0) - out.input);
      }
    }
    if (done) return out;
  }
}

/** Ask the model; `onText` gets the answer piece by piece. Throws when the provider can't be reached or refuses the request. */
export async function streamChat(ask: Ask, onText: (t: string) => void): Promise<Answered> {
  const last = ask.messages.length - 1;
  if (providerOf(ask.model) === "anthropic") {
    const stream = new Anthropic().beta.messages.stream({
      model: ask.model,
      max_tokens: ask.maxTokens,
      ...(ask.model.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }), // Haiku has no server-side fallback
      output_config: { effort: "low" },
      system: ask.system.map((b) => ({ type: "text" as const, text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) })),
      messages: ask.messages.map((m, i) => (ask.image && i === last ? { role: "user" as const, content: [{ type: "image" as const, source: { type: "base64" as const, ...ask.image } }, { type: "text" as const, text: m.content }] } : m)),
    });
    for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onText(ev.delta.text);
    const final = await stream.finalMessage();
    return { usage: final.usage, declined: final.stop_reason === "refusal", cut: final.stop_reason === "max_tokens" };
  }
  const { key, url } = SETUP[providerOf(ask.model) as keyof typeof SETUP];
  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env[key]}` },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: ask.model,
      stream: true,
      stream_options: { include_usage: true }, // the token count arrives as the last event
      // The longest answer we pay for. Their limit also counts the model's own thinking, so it is twice the answer's
      // size; without it one answer could run to the model's full length (tens of thousands of tokens).
      [providerOf(ask.model) === "openai" ? "max_completion_tokens" : "max_tokens"]: ask.maxTokens * 2,
      messages: [
        { role: "system", content: ask.system.map((b) => b.text).join("\n\n") },
        ...ask.messages.map((m, i) =>
          ask.image && i === last ? { role: "user", content: [{ type: "text", text: m.content }, { type: "image_url", image_url: { url: `data:${ask.image.media_type};base64,${ask.image.data}` } }] } : m,
        ),
      ],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`${ask.model}: HTTP ${res.status}`);
  let chars = 0;
  const r = await readSse(res.body, (t) => ((chars += t.length), onText(t)));
  // shortcut: a provider that sends no token count is charged by length (about 2 characters a token for Bangla) plus the question.
  const usage = r.input || r.output ? { input_tokens: r.input, output_tokens: r.output } : { input_tokens: Math.ceil(JSON.stringify(ask.messages).length / 2), output_tokens: Math.ceil(chars / 2) };
  return { usage, declined: r.finish === "content_filter", cut: r.finish === "length" };
}
