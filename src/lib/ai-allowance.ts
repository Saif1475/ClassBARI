// Server only: one student's AI allowance for the current 12-hour window (tokens and, for packs, money), shared by
// the AI chat and "Ask AI" on a PDF. Overuse in the previous window is taken from this one.
import { aiWindow, carried, leftPct, previousWindow, windowCostUsd, windowTokens } from "./ai-chat.ts";
import { admin } from "./data-server.ts";

export async function allowance(key: string, institute: string, plan: { daily: number; pack: number } | null) {
  const db = admin();
  const w = aiWindow();
  const p = previousWindow(w);
  const row = (day: string, slot: number) => db.from("ai_usage").select("questions, cost_usd, tokens").eq("user_key", key).eq("day", day).eq("slot", slot).maybeSingle();
  const [{ data: mine }, { data: before }] = await Promise.all([row(w.day, w.slot), row(p.day, p.slot)]);
  const limit = windowTokens(plan?.daily);
  const costLimit = plan ? windowCostUsd(plan.pack) : Infinity; // staff previews: tokens only (the monthly budget still applies)
  const carry = carried(before, limit, costLimit);
  const tokens = Number(mine?.tokens ?? 0) + carry.tokens;
  const cost = Number(mine?.cost_usd ?? 0) + carry.cost;
  return {
    ...w,
    // Checked before asking, so the last answer of a window can go over a little; that bit comes off the next window.
    over: tokens >= limit || cost >= costLimit,
    left: (addTokens = 0, addCost = 0) => leftPct(tokens + addTokens, limit, cost + addCost, costLimit),
    // shortcut: read-then-write count; two answers at the same instant may both count as one. Use a DB function if that matters.
    record: (addCost: number, addTokens: number) =>
      db.from("ai_usage").upsert({ user_key: key, day: w.day, slot: w.slot, institute_id: institute, questions: (mine?.questions ?? 0) + 1, cost_usd: Number(mine?.cost_usd ?? 0) + addCost, tokens: Number(mine?.tokens ?? 0) + addTokens }),
  };
}
