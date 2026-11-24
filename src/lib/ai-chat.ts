// "Ask AI" about a PDF lesson (premium): the plain-logic parts, tested in scripts/ai-chat.test.mjs.
import type { PdfPage } from "./pdf-insights.ts";

export type ChatTurn = { role: "user" | "assistant"; content: string };
/**
 * Tokens per person per day (input incl. the lesson text and cached parts, plus output), refilled at midnight in Dhaka.
 * Staff previews use AI_DAILY_TOKENS (default 200,000); students use their pack's.
 */
export const windowTokens = (daily = Number(process.env.AI_DAILY_TOKENS) || 200_000) => daily;

/** The models students can chat with. provider: whose API answers. price: US$ per million tokens [input, output, cache read]. */
export const MODELS: Record<string, { label: string; provider: "anthropic" | "google" | "qwen" | "openai" | "openrouter"; price: [number, number, number]; textOnly?: true; route?: string }> = { // route: the model's name at its provider, when it differs
  // Alibaba-only Qwen models: on OpenRouter only Alibaba serves them, which fails the "don't keep students' data" rule, so
  // they go to Alibaba's own API (DashScope) and show as "coming soon" until DASHSCOPE_API_KEY is set (owner's decision).
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
  // Through OpenRouter (one key): models of 100B+ parameters with Bangla support (official language list or a Bangla
  // test, Nov 2026). Prices are OpenRouter's list prices; its 5.5% top-up fee is added when counting cost (costUsd).
  "deepseek/deepseek-v4.1-flash": { label: "DeepSeek V4.1 Flash", provider: "openrouter", price: [0.05, 0.199, 0.05], textOnly: true },
  "openai/gpt-oss-120b": { label: "GPT-OSS 120B", provider: "openrouter", price: [0.05, 0.25, 0.05], textOnly: true },
  "qwen/qwen3-235b-a22b-2507": { label: "Qwen3 235B", provider: "openrouter", price: [0.14, 0.8, 0.14], textOnly: true },
  "z-ai/glm-5.3": { label: "GLM-5.3", provider: "openrouter", price: [0.07, 1.4, 0.07], textOnly: true },
  "qwen/qwen3-vl-235b-a22b-instruct": { label: "Qwen3-VL 235B (reads photos)", provider: "openrouter", price: [0.21, 1.9, 0.21] },
  "qwen/qwen3.5-122b-a10b": { label: "Qwen3.5 122B", provider: "openrouter", price: [0.26, 2.08, 0.26], textOnly: true },
  "qwen/qwen3.5-397b-a17b": { label: "Qwen3.5 397B", provider: "openrouter", price: [0.45, 3, 0.45], textOnly: true },
  "qwen/qwen3-235b-a22b-thinking-2507": { label: "Qwen3 235B Thinking", provider: "openrouter", price: [0.45, 3.5, 0.45], textOnly: true },
};

/** Student AI packs (৳ per month): tokens a day, and the models added at that pack (a bigger pack keeps the smaller packs' models). */
export const PACKS = [150, 400, 800, 1500] as const;
/**
 * Which plan a model belongs to, by its price for answers (US$ per million output tokens), decided by the owner
 * 2026-11-23: under $0.20 free, under $0.50 ৳150, under $1.20 ৳400, under $3 ৳800, up to $6 ৳1500. Dearer models
 * (Claude Sonnet, Opus) are in no plan. A new model lands in its plan from its price alone.
 */
