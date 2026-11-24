import { REAL_AUTH } from "@/lib/auth-mode";
import { CREDIT_MAX, CREDIT_MIN, PACKS } from "@/lib/ai-chat";
import { admin, loadPart, whoIs } from "@/lib/data-server";
import { checkPayment, packClash, payNumbers } from "@/lib/pay";
import { readPlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const planPrices = async () => {
  const { prices } = await readPlatform();
  return Object.fromEntries(Object.entries(prices).filter(([plan, price]) => plan !== "free" && price > 0));
};

/** The pack this student still has running that is not `item` (packClash): no other level can be bought on top of it. Dhaka day, as at approval. */
const clashFor = async (institute: string, studentId: number, item?: number) =>
  packClash((await loadPart(institute, "students")).students.find((s) => s.id === studentId), new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10), item);

/** Where to send money, the prices, this person's own recent payments, and a student's running pack (told before paying). Students buy AI packs; owners pay the plan. */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me?.who.email) return Response.json({ error: "sign in" }, { status: 401 });
  const { data } = await admin().from("pay_requests").select("id, created_at, kind, item, months, amount, method, trx_id, status, reason").eq("payer_email", me.who.email).order("created_at", { ascending: false }).limit(10);
  const running = me.who.role === "student" && me.who.studentIds[0] !== undefined ? await clashFor(me.institute, me.who.studentIds[0]) : null;
  return Response.json({ methods: payNumbers(), packs: PACKS, credit: { min: CREDIT_MIN, max: CREDIT_MAX }, plans: me.who.role === "owner" ? await planPrices() : {}, mine: data ?? [], running });
}

/** "I sent the money": { kind, item, months, method, sender, trxId } (+ studentId for a guardian paying for a child). ai_credit: item is the ৳ amount. */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me?.who.email) return Response.json({ error: "sign in" }, { status: 401 });
  const over = limited(request, "pay", 10, 3600_000, me.who.email); // a person sends a few, not many
  if (over) return over;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if ((body.kind === "plan" && me.who.role !== "owner") || (body.kind === "ai_credit" && me.who.role !== "student")) return Response.json({ error: "not allowed" }, { status: 403 }); // who may pay what, before anything else
  const p = checkPayment(body, await planPrices());
  if ("error" in p) return Response.json(p, { status: 400 });
  if (!payNumbers().some((n) => n.method === p.method)) return Response.json({ error: "method off" }, { status: 400 });
  // Who it is for: a student their own pack, a guardian one of their children's, an owner the institute's plan.
  let studentId: number | null = null;
  let clash = null as Awaited<ReturnType<typeof clashFor>>;
  if (p.kind === "ai_credit") studentId = me.who.studentIds[0] ?? null; // a student's own extra credit
  if (p.kind === "ai_credit" && studentId === null) return Response.json({ error: "not allowed" }, { status: 403 });
  if (p.kind === "ai_pack") {
    if (me.who.role === "student") studentId = me.who.studentIds[0] ?? null;
    else if (me.who.role === "guardian" && me.who.studentIds.includes(Number(body.studentId))) studentId = Number(body.studentId);
    if (studentId === null) return Response.json({ error: "not allowed" }, { status: 403 });
    clash = await clashFor(me.institute, studentId, Number(p.item)); // the money is already sent, so it is still recorded (approval refuses the clash and keeps it waiting); the payer is told
  }
  const { data, error } = await admin()
    .from("pay_requests")
    .insert({ institute_id: me.institute, payer_email: me.who.email, payer_role: me.who.role, kind: p.kind, item: p.item, student_id: studentId, months: p.months, amount: p.amount, method: p.method, sender: p.sender, trx_id: p.trxId })
    .select("id, created_at, kind, item, months, amount, method, trx_id, status")
    .single();
  if (error) return Response.json({ error: error.code === "23505" ? "used" : "try again" }, { status: error.code === "23505" ? 409 : 503 }); // 23505: that TrxID was sent before
  return Response.json(clash ? { ...data, clash } : data);
}
