import { REAL_AUTH } from "@/lib/auth-mode";
import { admin } from "@/lib/data-server";

export const dynamic = "force-dynamic";
const OCR_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000";

/**
 * For an uptime checker (UptimeRobot and the like): 200 when the site and its database answer, 503 when not.
 * `helper` is the Python service (handwriting, saved AI answers); the site works without it, so it doesn't fail the check.
 */
export async function GET() {
  const database = !REAL_AUTH || !(await admin().from("institutes").select("id", { head: true, count: "exact" }).limit(1)).error;
  const helper = await fetch(`${OCR_URL}/health`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
  return Response.json({ ok: database, database, helper, time: new Date().toISOString() }, { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
