// "Ask AI" about a PDF lesson (premium): the plain-logic parts, tested in scripts/ai-chat.test.mjs.
import type { PdfPage } from "./pdf-insights.ts";

export type ChatTurn = { role: "user" | "assistant"; content: string };
/**
 * Tokens per person per day (input incl. the lesson text and cached parts, plus output), split into two 12-hour
 * windows that each refill on their own. Staff previews use AI_DAILY_TOKENS (default 200,000); students use their pack's.
 */
export const windowTokens = (daily = Number(process.env.AI_DAILY_TOKENS) || 200_000) => daily / 2;

/** The models students can chat with. provider: whose API answers. price: US$ per million tokens [input, output, cache read]. */
export const MODELS: Record<string, { label: string; provider: "anthropic" | "google" | "qwen" | "openai"; price: [number, number, number] }> = {
  "qwen3.7-flash": { label: "Qwen Flash", provider: "qwen", price: [0.03, 0.13, 0.03] },
  "gemini-2.5-flash-lite": { label: "Gemini Flash-Lite", provider: "google", price: [0.1, 0.4, 0.1] },
  "claude-haiku-5-5": { label: "Claude Haiku", provider: "anthropic", price: [0.1, 0.5, 0.01] },
  "gemini-3-flash-preview": { label: "Gemini 3 Flash", provider: "google", price: [0.5, 3, 0.5] },
  "gpt-5.6-luna": { label: "GPT Luna", provider: "openai", price: [0.2, 1.2, 0.2] },
  "qwen3.8-flash": { label: "Qwen 3.8 Flash", provider: "qwen", price: [0.15, 0.47, 0.15] },
  "qwen3.7-plus": { label: "Qwen Plus", provider: "qwen", price: [0.4, 1.6, 0.4] },
  "qwen3.8-max": { label: "Qwen Max", provider: "qwen", price: [2, 6, 0.25] },
  "claude-sonnet-5-5": { label: "Claude Sonnet", provider: "anthropic", price: [2, 10, 0.1] },
  "claude-opus-5-5": { label: "Claude Opus", provider: "anthropic", price: [4, 20, 0.2] }, // staff previews only
};

/** Student AI packs (৳ per month): tokens a day, and the models added at that pack (a bigger pack keeps the smaller packs' models). */
export const PACKS = [150, 400, 800, 1500] as const;
const PLANS: Record<number, { daily: number; adds: string[] }> = {
  150: { daily: 100_000, adds: ["gemini-2.5-flash-lite", "qwen3.7-flash"] },
  400: { daily: 100_000, adds: ["claude-haiku-5-5", "gemini-3-flash-preview"] },
  800: { daily: 150_000, adds: ["gpt-5.6-luna", "qwen3.7-plus"] },
  1500: { daily: 200_000, adds: ["claude-sonnet-5-5", "qwen3.8-flash", "qwen3.8-max"] },
};
/** Students without a pack: the cheapest model, 10,000 answer tokens every 12 hours. pack 0 means free. */
export const FREE = { pack: 0, daily: 20_000, models: ["qwen3.7-flash"] };
/** Free: the most AI money one student may use in a 12-hour window (a backstop to the tokens; ~$0.0015 at full use). */
const FREE_WINDOW_USD = Number(process.env.AI_FREE_WINDOW_USD) || 0.004;
export function packPlan(pack: number | undefined, s: AiSettings = {}) {
  const price = PLANS[pack ?? 0] ? (pack as number) : 150; // premium given before packs existed counts as the smallest
  // Cheapest model first: the first one that is set up is the default; students switch to a stronger one when they want.
  const models = PACKS.filter((p) => p <= price)
    .flatMap((p) => PLANS[p].adds)
    .filter((id) => modelOn(id, s))
    .sort((a, b) => MODELS[a].price[1] - MODELS[b].price[1]);
  return { pack: price, daily: s.packDaily?.[price] ?? PLANS[price].daily, models };
}
/** The free plan as the admin panel set it (off: no models at all). */
export const freePlan = (s: AiSettings = {}) => ({ pack: 0, daily: s.freeDaily ?? FREE.daily, models: s.freeOn === false ? [] : FREE.models.filter((id) => modelOn(id, s)) });

/**
 * What the admin panel changed (kept in platform settings). Anything left out keeps the value in this file or .env.local,
 * so nothing changes until the admin edits it.
 */
