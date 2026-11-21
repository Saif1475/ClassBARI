import { recentErrors } from "@/lib/alerts";
import { adminAction, overview } from "@/lib/platform";
import { smsLive } from "@/lib/sms-server";
import { isAdmin, jsonBody, readPlatform, updatePlatform } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const p = await readPlatform();
  return Response.json({ ...p, overview: overview(p), smsLive: smsLive(), errors: await recentErrors(50), alertsOn: !!process.env.ALERT_WEBHOOK_URL });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await jsonBody(request);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const res = await updatePlatform((p) => adminAction(p, body, new Date()));
  return Response.json(res, { status: "error" in res ? 400 : 200 });
}
