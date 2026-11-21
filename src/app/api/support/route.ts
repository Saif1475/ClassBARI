import { randomUUID } from "node:crypto";
import { addTicket } from "@/lib/platform";
import { jsonBody, updatePlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

/** Public "Help & support" form. */
export async function POST(request: Request) {
  const over = limited(request, "support", 8, 3600_000);
  if (over) return over;
  const body = await jsonBody(request);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const res = await updatePlatform((p) => addTicket(p, body, randomUUID(), new Date()));
  if ("error" in res) return Response.json(res, { status: 400 });
  return Response.json({ ok: true });
}
