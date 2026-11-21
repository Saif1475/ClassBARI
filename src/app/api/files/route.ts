import { REAL_AUTH } from "@/lib/auth-mode";
import { STAFF_ROLES, uploadSlot, whoIs } from "@/lib/data-server";
import { limited } from "@/lib/rate-limit";

/** A signed-in person asks for a slot to upload one file (video, PDF) straight to storage. */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  // Teachers upload lesson videos and PDFs this way. Students' homework photos go through /api/data, which checks them.
  if (!me || !STAFF_ROLES.includes(me.who.role)) return Response.json({ error: "teachers only" }, { status: me ? 403 : 401 });
  const over = limited(request, "upload", 120, 3600_000, me.institute); // shortcut: 120 uploads an hour per institute; storage limits per plan come with billing
  if (over) return over;
  try {
    return Response.json(await uploadSlot(me.institute));
  } catch (e) {
    console.error("files:", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 503 });
  }
}
