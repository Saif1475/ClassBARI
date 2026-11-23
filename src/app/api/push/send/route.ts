import webpush from "web-push";
import { pushTargets } from "@/lib/platform";
import { REAL_AUTH } from "@/lib/auth-mode";
import { STAFF_ROLES, whoIs } from "@/lib/data-server";
import { isStaffRequest, jsonBody, readPlatform, updatePlatform } from "@/lib/platform-server";

/** Teacher -> everyone subscribed to a batch. Body: { batch, title, body, url }. Free (unlike SMS). */
export async function POST(request: Request) {
  if (REAL_AUTH) return Response.json({ sent: 0, note: "sent by the server when the change is saved" }); // no double notification
  // Real accounts: a teacher reaches only their own institute's batches. Demo: the role cookie (the daily limit caps abuse).
  const me = REAL_AUTH ? await whoIs(request) : null;
  if (REAL_AUTH ? !me || !STAFF_ROLES.includes(me.who.role) : !(await isStaffRequest(request))) return Response.json({ error: "teachers only" }, { status: 403 });
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  if (!pub || !priv) return Response.json({ error: "not configured" }, { status: 404 });
  const b = await jsonBody(request);
  if (!b || typeof b.title !== "string" || typeof b.body !== "string") return Response.json({ error: "bad message" }, { status: 400 });
  const payload = JSON.stringify({
    title: b.title.slice(0, 80),
    body: b.body.slice(0, 200),
    url: typeof b.url === "string" && b.url.startsWith("/") && !b.url.startsWith("//") ? b.url : "/", // only links inside Instanton Campus
  });

  const batch = me && typeof b.batch === "string" ? `${me.institute}:${b.batch}` : b.batch;
  const targets = await updatePlatform((p) => pushTargets(p, batch, new Date()));
  if ("error" in targets) return Response.json(targets, { status: targets.error === "daily limit reached" ? 429 : 400 });
  webpush.setVapidDetails(process.env.NEXT_PUBLIC_SITE_URL || "mailto:support@classbari.app", pub, priv);
  const gone: string[] = [];
  const results = await Promise.allSettled(targets.map((s) => webpush.sendNotification(s, payload, { TTL: 86400 })));
  results.forEach((r, i) => {
    const code = r.status === "rejected" ? (r.reason as { statusCode?: number }).statusCode : 0;
    if (code === 404 || code === 410) gone.push(targets[i].endpoint); // the browser unsubscribed or was reset
  });
  if (gone.length) await updatePlatform((p) => void (p.push = p.push.filter((x) => !gone.includes(x.endpoint))));
  return Response.json({ sent: results.filter((r) => r.status === "fulfilled").length, of: targets.length, subscribers: (await readPlatform()).push.length });
}
