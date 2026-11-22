import { REAL_AUTH } from "@/lib/auth-mode";
import { loadPart, STAFF_ROLES, whoIs } from "@/lib/data-server";
import { forgetDevice, saveDevice } from "@/lib/notify-server";
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
    // Real accounts: kept in the database for this person (staff too); the server decides who hears what.
    const me = await whoIs(request);
    const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
    if (!me) return Response.json({ error: "sign in" }, { status: 401 });
    if (typeof sub?.endpoint !== "string" || !sub.endpoint.startsWith("https://") || typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string")
      return Response.json({ error: "bad subscription" }, { status: 400 });
    const saved = await saveDevice(me.institute, me.who, { kind: "web", token: sub.endpoint, sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, lang: body.lang });
    return saved ? Response.json({ ok: true }) : Response.json({ error: "try again" }, { status: 503 });
  }
  const res = await updatePlatform((p) => addPushSub(p, body, new Date()));
  return Response.json(res, { status: "error" in res ? 400 : 200 });
}

/** Turn off: forget this browser. Body: { endpoint } */
export async function DELETE(request: Request) {
  const body = await jsonBody(request);
  if (typeof body?.endpoint !== "string") return Response.json({ error: "bad endpoint" }, { status: 400 });
  if (REAL_AUTH) {
    const me = await whoIs(request);
    if (me?.who.email) await forgetDevice(body.endpoint, me.who.email);
    return Response.json({ ok: true });
  }
  await updatePlatform((p) => void (p.push = p.push.filter((x) => x.endpoint !== body.endpoint)));
  return Response.json({ ok: true });
}
