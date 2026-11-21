// 3-Tier AI Subscription & Token Quota Store (localStorage-backed demo; ready for Supabase + bKash).

/**
 * WORK IN PROGRESS: AI study help is switched off (UI shows "coming soon", /api/ai/study refuses).
 * Before turning on: real payment for plans, limits checked on the SERVER per logged-in student,
 * send the PDF's text (not its title), and only offer models that are actually wired up.
 */
export const AI_ENABLED = false;

export type AiTier = "free" | "base" | "pro" | "ultra";
export type AiModelId = "gemini-flash-lite" | "gpt-4o-mini" | "gemini-flash" | "gpt-4o" | "claude-sonnet";

export type AiModelInfo = {
  id: AiModelId;
  name: string;
  provider: "Gemini" | "ChatGPT" | "Claude";
  minTier: AiTier;
  badge: string;
};

export const AI_MODELS: AiModelInfo[] = [
  { id: "gemini-flash-lite", name: "Gemini 2.5 Flash-Lite", provider: "Gemini", minTier: "base", badge: "Fast" },
  { id: "gpt-4o-mini", name: "ChatGPT 4o-mini", provider: "ChatGPT", minTier: "base", badge: "Fast" },
  { id: "gemini-flash", name: "Gemini 2.5 Flash", provider: "Gemini", minTier: "pro", badge: "Pro" },
  { id: "gpt-4o", name: "ChatGPT 4o", provider: "ChatGPT", minTier: "ultra", badge: "Ultra" },
  { id: "claude-sonnet", name: "Claude Sonnet", provider: "Claude", minTier: "ultra", badge: "Ultra" },
];

export type AiPlan = {
  id: Exclude<AiTier, "free">;
  name: string;
  price: number;
  dailyIn: number;
  dailyOut: number;
  premiumMonthly?: string;
  modelsLabel: string;
  highlight?: boolean;
};

export const AI_PLANS: AiPlan[] = [
  {
    id: "base",
    name: "Base AI",
    price: 149,
    dailyIn: 100_000,
    dailyOut: 35_000,
    modelsLabel: "Gemini Flash-Lite + GPT-4o-mini",
  },
  {
    id: "pro",
    name: "Pro AI",
    price: 500,
    dailyIn: 300_000,
    dailyOut: 100_000,
    premiumMonthly: "+ 2M in / 600k out mo on Gemini Flash",
    modelsLabel: "Lite + Mini + Gemini 2.5 Flash",
    highlight: true,
  },
  {
    id: "ultra",
    name: "Ultra AI",
    price: 1200,
    dailyIn: 500_000,
    dailyOut: 150_000,
    premiumMonthly: "+ 1M in / 300k out mo on Claude Sonnet & GPT-4o",
    modelsLabel: "All Models: Gemini + ChatGPT 4o + Claude Sonnet",
  },
];

const TIER_RANK: Record<AiTier, number> = { free: 0, base: 1, pro: 2, ultra: 3 };
export const canUseModel = (tier: AiTier, model: AiModelId) => {
  const info = AI_MODELS.find((m) => m.id === model);
  return info ? TIER_RANK[tier] >= TIER_RANK[info.minTier] : false;
};

export type AiSubState = {
  tier: AiTier;
  day: string;
  inputUsed: number;
  outputUsed: number;
};

const SUB_KEY = "edunest-ai-sub-v1";
const CACHE_KEY = "edunest-pdf-ai-cache-v1";
const todayStr = () => new Date().toISOString().slice(0, 10);

export function readAiSub(): AiSubState {
  const today = todayStr();
  try {
    const raw = localStorage.getItem(SUB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AiSubState;
      if (parsed.day === today) return parsed;
      return { tier: parsed.tier ?? "free", day: today, inputUsed: 0, outputUsed: 0 };
    }
  } catch {
    /* ignore */
  }
  return { tier: "free", day: today, inputUsed: 0, outputUsed: 0 };
}

export function writeAiSub(next: AiSubState) {
  try {
    localStorage.setItem(SUB_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export type PdfAiSummary = {
  summary: string;
  keywords: string[];
  formulas: string[];
  cachedAt: string;
};

export function readPdfSummaryCache(pdfKey: string): PdfAiSummary | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, PdfAiSummary>;
    return map[pdfKey] ?? null;
  } catch {
    return null;
  }
}

export function writePdfSummaryCache(pdfKey: string, data: PdfAiSummary) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, PdfAiSummary>) : {};
    map[pdfKey] = data;
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
