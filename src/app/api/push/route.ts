import { REAL_AUTH } from "@/lib/auth-mode";
import { loadPart, STAFF_ROLES, whoIs } from "@/lib/data-server";
import { addPushSub } from "@/lib/platform";
import { jsonBody, updatePlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

/** The public key browsers need to subscribe; 404 when push isn't set up (no VAPID keys). */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  return key ? Response.json({ publicKey: key }) : Response.json({ error: "not configured" }, { status: 404 });
}

/** A student's / guardian's browser turns notifications on. Body: { subscription, role, batches } */
export async function POST(request: Request) {
  const over = limited(request, "push-sub", 400, 3600_000);
  if (over) return over;
  const body = await jsonBody(request);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  if (REAL_AUTH) {
    // Real accounts: the server decides which batches this person hears from (their own, in their own institute),
    // whatever the browser asked for.
    const me = await whoIs(request);
    if (!me || STAFF_ROLES.includes(me.who.role)) return Response.json({ error: "sign in as a student or guardian" }, { status: 401 });
    const state = await loadPart(me.institute, "students");
    body.role = me.who.role === "guardian" ? "parent" : "student";
    body.batches = [...new Set(state.students.filter((s) => me.who.studentIds.includes(s.id)).map((s) => `${me.institute}:${s.batch}`))];
  }
  const res = await updatePlatform((p) => addPushSub(p, body, new Date()));
  return Response.json(res, { status: "error" in res ? 400 : 200 });
}

/** Turn off: forget this browser. Body: { endpoint } */
export async function DELETE(request: Request) {
  const body = await jsonBody(request);
  if (typeof body?.endpoint !== "string") return Response.json({ error: "bad endpoint" }, { status: 400 });
  await updatePlatform((p) => void (p.push = p.push.filter((x) => x.endpoint !== body.endpoint)));
  return Response.json({ ok: true });
}
