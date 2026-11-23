// Server only: students' extra AI credit (migration 0016). Every change goes through the database function
// ai_credit_change, which updates the balance and writes the log together. Credit never expires, so no daily job.
import { creditTaka, type AiSettings } from "./ai-chat.ts";

type Db = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>; from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type CreditKind = "purchase" | "spend" | "admin_add" | "admin_remove" | "refund";

/** The one way to change a balance (see 0016). Throws if the database refuses. */
export async function changeCredit(db: Db, c: { key: string; institute: string; kind: CreditKind; usd: number; taka?: number; payId?: string; note?: string; by?: string; day?: string }) {
  const { data, error } = await db.rpc("ai_credit_change", { p_key: c.key, p_institute: c.institute, p_kind: c.kind, p_usd: c.usd, p_taka: c.taka ?? null, p_pay: c.payId ?? null, p_note: c.note ?? null, p_by: c.by ?? "system", p_day: c.day ?? null });
  if (error) throw new Error(`ai credit: ${error.message}`);
  const r = data as { balance: number; usd: number; taka: number | null };
  return { balance: Number(r.balance), usd: Number(r.usd), taka: r.taka === null ? null : Number(r.taka) };
}

/** A student's balance in US$ (0 without a row, or on a database without 0016). */
export async function creditOf(db: Db, key: string) {
  const { data } = await db.from("ai_credit").select("usd").eq("user_key", key).maybeSingle();
  return Number(data?.usd ?? 0);
}

/** One student's own credit history, newest first, in ৳ (only the rows of this key). */
export async function creditHistory(db: Db, key: string, s: AiSettings, limit = 30) {
  const { data } = await db.from("ai_credit_log").select("at, kind, usd, taka").eq("user_key", key).order("at", { ascending: false }).limit(limit);
  return ((data ?? []) as { at: string; kind: CreditKind; usd: number; taka: number | null }[]).map((r) => ({
    at: r.at,
    kind: r.kind,
    // Purchases and refunds show the money paid or given back; the rest the credit's worth.
    taka: Math.sign(Number(r.usd)) * (r.taka !== null && (r.kind === "purchase" || r.kind === "refund") ? Number(r.taka) : Math.abs(creditTaka(Number(r.usd), s))),
  }));
}
