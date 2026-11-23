// Paying ClassBARI by bKash or Nagad "Send Money" with the transaction ID. Plain logic only (tested in
// scripts/pay.test.mjs); the API routes save, the admin page approves.
import { CREDIT_MAX, CREDIT_MIN, PACKS } from "./ai-chat.ts";
import { isBdMobile } from "./site.ts";

export type PayMethod = "bkash" | "nagad";
export type PayKind = "ai_pack" | "plan" | "ai_credit";
export const MONTHS = [1, 3, 6, 12] as const;

/** The numbers that receive payments (PAY_BKASH_NUMBER / PAY_NAGAD_NUMBER in .env.local); a method without one is not offered. */
export const payNumbers = (env: Record<string, string | undefined> = process.env) =>
  (["bkash", "nagad"] as const).flatMap((m) => {
    const n = env[`PAY_${m.toUpperCase()}_NUMBER`]?.trim();
    return n && isBdMobile(n) ? [{ method: m, number: n }] : [];
  });

/**
 * A payment as typed, checked: the price comes from our own list (never from the payer), the TrxID is 8–12 letters
 * and digits, the sender a Bangladeshi mobile number. Extra AI credit (ai_credit): the item is the amount the
 * student chose, whole taka from ৳50 to ৳5,000, bought once (months is always 1).
 */
export function checkPayment(input: Record<string, unknown>, planPrices: Record<string, number>) {
  const kind = input.kind;
  const months = kind === "ai_credit" ? 1 : Number(input.months);
  const method = input.method;
  const sender = String(input.sender ?? "").replace(/[\s-]/g, "");
  const trxId = String(input.trxId ?? "").trim().toUpperCase();
  if (kind !== "ai_pack" && kind !== "plan" && kind !== "ai_credit") return { error: "bad kind" } as const;
  if (method !== "bkash" && method !== "nagad") return { error: "bad method" } as const;
  if (!MONTHS.includes(months as (typeof MONTHS)[number])) return { error: "bad months" } as const;
  if (!isBdMobile(sender)) return { error: "bad sender" } as const;
  if (!/^[A-Z0-9]{8,12}$/.test(trxId)) return { error: "bad trx" } as const;
  const item = String(input.item ?? "");
  // Exactly a pack's price ("150", not "0x96" or "1.5e2"); a plan by its own name only (never "constructor" and the like).
  const credit = /^\d+$/.test(item) ? Number(item) : 0;
  if (kind === "ai_credit") return credit >= CREDIT_MIN && credit <= CREDIT_MAX ? ({ kind, item: String(credit), months, amount: credit, method, sender, trxId } as const) : ({ error: "bad item" } as const);
  const monthly = kind === "ai_pack" ? (/^\d+$/.test(item) && (PACKS as readonly number[]).includes(Number(item)) ? Number(item) : 0) : Object.hasOwn(planPrices, item) ? planPrices[item] : 0;
  if (!monthly) return { error: "bad item" } as const;
  return { kind, item, months, amount: monthly * months, method, sender, trxId } as const;
}

/** The new last day of an AI pack: from today, or from the day it already runs to if that is later. */
export function packUntil(current: string | undefined, today: string, months: number) {
  const from = current && current > today ? current : today;
  const d = new Date(`${from}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 January + 1 month is the last day of February, not 3 March.
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
}