export type AiSettings = {
  budgetUsd?: number; // monthly AI budget for the whole site
  offProviders?: string[];
  offModels?: string[];
  freeOn?: boolean;
  freeDaily?: number; // tokens a day (two 12-hour windows)
  freeWindowUsd?: number;
  packDaily?: Record<string, number>; // by pack price
  costShare?: number;
};
export const PROVIDERS = ["anthropic", "google", "qwen", "openai"] as const;
/** Switched on in the admin panel (both the model and its provider). */
export const modelOn = (id: string, s: AiSettings = {}) => !!MODELS[id] && !s.offModels?.includes(id) && !s.offProviders?.includes(MODELS[id].provider);
export const monthlyBudgetUsd = (s: AiSettings = {}) => s.budgetUsd ?? Number(process.env.AI_MONTHLY_BUDGET_USD || 30);
/** The values used when the admin panel has not changed them. */
export const aiDefaults = () => ({
  budgetUsd: Number(process.env.AI_MONTHLY_BUDGET_USD || 30),
  freeOn: true,
  freeDaily: FREE.daily,
  freeWindowUsd: FREE_WINDOW_USD,
  costShare: PACK_COST_SHARE,
  packDaily: Object.fromEntries(PACKS.map((p) => [p, PLANS[p].daily])) as Record<string, number>,
});

/**
 * Profit guard: a student's AI may cost us at most this share of their pack's price, whatever the models cost.
 * 0.65 leaves at least 35% of every pack (30% target plus room for bKash fees and the dollar rate).
 */
