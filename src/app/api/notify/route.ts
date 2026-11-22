import { REAL_AUTH } from "@/lib/auth-mode";
import { whoIs } from "@/lib/data-server";
import { GROUPS_FOR } from "@/lib/notify";
import { getOff, setOff } from "@/lib/notify-server";

export const dynamic = "force-dynamic";

/** This person's notification switches: the groups they can get, and the ones they turned off. */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me?.who.email) return Response.json({ error: "sign in" }, { status: 401 });
  return Response.json({ groups: GROUPS_FOR[me.who.role] ?? [], off: await getOff(me.institute, me.who.email) });
}

/** Change the switches: { off: ["fees", …] } (the same on every device of theirs). */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me?.who.email) return Response.json({ error: "sign in" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { off?: unknown } | null;
  const { error } = await setOff(me.institute, me.who.email, body?.off);
  return error ? Response.json({ error: "try again" }, { status: 503 }) : Response.json({ ok: true });
}
