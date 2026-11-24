// Live class hub, one session per batch, kept in this server's memory (like live polls and the quiz game).
// shortcut: needs a single `next start` server; move to Supabase Realtime with the backend.
import { act, startSession, viewOf, type Session } from "@/lib/live-class";
import { liveScope } from "@/lib/data-server";
import { jsonBody } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

const sessions = ((globalThis as { __classbariClasses?: Map<string, Session> }).__classbariClasses ??= new Map<string, Session>());
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const STAFF_ONLY = new Set(["lowerHand", "answered", "deleteChat", "board", "clearBoard"]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The session under this key ("<institute>:<batch>" with real accounts), unless it has run too long. */
const live = (key: string) => {
  const s = sessions.get(key);
  if (s && Date.now() - s.startedAt > MAX_AGE_MS) sessions.delete(key);
  return sessions.get(key);
};

/** ?batch=…&voter=…&board=<time of the board picture I already have> */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Only people of this batch get the session (it carries the secret video-room name).
  const scope = await liveScope(request, url.searchParams.get("batch") ?? "");
  const s = scope && live(scope.key);
  if (!s) return json({ live: false });
  const viewer = { voter: url.searchParams.get("voter") ?? undefined, staff: scope.staff };
  return json({ live: true, ...viewOf(s, viewer, Number(url.searchParams.get("board")) || 0, Date.now()) });
}

export async function POST(request: Request) {
  const b = await jsonBody(request);
  if (!b || typeof b.batch !== "string") return json({ error: "bad request" }, 400);
  const scope = await liveScope(request, b.batch);
  if (!scope) return json({ error: "not your class" }, 403);
  const staff = scope.staff;
  if (b.action === "start" || b.action === "end") {
    if (!staff) return json({ error: "teachers only" }, 403);
    if (b.action === "end") return json({ ok: sessions.delete(scope.key) });
    const s = startSession(b, Date.now());
    if ("error" in s) return json(s, 400);
    if (sessions.size >= 2000 && !sessions.has(scope.key)) for (const [k, x] of sessions) if (Date.now() - x.startedAt > MAX_AGE_MS) sessions.delete(k);
    if (sessions.size >= 2000 && !sessions.has(scope.key)) return json({ error: "too many" }, 429);
    sessions.set(scope.key, s);
    return json({ ok: true });
  }
  const over = limited(request, "class", 600, 60_000); // a whole class may share one Wi-Fi address
  if (over) return over;
  const s = live(scope.key);
  if (!s) return json({ error: "not live" }, 409);
  if (STAFF_ONLY.has(String(b.action)) && !staff) return json({ error: "teachers only" }, 403);
  const r = act(s, b, { voter: typeof b.voter === "string" ? b.voter : undefined, staff, own: scope.own }, Date.now());
  return json(r, "error" in r ? (r.error === "too fast" || r.error === "too many" ? 429 : 400) : 200);
}