export const PACK_COST_SHARE = Number(process.env.AI_PACK_COST_SHARE) || 0.65;
const usdToBdt = () => Number(process.env.USD_TO_BDT) || 122;
/** US$ a student's pack may spend in one 12-hour window (a month has 60 of them). */
export const windowCostUsd = (pack: number, s: AiSettings = {}) => (pack ? (pack * (s.costShare ?? PACK_COST_SHARE)) / usdToBdt() / 60 : (s.freeWindowUsd ?? FREE_WINDOW_USD));
/** The window just before this one (overuse in it is taken from this one). */
export function previousWindow(w: { day: string; slot: number }) {
  if (w.slot > 0) return { day: w.day, slot: w.slot - 1 };
  const d = new Date(`${w.day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { day: d.toISOString().slice(0, 10), slot: 1 };
}
/** What went over the limits in the last window and so counts against this one. */
export const carried = (prev: { tokens?: number | null; cost_usd?: number | null } | null | undefined, limit: number, costLimit: number) => ({
  tokens: Math.max(0, Number(prev?.tokens ?? 0) - limit),
  cost: Math.max(0, Number(prev?.cost_usd ?? 0) - costLimit),
});
/** % of this window left: the smaller of what's left in tokens and in money. */
export const leftPct = (tokens: number, limit: number, cost: number, costLimit: number) =>
  Math.max(0, Math.round(100 * Math.min(1 - tokens / limit, costLimit === Infinity ? 1 : 1 - cost / costLimit)));
// One answer at a time per person on this server: the next question waits until the one before it is counted, so
// sending many at the same moment cannot get past the limit. (With several servers the count is still right, see
// `record` in ai-allowance.ts, but that many answers could start before the first is counted.)
const lines = new Map<string, Promise<void>>();
/** Wait for this person's turn; call what it gives back when the answer is counted (or was not given). */
export async function takeTurn(key: string) {
  const before = lines.get(key) ?? Promise.resolve();
  let done!: () => void;
  const line = before.then(() => new Promise<void>((free) => (done = free)));
  lines.set(key, line);
  await before;
  const timer = setTimeout(() => done(), 150_000); // never held for ever: an answer is cut off after 120 s anyway
  return () => {
    clearTimeout(timer);
    done();
    if (lines.get(key) === line) lines.delete(key);
  };
}

/**
 * Every chat model for the picker, cheapest pack first: `pack` is the smallest pack that has it, and `locked` says
 * this student's pack doesn't (so they see what a bigger pack would give them). Free (pack 0): the free model shows
 * pack 0, every other one is locked.
 */
export const modelMenu = (pack: number | undefined, s: AiSettings = {}) =>
  PACKS.flatMap((p) =>
    PLANS[p].adds.filter((id) => modelOn(id, s)).map((id) =>
      pack === 0 && FREE.models.includes(id) ? { id, label: MODELS[id].label, pack: 0, locked: false } : { id, label: MODELS[id].label, pack: p as number, locked: pack === 0 || p > packPlan(pack).pack },
    ),
  );

/** How much of an attached file's text goes with a chat (it is sent again with every question, so it uses the allowance). */
export const FILE_TEXT_MAX = 30_000;
/** A file attached to a chat, already turned into text by the browser: { name, text }. */
export function chatFile(raw: unknown) {
  const f = raw as { name?: unknown; text?: unknown } | null;
  if (!f || typeof f.name !== "string" || typeof f.text !== "string" || !f.text.trim() || f.name.length > 200 || f.text.length > FILE_TEXT_MAX) return null;
  return { name: f.name.replace(/["\n\r]/g, " ").trim() || "file", text: f.text };
}
/** The conversation with the file's text placed before the first question (the same place every time, so it can be cached). */
export const withFile = (turns: ChatTurn[], file: { name: string; text: string } | null): ChatTurn[] =>
  file ? turns.map((t, i) => (i === 0 ? { ...t, content: `Attached file "${file.name}":\n<file>\n${file.text}\n</file>\n\n${t.content}` } : t)) : turns;

/** A photo sent with a question: a PNG, JPEG or WebP data URL of a sensible size, split for the API. */
export function chatImage(raw: unknown) {
  const m = typeof raw === "string" && raw.length <= 5_000_000 ? raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
  return m ? { media_type: m[1] as "image/png" | "image/jpeg" | "image/webp", data: m[2] } : null;
}

/** The 12-hour window (Bangladesh time, UTC+6) a moment falls in, and when the next one starts. */
export function aiWindow(now = new Date()) {
  const bd = new Date(now.getTime() + 6 * 3600_000); // shift so the UTC fields read as Dhaka time
  const slot = Math.floor(bd.getUTCHours() / 12);
  const next = Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate(), (slot + 1) * 12) - 6 * 3600_000;
  return { day: bd.toISOString().slice(0, 10), slot, resetsAt: new Date(next).toISOString() };
}
/** One more line for the model, naming the language to answer in: small models otherwise answer English questions in Bangla. */
export const answerIn = (question: string) =>
  /[ঀ-৿]/.test(question)
    ? "The student's latest message is written in Bangla. Answer in Bangla."
    : "The student's latest message is written in English letters. Answer in English, unless it is Bangla typed in English letters: then answer in Bangla.";
/** A student's own choices for answers (Chat settings): a fixed language and a length. Anything else sent is dropped. */
export type ChatPrefs = { lang?: "bn" | "en"; length?: "short" | "long" };
export function chatPrefs(raw: unknown): ChatPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as { lang?: unknown; length?: unknown };
  return { ...(p.lang === "bn" || p.lang === "en" ? { lang: p.lang } : {}), ...(p.length === "short" || p.length === "long" ? { length: p.length } : {}) };
}
/** The lines those choices add for the model. With no fixed language, the language is the question's own (answerIn). */
export const prefsRule = (prefs: ChatPrefs, question: string) =>
  [
    prefs.lang === "bn" ? "The student has chosen Bangla for every answer. Answer in Bangla." : prefs.lang === "en" ? "The student has chosen English for every answer. Answer in English." : answerIn(question),
    prefs.length === "short" ? "The student wants short answers: at most about 120 words, only the key steps." : prefs.length === "long" ? "The student wants detailed answers: explain every step and add one worked example." : "",
  ].filter(Boolean).join("\n");
export const MAX_QUESTION = 1000;
/** Ends the streamed chat answer; after it comes JSON: the allowance left (%), declined, cut, error. */
export const TRAILER = "\u001e";

/** The conversation sent by the browser or a phone app, checked: at most the last 10 turns, short questions, ending with a question. */
export function cleanHistory(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const turns = raw.slice(-10);
  for (const t of turns) {
    const ok = t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim() && (t.role === "assistant" || t.content.length <= MAX_QUESTION);
    if (!ok) return null;
  }
  while (turns.length && turns[0].role !== "user") turns.shift(); // the API wants the user first
  // An earlier answer that ran long is passed on shortened, not refused: refusing it ended the chat after every long answer.
  return turns.length && turns[turns.length - 1].role === "user" ? turns.map((t) => ({ role: t.role, content: t.content.trim().slice(0, t.role === "user" ? MAX_QUESTION : 6000) })) : null;
}

const word = /[\p{L}\p{M}\p{N}]{3,}/gu;
/** Without AI: the PDF sentences that share the most words with the question, with their page. */
export function basicAnswer(pages: PdfPage[], question: string): string | null {
  const q = new Set((question.toLowerCase().match(word) ?? []));
  if (!q.size) return null;
  const scored = pages.flatMap((p) =>
    p.text
      .split(/(?<=[.!?।])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
      .map((s) => ({ s, page: p.n, score: (s.toLowerCase().match(word) ?? []).filter((w) => q.has(w)).length })),
  );
  const best = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return best.length ? best.map((x) => `(p. ${x.page}) ${x.s}`).join("\n") : null;
}

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
/** Every token a request used, cached or not: what the daily limit counts. */
export const usedTokens = (u: Usage) => u.input_tokens + u.output_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);

export function costUsd(model: string, u: Usage) {
  const [i, o, r] = MODELS[model]?.price ?? [8, 40, 0.2]; // unknown models count at the most expensive rate
  return (u.input_tokens * i + (u.cache_creation_input_tokens ?? 0) * i * 1.25 + (u.cache_read_input_tokens ?? 0) * r + u.output_tokens * o) / 1e6;
}
