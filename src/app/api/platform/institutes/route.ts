import { randomUUID } from "node:crypto";
import { registerInstitute } from "@/lib/platform";
import { jsonBody, updatePlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

/** A teacher or institute signed up: list them in the admin panel (30-day free trial). */
export async function POST(request: Request) {
  const over = limited(request, "signup-list", 8, 3600_000);
  if (over) return over;
  const body = await jsonBody(request);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const res = await updatePlatform((p) => registerInstitute(p, body, randomUUID(), new Date()));
  if ("error" in res) return Response.json(res, { status: res.error === "signups closed" ? 403 : 400 });
  return Response.json({ ok: true });
}
