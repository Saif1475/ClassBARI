import { REAL_AUTH } from "@/lib/auth-mode";
import { whoIs } from "@/lib/data-server";
import { forgetDevice, saveDevice } from "@/lib/notify-server";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** A phone app registers its Firebase token at login: { token, lang }. (Browsers use /api/push.) */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const over = limited(request, "notify-device", 60, 3600_000);
  if (over) return over;
  const me = await whoIs(request);
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { token?: unknown; lang?: unknown } | null;
  if (typeof body?.token !== "string" || body.token.length < 20 || body.token.length > 4096) return Response.json({ error: "bad token" }, { status: 400 });
  const saved = await saveDevice(me.institute, me.who, { kind: "fcm", token: body.token, lang: body.lang });
  return saved ? Response.json({ ok: true }) : Response.json({ error: "try again" }, { status: 503 }); // the phone tries again next time
}

/** Logging out: this phone gets nothing more. { token } */
export async function DELETE(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (!me?.who.email || typeof body?.token !== "string") return Response.json({ error: "bad request" }, { status: 400 });
  await forgetDevice(body.token, me.who.email);
  return Response.json({ ok: true });
}
