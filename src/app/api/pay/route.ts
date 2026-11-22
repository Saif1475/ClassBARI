import { REAL_AUTH } from "@/lib/auth-mode";
import { PACKS } from "@/lib/ai-chat";
import { admin, whoIs } from "@/lib/data-server";
import { checkPayment, payNumbers } from "@/lib/pay";
import { readPlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const planPrices = async () => {
  const { prices } = await readPlatform();
  return Object.fromEntries(Object.entries(prices).filter(([plan, price]) => plan !== "free" && price > 0));
};

/** Where to send money, the prices, and this person's own recent payments. Students buy AI packs; owners pay the plan. */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me?.who.email) return Response.json({ error: "sign in" }, { status: 401 });
  const { data } = await admin().from("payments").select("id, created_at, kind, item, months, amount, method, trx_id, status, reason").eq("payer_email", me.who.email).order("created_at", { ascending: false }).limit(10);
  return Response.json({ methods: payNumbers(), packs: PACKS, plans: me.who.role === "owner" ? await planPrices() : {}, mine: data ?? [] });
}

/** "I sent the money": { kind, item, months, method, sender, trxId } (+ studentId for a guardian paying for a child). */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me?.who.email) return Response.json({ error: "sign in" }, { status: 401 });
  const over = limited(request, "pay", 10, 3600_000, me.who.email); // a person sends a few, not many
  if (over) return over;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const p = checkPayment(body, await planPrices());
  if ("error" in p) return Response.json(p, { status: 400 });
  if (!payNumbers().some((n) => n.method === p.method)) return Response.json({ error: "method off" }, { status: 400 });
  // Who it is for: a student their own pack, a guardian one of their children's, an owner the institute's plan.
  let studentId: number | null = null;
  if (p.kind === "ai_pack") {
    if (me.who.role === "student") studentId = me.who.studentIds[0] ?? null;
    else if (me.who.role === "guardian" && me.who.studentIds.includes(Number(body.studentId))) studentId = Number(body.studentId);
    if (studentId === null) return Response.json({ error: "not allowed" }, { status: 403 });
  } else if (me.who.role !== "owner") return Response.json({ error: "not allowed" }, { status: 403 });
  const { data, error } = await admin()
    .from("payments")
    .insert({ institute_id: me.institute, payer_email: me.who.email, payer_role: me.who.role, kind: p.kind, item: p.item, student_id: studentId, months: p.months, amount: p.amount, method: p.method, sender: p.sender, trx_id: p.trxId })
    .select("id, created_at, kind, item, months, amount, method, trx_id, status")
    .single();
  if (error) return Response.json({ error: error.code === "23505" ? "used" : "try again" }, { status: error.code === "23505" ? 409 : 503 }); // 23505: that TrxID was sent before
  return Response.json(data);
}
