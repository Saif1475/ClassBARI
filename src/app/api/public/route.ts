import { REAL_AUTH } from "@/lib/auth-mode";
import { applyCoupon } from "@/lib/centre";
import { publicView } from "@/lib/data-access";
import { act, loadPart, publicDocs } from "@/lib/data-server";
import { dayKey } from "@/lib/dates";
import { limited } from "@/lib/rate-limit";
import { PLAN_STUDENT_LIMIT } from "@/lib/seat-billing";
import { isBdMobile, normEmail, validateStudent, type StudentContact } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Public pages: ?slug= (teacher website), ?batch= (course / join link), or nothing (all public courses). */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const p = new URL(request.url).searchParams;
  const slug = p.get("slug") ?? undefined;
  const batch = p.get("batch") ?? undefined;
  const over = limited(request, "public-read", 240, 60_000);
  if (over) return over;
  const docs = await publicDocs({ slug, batch });
  if (!slug && !batch) return Response.json({ batches: docs.flatMap((d) => d.state.batches.filter((b) => b.public)) });
  if (!docs[0]) return Response.json({});
  // An invite link shows its own batch (even a private one) and the public ones — never the institute's other private batches.
  const view = publicView(docs[0].state, false);
  return Response.json({ ...view, batches: view.batches?.filter((b) => b.public || b.id === batch) });
}

const text = (x: unknown, max: number) => (typeof x === "string" && x.trim().length > 0 && x.length <= max ? x.trim() : null);
function contact(x: unknown): StudentContact | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const c = { name: text(o.name, 80), email: text(o.email, 120), guardianName: text(o.guardianName, 80), guardianEmail: text(o.guardianEmail, 120), phone: text(o.phone, 20) };
  if (Object.values(c).some((v) => v === null)) return null;
  const studentPhone = text(o.studentPhone, 20) ?? undefined;
  return { ...(c as StudentContact), email: normEmail(c.email!), guardianEmail: normEmail(c.guardianEmail!), ...(studentPhone ? { studentPhone } : {}) };
}

/**
 * Someone joining from a public page: { kind: "join", batchId, student } adds them to the batch (their Gmail can then sign in);
 * { kind: "coupon", batchId, code } prices a coupon; { kind: "order", batchId, student, coupon?, trxId } records a bKash order.
 * shortcut: limited per visitor address; add a CAPTCHA (Cloudflare Turnstile) if join links still get spammed.
 */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  if (Number(request.headers.get("content-length")) > 20_000) return Response.json({ error: "too large" }, { status: 413 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // Coupon guesses, fake joins and fake orders. A whole classroom may join from one Wi-Fi address, so the limit per
  // address is roomy and each batch has its own.
  const over = body?.kind === "coupon" ? limited(request, "coupon", 30, 600_000) : (limited(request, "join", 80, 3600_000) ?? limited(request, "join-batch", 300, 3600_000, String(body?.batchId).slice(0, 200)));
  if (over) return over;
  const batchId = text(body?.batchId, 200);
  if (!body || !batchId) return Response.json({ error: "bad request" }, { status: 400 });
  const [doc] = await publicDocs({ batch: batchId });
  const batch = doc?.state.batches.find((b) => b.id === batchId);
  if (!doc || !batch) return Response.json({ error: "no such course" }, { status: 404 });
  const me = { institute: doc.institute, who: { role: "owner" as const, name: "", studentIds: [] } }; // acting for the institute, after the checks here

  if (body.kind === "coupon") {
    const r = applyCoupon(batch.fee, String(body.code ?? ""), (await loadPart(doc.institute, "coupons")).coupons, batchId, dayKey());
    return Response.json("error" in r ? { error: r.error } : { price: r.price, code: r.coupon.code });
  }

  const student = contact(body.student);
  if (!student || !isBdMobile(student.phone)) return Response.json({ error: "bad details" }, { status: 400 });

  if (body.kind === "join") {
    let refused = "";
    await act(me, "addStudent", [], Date.now(), (s) => {
      // A course sold online (public, with a bKash number) is joined by paying: see "order" below.
      if (batch.public && s.site.bkash) refused = "pay first";
      else if (s.students.length >= PLAN_STUDENT_LIMIT) refused = "full";
      else if (Object.keys(validateStudent(student, s.students)).length) refused = "not accepted";
      return refused ? null : [{ ...student, mode: "online", batch: batch.name, feePaid: false, pending: true }]; // waits for the institute to accept
    });
    // One answer for every refusal: this page must not tell strangers which Gmail addresses are enrolled here.
    return refused ? Response.json({ error: refused === "pay first" ? refused : "not accepted" }, { status: 409 }) : Response.json({ ok: true });
  }

  if (body.kind === "order") {
    const trxId = String(body.trxId ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(trxId)) return Response.json({ error: "bad trxId" }, { status: 400 });
    let ok = false;
    await act(me, "placeOrder", [], Date.now(), (s) => {
      if (!s.site.bkash || !batch.public) return null;
      if (s.orders.filter((o) => o.status === "pending").length >= 300 || s.orders.some((o) => o.trxId === trxId)) return null; // a pile of fake orders, or the same payment twice
      const code = typeof body.coupon === "string" ? body.coupon : "";
      const r = code ? applyCoupon(batch.fee, code, s.coupons, batchId, dayKey()) : null;
      ok = true;
      // The price is worked out here, never taken from the browser.
      return [{ batchId, student, price: r && !("error" in r) ? r.price : batch.fee, coupon: r && !("error" in r) ? r.coupon.code : undefined, trxId }];
    });
    return ok ? Response.json({ ok: true }) : Response.json({ error: "no bKash" }, { status: 400 });
  }
  return Response.json({ error: "bad request" }, { status: 400 });
}

