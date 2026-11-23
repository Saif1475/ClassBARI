import { aiWindow, creditTaka, creditUsd } from "@/lib/ai-chat";
import { changeCredit } from "@/lib/ai-credit";
import { every, institutesWithStudents } from "@/lib/admin-server";
import { REAL_AUTH } from "@/lib/auth-mode";
import { admin } from "@/lib/data-server";
import { isAdmin, jsonBody, readPlatform, updatePlatform } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

const KEY = /^([0-9a-f-]{36}):student:(\d+)$/;

/**
 * Instanton Campus admin, extra AI credit: ?key=<user key> gives that student's whole history from the log; otherwise this
 * month's totals and every balance (matching ?q=: name, email, institute name or code), largest first.
 */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const db = admin();
  const url = new URL(request.url);
  const ai = (await readPlatform()).ai;
  const key = url.searchParams.get("key") ?? "";
  if (key) {
    if (!KEY.test(key)) return Response.json({ error: "bad key" }, { status: 400 });
    const { data } = await db.from("ai_credit_log").select("id, at, kind, usd, taka, pay_request_id, note, by, day").eq("user_key", key).order("at", { ascending: false }).limit(200);
    const rows = data ?? [];
    const refunded = new Set(rows.filter((r) => r.kind === "refund").map((r) => r.pay_request_id));
    return Response.json({ history: rows.map((r) => ({ ...r, usd: Number(r.usd), worthTk: creditTaka(Number(r.usd), ai), refundable: r.kind === "purchase" && !!r.pay_request_id && !refunded.has(r.pay_request_id) })) });
  }
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const [{ data: totals }, balances, all] = await Promise.all([
    db.rpc("ai_credit_totals", { since: `${aiWindow().day.slice(0, 7)}-01T00:00:00+06:00` }),
    every<{ user_key: string; institute_id: string; usd: number; updated_at: string }>((a, b) => db.from("ai_credit").select("user_key, institute_id, usd, updated_at").order("user_key").range(a, b)),
    institutesWithStudents(),
  ]);
  const insts = new Map(all.map((i) => [i.id, i]));
  const list = balances
    .map((b) => {
      const [, inst, id] = b.user_key.match(KEY) ?? [];
      const i = insts.get(inst);
      const s = i?.students.find((x) => x.id === Number(id));
      return { key: b.user_key, institute: inst, instituteName: i?.name ?? "", code: i?.code ?? "", id: Number(id), name: s?.name ?? "", email: s?.email ?? "", usd: Number(b.usd), taka: creditTaka(Number(b.usd), ai), updatedAt: b.updated_at };
    })
    .filter((b) => !q || `${b.name} ${b.email} ${b.instituteName} ${b.code}`.toLowerCase().includes(q))
    .sort((a, b) => b.usd - a.usd);
  return Response.json({ totals, total: list.length, balances: list.slice(0, 200) });
}

/**
 * { action: "add" | "remove", institute, id, taka, reason }: credit by hand (reason required).
 * { action: "refund", payId }: give back an approved credit purchase: takes back at most what is left of it, once;
 *   the admin returns the money by bKash/Nagad by hand.
 * { action: "check" }: balances that differ from the sum of their log (reports only).
 */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const b = await jsonBody(request);
  const db = admin();
  const ai = (await readPlatform()).ai;
  const log = (detail: string) => updatePlatform((p) => void (p.audit.unshift({ at: new Date().toISOString(), action: "AI credit", detail }), (p.audit.length = Math.min(p.audit.length, 500))));

  if (b?.action === "check") {
    const { data, error } = await db.rpc("ai_credit_check");
    if (error) return Response.json({ error: "check failed" }, { status: 503 });
    const mismatches = (data ?? []) as { user_key: string; balance: number; logged: number }[];
    await log(`check: ${mismatches.length ? `${mismatches.length} mismatch(es): ${mismatches.slice(0, 5).map((m) => `${m.user_key} US$${m.balance} vs log US$${m.logged}`).join("; ")}` : "all balances match their log"}`);
    return Response.json({ mismatches });
  }

  if (b?.action === "refund") {
    if (typeof b.payId !== "string" || !/^[0-9a-f-]{36}$/.test(b.payId)) return Response.json({ error: "bad request" }, { status: 400 });
    // Claimed in one step: a purchase is refunded once.
    const { data: p } = await db.from("pay_requests").update({ status: "refunded" }).eq("id", b.payId).eq("kind", "ai_credit").eq("status", "approved").select("*").maybeSingle();
    if (!p) return Response.json({ error: "not refundable" }, { status: 409 });
    try {
      const r = await changeCredit(db, { key: `${p.institute_id}:student:${p.student_id}`, institute: p.institute_id, kind: "refund", usd: 0, payId: p.id, note: typeof b.reason === "string" ? b.reason.slice(0, 200) : undefined, by: "admin" });
      await log(`refund ${p.payer_email} ${p.method} ${p.trx_id}: give back ৳${r.taka} of ৳${p.amount} by hand (credit US$${-r.usd} taken back, balance US$${r.balance})`);
      return Response.json({ ok: true, taka: r.taka, balance: r.balance });
    } catch (e) {
      await db.from("pay_requests").update({ status: "approved" }).eq("id", p.id); // nothing changed
      return Response.json({ error: e instanceof Error && /already refunded/.test(e.message) ? "already refunded" : "refund failed" }, { status: 409 });
    }
  }

  if (b?.action === "add" || b?.action === "remove") {
    const institute = typeof b.institute === "string" && /^[0-9a-f-]{36}$/.test(b.institute) ? b.institute : "";
    const id = Number(b.id);
    const taka = Number(b.taka);
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 200) : "";
    if (!institute || !Number.isSafeInteger(id) || !Number.isInteger(taka) || taka <= 0 || taka > 100_000 || reason.length < 3) return Response.json({ error: "Give a whole ৳ amount and a reason" }, { status: 400 });
    const usd = creditUsd(taka, ai) * (b.action === "add" ? 1 : -1);
    try {
      const r = await changeCredit(db, { key: `${institute}:student:${id}`, institute, kind: b.action === "add" ? "admin_add" : "admin_remove", usd, taka, note: reason, by: "admin" });
      await log(`${b.action} ৳${taka} (US$${r.usd}) for ${institute} student #${id}: ${reason} (balance US$${r.balance})`);
      return Response.json({ ok: true, balance: r.balance, taka: creditTaka(r.balance, ai) });
    } catch {
      return Response.json({ error: "credit failed" }, { status: 503 });
    }
  }
  return Response.json({ error: "bad request" }, { status: 400 });
}
