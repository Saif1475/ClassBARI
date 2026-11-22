import { REAL_AUTH } from "@/lib/auth-mode";
import { runTimed } from "@/lib/notify-server";

export const dynamic = "force-dynamic";

/**
 * The timed notifications (absences after 15 minutes, homework due tomorrow, AI pack ending, the month's fee).
 * The website runs this itself every 5 minutes (instrumentation.ts); a host's scheduler may also call it with
 * the header "x-cron-secret: <CRON_SECRET>". Each notification is sent once however often this runs.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!REAL_AUTH || !secret || request.headers.get("x-cron-secret") !== secret) return Response.json({ error: "not allowed" }, { status: 403 });
  return Response.json({ sent: await runTimed() });
}
