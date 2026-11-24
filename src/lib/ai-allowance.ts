// Server only: one student's AI allowance for today (Dhaka day: tokens and, for packs, money), shared by the AI chat
// and "Ask AI" on a PDF. Overuse yesterday is taken from today. Past the limits, extra credit (0016) pays for answers.
import { aiWindow, carried, costUsd, creditTaka, leftPct, monthStartAfter, packMonthlyUsd, packMonthStart, previousWindow, windowCostUsd, windowTokens, type AiSettings } from "./ai-chat.ts";
import { changeCredit, creditOf } from "./ai-credit.ts";

/** Answers paid from credit are counted under this key: in the site's monthly budget, but not in the day's or month's allowance. */
export const creditKey = (key: string) => `${key}#credit`;

/** Least credit (US$) that may pay for an answer: about the dearest normal one (a 6,000-token thinking answer at US$3.5 per million, plus its input), since the cost is only taken afterwards. */
export const CREDIT_FLOOR_USD = 0.03;
/** The most one answer can cost (US$): its input at about 2 characters a token (Bangla) and the provider's output limit (twice maxTokens, thinking included). */
export const answerMaxUsd = (model: string, maxTokens: number, inputChars: number) => costUsd(model, { input_tokens: Math.ceil(inputChars / 2), output_tokens: maxTokens * 2 });

/**
 * Read it only while holding the person's turn (`takeTurn` in ai-chat.ts), so no other answer is counted in between.
 * db: the server's Supabase client (admin() in data-server.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function allowance(db: any, key: string, institute: string, plan: { daily: number; pack: number } | null, settings: AiSettings = {}, until?: string, floorUsd = CREDIT_FLOOR_USD) {
  const w = aiWindow();
  const p = previousWindow(w);
  const row = (day: string, slot: number) => db.from("ai_usage").select("questions, cost_usd, tokens").eq("user_key", key).eq("day", day).eq("slot", slot).maybeSingle();
  // Packs: the AI money so far in the pack's own month (from the day-of-month it ends, Dhaka time), against the pack's monthly cap.
  const monthCap = plan?.pack ? packMonthlyUsd(plan.pack, settings) : Infinity;
  const monthRows = monthCap === Infinity ? null : db.from("ai_usage").select("cost_usd").eq("user_key", key).gte("day", packMonthStart(w.day, until)).lte("day", w.day);
  const [{ data: mine }, { data: before }, month, credit] = await Promise.all([row(w.day, w.slot), row(p.day, p.slot), monthRows, plan ? creditOf(db, key).catch(() => 0) : 0]);
  const monthCost = ((month?.data ?? []) as { cost_usd: number }[]).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
  const limit = windowTokens(plan?.daily);
  const costLimit = plan ? windowCostUsd(plan.pack, settings) : Infinity; // staff previews: tokens only (the monthly budget still applies)
  const carry = carried(before, limit, costLimit);
  const tokens = Number(mine?.tokens ?? 0) + carry.tokens;
  const cost = Number(mine?.cost_usd ?? 0) + carry.cost;
  const monthOver = monthCost >= monthCap;
  // Money left: the free plan counts today's money, a pack the month's.
  const [spent, cap] = monthCap === Infinity ? [cost, costLimit] : [monthCost, monthCap];
  // Checked before asking, so the last answer of a day can go over a little; that bit comes off the next day.
  const used = tokens >= limit || cost >= costLimit || monthOver;
  const paying = used && credit >= Math.max(CREDIT_FLOOR_USD, floorUsd); // the daily or monthly limit is used up: extra credit pays, if it covers a whole answer
  return {
    ...w,
    // The month's cap refills when the pack's next month starts, not at midnight.
    resetsAt: monthOver ? monthStartAfter(w.day, until) : w.resetsAt,
    over: used && !paying,
    paying,
    /** US$ of credit at the start of this answer. */
    credit,
    left: (addTokens = 0, addCost = 0) => (paying ? 0 : leftPct(tokens + addTokens, limit, spent + addCost, cap)),
    /** Credit left in ৳ after this answer (what the student sees). */
    creditTk: (addCost = 0) => creditTaka(Math.max(0, credit - (paying ? addCost : 0)), settings),
    record: async (addCost: number, addTokens: number) => {
      // Added inside the database in one step (migration 0013), so answers finishing at the same moment are all counted.
      const k = paying ? creditKey(key) : key;
      const { error } = await db.rpc("ai_usage_add", { p_key: k, p_day: w.day, p_slot: w.slot, p_institute: institute, p_cost: addCost, p_tokens: Math.round(addTokens) });
      // shortcut: a database without migration 0013 falls back to read-then-write, which can miss answers given at the same instant on another server. Remove once every database has 0013.
      if (error && !paying) await db.from("ai_usage").upsert({ user_key: key, day: w.day, slot: w.slot, institute_id: institute, questions: (mine?.questions ?? 0) + 1, cost_usd: Number(mine?.cost_usd ?? 0) + addCost, tokens: Number(mine?.tokens ?? 0) + addTokens });
      // The answer's real cost comes off the credit (never below 0): one 'spend' row per student per day.
      if (paying && addCost > 0) await changeCredit(db, { key, institute, kind: "spend", usd: -addCost, day: w.day }).catch((e) => console.error(e instanceof Error ? e.message : e));
    },
  };
}