export function planOf(id: string): number | null {
  const out = MODELS[id]?.price[1];
  if (out === undefined || id === "claude-opus-5-5") return null; // Opus: staff previews only
  return out < 0.2 ? 0 : out < 0.5 ? 150 : out < 1.2 ? 400 : out < 3 ? 800 : out <= 6 ? 1500 : null;
}
const inPlan = (plan: number) => Object.keys(MODELS).filter((id) => planOf(id) === plan);
const PLANS: Record<number, { daily: number; adds: string[] }> = {
  150: { daily: 100_000, adds: inPlan(150) },
  400: { daily: 100_000, adds: inPlan(400) },
  800: { daily: 150_000, adds: inPlan(800) },
  1500: { daily: 200_000, adds: inPlan(1500) },
};
/** The share of a pack's price that is ours whatever the student does (owner's decision 2026-11-23: a 40% margin). */
export const PACK_MARGIN = 0.4;
/** ৳ per US$ (USD_TO_BDT in .env.local when the rate moves). */
const usdToBdt = (s: AiSettings = {}) => s.usdToBdt ?? (Number(process.env.USD_TO_BDT) || 122);
/** The most AI money one student's pack may use in a calendar month (Dhaka time), US$: what the margin leaves, to the cent below. */
export const packCapUsd = (pack: number, s: AiSettings = {}) => Math.floor((pack * (1 - (s.packMargin ?? PACK_MARGIN)) * 100) / usdToBdt(s)) / 100;
export const PACK_MONTHLY_USD: Record<number, number> = Object.fromEntries(PACKS.map((p) => [p, packCapUsd(p)]));
/** Students without a pack: the free models (under $0.20 for answers), 20,000 tokens a day. pack 0 means free. */
export const FREE = { pack: 0, daily: 20_000, models: inPlan(0) };
/** Free: the most AI money one student may use in a day (a backstop to the tokens; ~$0.003 at full use). */
const FREE_WINDOW_USD = Number(process.env.AI_FREE_WINDOW_USD) || 0.008;
export function packPlan(pack: number | undefined, s: AiSettings = {}) {
  const price = PLANS[pack ?? 0] ? (pack as number) : 150; // premium given before packs existed counts as the smallest
  // Cheapest model first: the first one that is set up is the default; students switch to a stronger one when they want.
  const models = [...FREE.models, ...PACKS.filter((p) => p <= price).flatMap((p) => PLANS[p].adds)] // a pack keeps the free models too
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
  freeDaily?: number; // tokens a day
  freeWindowUsd?: number; // the free plan's money backstop per day (the name is from the 12-hour windows)
  packDaily?: Record<string, number>; // by pack price
  packMonthlyUsd?: Record<string, number>; // by pack price: the most AI money one student may use in a month (overrides the margin)
  packMargin?: number; // share of each pack's price that is ours (0.4 = 40%); the monthly caps follow it
  usdToBdt?: number; // ৳ per US$
};
export const PROVIDERS = ["anthropic", "google", "qwen", "openai", "openrouter"] as const;
/** Switched on in the admin panel (both the model and its provider). */
export const modelOn = (id: string, s: AiSettings = {}) => !!MODELS[id] && !s.offModels?.includes(id) && !s.offProviders?.includes(MODELS[id].provider);
export const monthlyBudgetUsd = (s: AiSettings = {}) => s.budgetUsd ?? Number(process.env.AI_MONTHLY_BUDGET_USD || 30);
/** The site's monthly AI budget is used up for this plan: free chats stop at 80%, so students who paid always have the last 20%. Extra credit never gets past it. */
export const budgetPaused = (spentUsd: number, s: AiSettings, pack: number) => spentUsd >= monthlyBudgetUsd(s) * (pack ? 1 : 0.8);
/** The values used when the admin panel has not changed them. */
export const aiDefaults = (s: AiSettings = {}) => ({
  packMargin: PACK_MARGIN,
  usdToBdt: Number(process.env.USD_TO_BDT) || 122,
  budgetUsd: Number(process.env.AI_MONTHLY_BUDGET_USD || 30),
  freeOn: true,
  freeDaily: FREE.daily,
  freeWindowUsd: FREE_WINDOW_USD,
  packMonthlyUsd: Object.fromEntries(PACKS.map((p) => [p, packCapUsd(p, s)])) as Record<string, number>, // from the margin and rate in use
  packDaily: Object.fromEntries(PACKS.map((p) => [p, PLANS[p].daily])) as Record<string, number>,
});

