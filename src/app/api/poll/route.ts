// Live class polls, one per batch, kept in this server's memory.
// shortcut: like the live quiz game, needs a single `next start` server; move to Supabase Realtime with the backend.
import { randomUUID } from "node:crypto";
import { pollView, startPoll, vote, voterOf, type Poll } from "@/lib/live-poll";
import { liveScope } from "@/lib/data-server";
import { jsonBody } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";

const polls = ((globalThis as { __classbariPolls?: Map<string, Poll> }).__classbariPolls ??= new Map<string, Poll>());
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** ?batch=…&voter=… -> the batch's active poll (or null). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = await liveScope(request, url.searchParams.get("batch") ?? "");
  const p = scope && polls.get(scope.key);
  if (!p || Date.now() - p.at > MAX_AGE_MS) return Response.json({ poll: null });
  return Response.json({ poll: pollView(p, { staff: scope.staff, voter: voterOf(scope.person, url.searchParams.get("voter") ?? undefined) as string | undefined }) });
}

/** { action: "start", batch, question, options, correct } · { action: "end", batch } (staff) · { action: "vote", batch, pollId, voter, option } */
export async function POST(request: Request) {
  const b = await jsonBody(request);
  if (!b) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const scope = await liveScope(request, String(b.batch ?? ""));
  if (!scope) return Response.json({ error: "not your class" }, { status: 403 });
  if (b.action === "start" || b.action === "end") {
    if (!scope.staff) return Response.json({ error: "teachers only" }, { status: 403 });
    if (b.action === "end") return Response.json({ ok: polls.delete(scope.key) });
    const p = startPoll(b, randomUUID(), Date.now());
    if ("error" in p) return Response.json(p, { status: 400 });
    if (polls.size >= 2000 && !polls.has(scope.key)) for (const [k, x] of polls) if (Date.now() - x.at > MAX_AGE_MS) polls.delete(k);
    if (polls.size >= 2000 && !polls.has(scope.key)) return Response.json({ error: "too many" }, { status: 429 });
    polls.set(scope.key, p);
    return Response.json({ ok: true, id: p.id });
  }
  if (b.action === "vote") {
    const over = limited(request, "poll", 600, 60_000); // a whole class may share one Wi-Fi address
    if (over) return over;
    const p = polls.get(scope.key);
    if (!p) return Response.json({ error: "poll ended" }, { status: 409 });
    const r = vote(p, b.pollId, voterOf(scope.person, b.voter), b.option);
    return Response.json(r, { status: "error" in r ? 409 : 200 });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
