// Coaching-centre rules with no UI: timetable clashes, monthly profit & loss, coupon prices.
// Pure functions (also loaded by scripts/centre.test.mjs).
import { dayKey, toDate } from "./dates.ts";

export type Slot = { id: number; day: number; start: string; end: string; batch: string; teacher: string; room: string }; // day 0 = Sunday, times "HH:MM"
export type Expense = { id: number; date: string; category: string; amount: number; note: string };
export type Coupon = { code: string; percent: number; batchId?: string; maxUses: number; used: number; expires?: string };

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Slots that overlap in time on the same day AND share a teacher, room or batch. With `mine`, only pairs where at least one slot is in those batches (a colleague's slot still counts against yours). */
export function clashes(slots: Slot[], mine?: string[]) {
  const out: { a: Slot; b: Slot; why: ("teacher" | "room" | "batch")[] }[] = [];
  slots.forEach((a, i) =>
    slots.slice(i + 1).forEach((b) => {
      if (a.day !== b.day || mins(a.start) >= mins(b.end) || mins(b.start) >= mins(a.end)) return;
      if (mine && !mine.includes(a.batch) && !mine.includes(b.batch)) return;
      const why = (["teacher", "room", "batch"] as const).filter((k) => a[k] && a[k].trim().toLowerCase() === b[k].trim().toLowerCase());
      if (why.length) out.push({ a, b, why: [...why] });
    }),
  );
  return out;
}

/** One month (YYYY-MM): fees collected, staff paid, other expenses and what's left. */
export function profitAndLoss(month: string, payments: { amount: number; at: string }[], staffPayments: { month: string; amount: number }[], expenses: Expense[]) {
  const income = payments.filter((p) => dayKey(toDate(p.at)).startsWith(month)).reduce((s, p) => s + p.amount, 0); // p.at is a UTC time: count it in its local month, as payroll and invoices do (expense dates are local days already)
  const salaries = staffPayments.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const e of expenses.filter((e) => e.date.startsWith(month))) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  const other = Object.values(byCategory).reduce((s, n) => s + n, 0);
  return { income, salaries, byCategory, expenses: salaries + other, profit: income - salaries - other };
}

/** Price after a coupon, or why the coupon can't be used. */
export function applyCoupon(price: number, code: string, coupons: Coupon[], batchId: string, today: string, orders: { status: string; coupon?: string }[] = []): { price: number; coupon: Coupon } | { error: "unknown" | "otherCourse" | "expired" | "usedUp" } {
  const c = coupons.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!c) return { error: "unknown" };
  if (c.batchId && c.batchId !== batchId) return { error: "otherCourse" };
  if (c.expires && c.expires < today) return { error: "expired" };
  // used only goes up when an order is confirmed, so orders still waiting with this code count too
  if (c.used + orders.filter((o) => o.status === "pending" && o.coupon === c.code).length >= c.maxUses) return { error: "usedUp" };
  return { price: Math.max(0, Math.round(price * (1 - c.percent / 100))), coupon: c };
}

/** What an order costs: the full fee with no code, the coupon price, or the coupon's refusal — never full price for a refused code (the buyer paid what the preview said). */
export function orderPrice(fee: number, code: string, coupons: Coupon[], batchId: string, today: string, orders: { status: string; coupon?: string }[]): { price: number; coupon?: string } | { error: "unknown" | "otherCourse" | "expired" | "usedUp" } {
  if (!code) return { price: fee };
  const r = applyCoupon(fee, code, coupons, batchId, today, orders);
  return "error" in r ? r : { price: r.price, coupon: r.coupon.code };
}
