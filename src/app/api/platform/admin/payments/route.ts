import { REAL_AUTH } from "@/lib/auth-mode";
import { creditUsd } from "@/lib/ai-chat";
import { changeCredit } from "@/lib/ai-credit";
import { act, admin, loadDoc } from "@/lib/data-server";
import { send } from "@/lib/notify-server";
import { packClash, packUntil } from "@/lib/pay";
import { isAdmin, readPlatform, updatePlatform } from "@/lib/platform-server";
import type { Plan } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** Instanton Campus team: payments waiting to be checked first, then the latest ones. */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const db = admin();
  const [{ data: waiting }, { data: done }, { data: insts }] = await Promise.all([
    db.from("pay_requests").select("*").eq("status", "pending").order("created_at"),
    db.from("pay_requests").select("*").neq("status", "pending").order("decided_at", { ascending: false }).limit(50),
    db.from("institutes").select("id, name, code"),
  ]);
  const name = Object.fromEntries((insts ?? []).map((i) => [i.id, `${i.name} (${i.code})`]));
  return Response.json({ payments: [...(waiting ?? []), ...(done ?? [])].map((p) => ({ ...p, institute: name[p.institute_id] ?? p.institute_id })) });
}

/**
 * Approve or reject after checking the TrxID in the bKash or Nagad app: { id, approve, reason }. Approving an AI pack
 * switches it on (or adds the months to the one running; a different pack while one runs is refused and stays waiting,
 * see packClash); approving extra AI credit adds it to the student's balance
 * (taka x (1 - margin) / dollar rate, once per payment); approving a plan makes the institute active on that plan.
 * The payer is told either way.
 */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { id?: unknown; approve?: unknown; reason?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.approve !== "boolean") return Response.json({ error: "bad request" }, { status: 400 });
  const db = admin();
  // Claimed in one step: two people pressing at once can't both approve it.
  const { data: p } = await db
    .from("pay_requests")
    .update({ status: body.approve ? "approved" : "rejected", reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : null, decided_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!p) return Response.json({ error: "already decided" }, { status: 409 });

  const system = { institute: p.institute_id as string, who: { role: "owner" as const, name: "Instanton Campus", studentIds: [] } };
  let until = "";
  let clash = null as ReturnType<typeof packClash>;
  if (body.approve && p.kind === "ai_pack") {
    const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    try {
      await act(system, "setStudentPremium", [], Date.now(), (s) => {
        const st = s.students.find((x) => x.id === p.student_id);
        clash = packClash(st, today, Number(p.item)); // a different pack is still running: its paid months must keep their level
        if (!st || clash) return ((until = ""), null); // asked again on a retry: nothing from the try before is kept
        until = packUntil(st.premiumUntil, today, p.months);
        return [st.id, until, Number(p.item)];
      });
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      await db.from("pay_requests").update({ status: "pending", decided_at: null }).eq("id", p.id); // the pack was not saved: back in the queue
      return Response.json({ error: "pack failed, try again" }, { status: 503 });
    }
    if (!until) {
      await db.from("pay_requests").update({ status: "pending", decided_at: null }).eq("id", p.id); // nothing changed: back in the queue
      if (clash) return Response.json({ error: `Not approved: this student's ৳${clash.pack} pack runs until ${clash.until}, and a different pack on top would change the level of months already paid. It is still waiting: reject it with a reason and send the money back, or approve it on ${clash.until} or later.` }, { status: 409 });
      return Response.json({ error: "student not found" }, { status: 404 });
    }
  }
  if (body.approve && p.kind === "ai_credit") {
    const ai = (await readPlatform()).ai;
    try {
      const r = await changeCredit(db, { key: `${p.institute_id}:student:${p.student_id}`, institute: p.institute_id, kind: "purchase", usd: creditUsd(p.amount, ai), taka: p.amount, payId: p.id, by: "admin" });
      await updatePlatform((pl) => void pl.audit.unshift({ at: new Date().toISOString(), action: "AI credit", detail: `purchase ${p.payer_email} ৳${p.amount} = US$${r.usd} (balance US$${r.balance}) ${p.method} ${p.trx_id}` }));
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      await db.from("pay_requests").update({ status: "pending", decided_at: null }).eq("id", p.id); // nothing changed: back in the queue
      return Response.json({ error: "credit failed" }, { status: 503 });
    }
  }
  if (body.approve && p.kind === "plan")
    await updatePlatform((pl) => {
      const inst = pl.institutes.find((i) => i.email.toLowerCase() === String(p.payer_email).toLowerCase());
      if (inst) Object.assign(inst, { plan: p.item as Plan, status: "active" });
      // The subscription shown in the admin panel's Subscriptions tab: paid months added on from today or the date it already runs to.
      const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
      pl.subs = { ...pl.subs, [p.institute_id]: { plan: p.item as Plan, paidUntil: packUntil(pl.subs[p.institute_id]?.paidUntil, today, p.months) } };
      pl.audit.unshift({ at: new Date().toISOString(), action: "plan paid", detail: `${p.payer_email} ${p.item} ×${p.months} ৳${p.amount} ${p.method} ${p.trx_id}` });
    });

  // Tell the payer: the student (and their guardians) for a pack, the owner for a plan.
  const state = (await loadDoc(p.institute_id)).state;
  const what = p.kind === "ai_pack" ? `AI ৳${p.item}` : p.kind === "ai_credit" ? `AI credit ৳${p.amount}` : String(p.item);
  const text: [string, ...(string | number)[]] = body.approve ? ["payApproved", what, until] : ["payRejected", what, String(p.reason ?? "")];
  if (p.kind === "ai_pack" || p.kind === "ai_credit") {
    await send(p.institute_id, { to: { students: [p.student_id] }, group: "ai", text, screen: "home" }, state);
    await send(p.institute_id, { to: { guardians: [p.student_id] }, group: "fees", text, screen: "home" }, state);
  } else await send(p.institute_id, { to: { owners: true }, group: "work", text, screen: "home" }, state);
  return Response.json({ ok: true, status: p.status, until });
}