/** A pack's monthly AI money cap (US$) as the admin panel set it, else the owner's default. */
export const packMonthlyUsd = (pack: number, s: AiSettings = {}) => s.packMonthlyUsd?.[pack] ?? ((PACKS as readonly number[]).includes(pack) ? packCapUsd(pack, s) : 0);
/** The free plan's money backstop per day (packs have a monthly cap instead). */
export const windowCostUsd = (pack: number, s: AiSettings = {}) => (pack ? Infinity : (s.freeWindowUsd ?? FREE_WINDOW_USD));
/** Day d of a month (UTC date of a Dhaka day), moved to the month's last day when it is shorter (a pack ending on the 31st). */
const onDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
/** The first day (YYYY-MM-DD) of the pack's own month: the latest day not after today on the day-of-month the pack ends (premiumUntil); the 1st without one. */
export function packMonthStart(day: string, until?: string) {
  const [y, m, d] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(until?.slice(8, 10)) || 1];
  const here = onDay(y, m, d).toISOString().slice(0, 10);
  return here < day || (here === day && day !== until) ? here : onDay(y, m - 1, d).toISOString().slice(0, 10); // the pack's last day (day === until) still belongs to the month before it, so the cap does not restart at zero
}
/** When the pack's next month starts, midnight in Dhaka (UTC+6), as a time: when its monthly AI cap refills. */
export function monthStartAfter(day: string, until?: string) {
  const s = packMonthStart(day, until);
  return new Date(onDay(Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(until?.slice(8, 10)) || 1).getTime() - 6 * 3600_000).toISOString();
}
/** The day before this one (overuse in it is taken from this one). */
export function previousWindow(w: { day: string; slot?: number }) {
  const d = new Date(`${w.day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { day: d.toISOString().slice(0, 10), slot: 0 };
}
/** What went over the limits yesterday and so counts against today. */
export const carried = (prev: { tokens?: number | null; cost_usd?: number | null } | null | undefined, limit: number, costLimit: number) => ({
  tokens: Math.max(0, Number(prev?.tokens ?? 0) - limit),
  cost: Math.max(0, Number(prev?.cost_usd ?? 0) - costLimit),
});
/** % of today's allowance left: the smaller of what's left in tokens and in money. */
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
export const modelMenu = (pack: number | undefined, s: AiSettings = {}) => {
  const mine = pack === 0 ? 0 : packPlan(pack).pack;
  // The free models first (every student has them), then each pack's, cheapest pack first.
  return ([[0, FREE.models], ...PACKS.map((p) => [p, PLANS[p].adds])] as [number, string[]][]).flatMap(([p, ids]) =>
    ids.filter((id) => modelOn(id, s)).map((id) => ({ id, label: MODELS[id].label, pack: p, locked: p > mine })),
  );
};

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

/** The day (Bangladesh time, UTC+6) a moment falls in, and the next midnight in Dhaka, when the allowance refills. slot is always 0. */
export function aiWindow(now = new Date()) {
  const bd = new Date(now.getTime() + 6 * 3600_000); // shift so the UTC fields read as Dhaka time
  const next = Date.UTC(bd.getUTCFullYear(), bd.getUTCMonth(), bd.getUTCDate() + 1) - 6 * 3600_000;
  return { day: bd.toISOString().slice(0, 10), slot: 0, resetsAt: new Date(next).toISOString() };
}

/** Extra credit a student buys (whole taka) to keep chatting after the daily limit; it never expires. */
export const CREDIT_MIN = 50;
export const CREDIT_MAX = 5000;
const marginOf = (s: AiSettings) => s.packMargin ?? PACK_MARGIN;
/** ৳ paid → US$ of AI the credit may use: what the margin leaves, at the dollar rate (so the 40% margin holds). */
export const creditUsd = (taka: number, s: AiSettings = {}) => Math.round(((taka * (1 - marginOf(s))) / usdToBdt(s)) * 1e6) / 1e6;
/** US$ of credit → ৳ as the student sees it (the same rate and margin, to 0.1). */
export const creditTaka = (usd: number, s: AiSettings = {}) => Math.round(((usd * usdToBdt(s)) / (1 - marginOf(s))) * 10) / 10;
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
  const turns = raw.slice(-8); // the last 8 messages: older ones cost input on every question and rarely matter
  for (const t of turns) {
    const ok = t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim() && (t.role === "assistant" || t.content.length <= MAX_QUESTION);
    if (!ok) return null;
  }
  while (turns.length && turns[0].role !== "user") turns.shift(); // the API wants the user first
  // An earlier answer that ran long is passed on shortened, not refused: refusing it ended the chat after every long answer.
  // The latest answer in full (up to 6,000 letters); earlier answers cut to 1,500 letters, enough to follow the chat.
  const lastAnswer = turns.map((t) => t.role).lastIndexOf("assistant");
  return turns.length && turns[turns.length - 1].role === "user" ? turns.map((t, i) => ({ role: t.role, content: t.content.trim().slice(0, t.role === "user" ? MAX_QUESTION : i === lastAnswer ? 6000 : 1500) })) : null;
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
/**
 * What counts against a student's token allowance: the answer (with the model's hidden thinking), not the chat history
 * and instructions resent with every question. Those still cost money, and the money caps (monthly cap, credit, budget) count them.
 */
export const usedTokens = (u: Usage) => u.output_tokens;

/** OpenRouter's fee on buying credits (5.5%, Nov 2026): part of what its answers really cost us. */
export const OPENROUTER_FEE = 0.055;
export function costUsd(model: string, u: Usage) {
  const [i, o, r] = MODELS[model]?.price ?? [8, 40, 0.2]; // unknown models count at the most expensive rate
  const fee = MODELS[model]?.provider === "openrouter" ? 1 + OPENROUTER_FEE : 1;
  return ((u.input_tokens * i + (u.cache_creation_input_tokens ?? 0) * i * 1.25 + (u.cache_read_input_tokens ?? 0) * r + u.output_tokens * o) * fee) / 1e6;
}
