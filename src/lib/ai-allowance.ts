// Server only: one student's AI allowance for the current 12-hour window (tokens and, for packs, money), shared by
// the AI chat and "Ask AI" on a PDF. Overuse in the previous window is taken from this one.
import { aiWindow, carried, leftPct, previousWindow, windowCostUsd, windowTokens, type AiSettings } from "./ai-chat.ts";
import { admin } from "./data-server.ts";

/** Read it only while holding the person's turn (`takeTurn` in ai-chat.ts), so no other answer is counted in between. */
export async function allowance(key: string, institute: string, plan: { daily: number; pack: number } | null, settings: AiSettings = {}) {
  const db = admin();
  const w = aiWindow();
  const p = previousWindow(w);
  const row = (day: string, slot: number) => db.from("ai_usage").select("questions, cost_usd, tokens").eq("user_key", key).eq("day", day).eq("slot", slot).maybeSingle();
  const [{ data: mine }, { data: before }] = await Promise.all([row(w.day, w.slot), row(p.day, p.slot)]);
  const limit = windowTokens(plan?.daily);
  const costLimit = plan ? windowCostUsd(plan.pack, settings) : Infinity; // staff previews: tokens only (the monthly budget still applies)
  const carry = carried(before, limit, costLimit);
  const tokens = Number(mine?.tokens ?? 0) + carry.tokens;
  const cost = Number(mine?.cost_usd ?? 0) + carry.cost;
  return {
    ...w,
    // Checked before asking, so the last answer of a window can go over a little; that bit comes off the next window.
    over: tokens >= limit || cost >= costLimit,
    left: (addTokens = 0, addCost = 0) => leftPct(tokens + addTokens, limit, cost + addCost, costLimit),
    record: async (addCost: number, addTokens: number) => {
      // Added inside the database in one step (migration 0013), so answers finishing at the same moment are all counted.
      const { error } = await db.rpc("ai_usage_add", { p_key: key, p_day: w.day, p_slot: w.slot, p_institute: institute, p_cost: addCost, p_tokens: Math.round(addTokens) });
      // shortcut: a database without migration 0013 falls back to read-then-write, which can miss answers given at the same instant on another server. Remove once every database has 0013.
      if (error) await db.from("ai_usage").upsert({ user_key: key, day: w.day, slot: w.slot, institute_id: institute, questions: (mine?.questions ?? 0) + 1, cost_usd: Number(mine?.cost_usd ?? 0) + addCost, tokens: Number(mine?.tokens ?? 0) + addTokens });
    },
  };
}
