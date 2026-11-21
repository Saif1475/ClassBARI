// Live quiz game server. Games live in this server's memory.
// shortcut: works with one `next start` server (fine for a classroom pilot); restarts lose games and
// serverless hosts don't share memory. Move to Supabase Realtime with the backend.
import { randomBytes, randomInt } from "node:crypto";
import { REAL_AUTH } from "@/lib/auth-mode";
import { STAFF_ROLES, whoIs } from "@/lib/data-server";
import { readPlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";
import { answer, createGame, hostAction, join, view, type Game, type GameQuestion } from "@/lib/live-game";

const store = ((globalThis as { __edunestGames?: Map<string, Game> }).__edunestGames ??= new Map<string, Game>());
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

function validQuestions(v: unknown): GameQuestion[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 50) return null;
  const out: GameQuestion[] = [];
  for (const x of v) {
    const q = str(x?.q, 300);
    const options = Array.isArray(x?.options) ? x.options.map((o: unknown) => str(o, 120)) : [];
    if (!q || options.length < 2 || options.length > 6 || options.some((o: string | null) => !o) || !Number.isInteger(x.answer) || x.answer < 0 || x.answer >= options.length) return null;
    out.push({ q, options, answer: x.answer });
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const g = store.get(url.searchParams.get("pin") ?? "");
  // Wrong PINs are counted, so nobody can try all million of them to walk into a class's game.
  if (!g) return limited(request, "game-miss", 30, 60_000) ?? bad("not found", 404);
  const host = url.searchParams.get("host");
  return Response.json(view(g, Date.now(), { playerId: url.searchParams.get("player") ?? undefined, host: !!host && host === g.hostKey }));
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("invalid JSON");
  }
  const now = Date.now();

  if (body.action === "create") {
    if (!(await readPlatform()).flags.liveGame) return bad("switched off", 403);
    // Real accounts: only teachers host games. (Players join with the PIN, no account needed.)
    if (REAL_AUTH && !STAFF_ROLES.includes((await whoIs(request))?.who.role ?? "")) return bad("teachers only", 403);
    const over = limited(request, "game-create", 30, 3600_000);
    if (over) return over;
    const title = str(body.title, 120);
    const questions = validQuestions(body.questions);
    if (!title || !questions) return bad("invalid game");
    for (const [pin, g] of store) if (now - g.createdAt > MAX_AGE_MS) store.delete(pin);
    if (store.size >= 2000) return bad("too many games right now", 429);
    let pin;
    do pin = String(randomInt(100000, 1000000));
    while (store.has(pin));
    const hostKey = randomBytes(16).toString("hex");
    store.set(pin, createGame(pin, hostKey, title, questions, now));
    return Response.json({ pin, hostKey });
  }

  const g = store.get(typeof body.pin === "string" ? body.pin : "");
  if (!g) return limited(request, "game-miss", 30, 60_000) ?? bad("not found", 404);

  if (body.action === "join") {
    const over = limited(request, "game-join", 400, 60_000); // a whole class may share one Wi-Fi address
    if (over) return over;
    const playerId = randomBytes(12).toString("hex");
    const res = join(g, typeof body.name === "string" ? body.name : "", playerId);
    return "error" in res ? bad(res.error, 409) : Response.json({ playerId });
  }
  if (body.action === "answer") {
    const ok = answer(g, String(body.playerId ?? ""), Number(body.choice), now);
    return ok ? Response.json({ ok }) : bad("not accepted", 409);
  }
  if (body.action === "start" || body.action === "reveal" || body.action === "next" || body.action === "end") {
    if (body.hostKey !== g.hostKey) return bad("forbidden", 403);
    return hostAction(g, body.action, now) ? Response.json({ ok: true }) : bad("not allowed now", 409);
  }
  return bad("unknown action");
}
