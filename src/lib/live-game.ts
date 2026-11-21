// Kahoot-style live quiz game: rules only (no server code), so it can be unit-tested.
// No imports: also loaded by scripts/live-game.test.mjs.

export type GameQuestion = { q: string; options: string[]; answer: number };
type Answer = { choice: number; ms: number; correct: boolean; gained: number };
type Player = { id: string; name: string; score: number; answers: Record<number, Answer> };
export type Phase = "lobby" | "question" | "reveal" | "end";
export type Game = {
  pin: string;
  hostKey: string;
  title: string;
  questions: GameQuestion[];
  limitMs: number;
  phase: Phase;
  index: number;
  startedAt: number;
  players: Player[];
  createdAt: number;
};

export const MAX_PLAYERS = 100;
const POINTS = 1000;

export function createGame(pin: string, hostKey: string, title: string, questions: GameQuestion[], now: number, limitMs = 20_000): Game {
  return { pin, hostKey, title, questions, limitMs, phase: "lobby", index: 0, startedAt: 0, players: [], createdAt: now };
}

/** A question ends when time is up or everyone has answered. Call before reading or changing a game. */
export function tick(g: Game, now: number) {
  if (g.phase !== "question") return;
  const everyone = g.players.length > 0 && g.players.every((p) => p.answers[g.index]);
  if (everyone || now - g.startedAt >= g.limitMs) g.phase = "reveal";
}

export function join(g: Game, name: string, id: string): { ok: true } | { error: "started" | "full" | "name" } {
  const clean = name.trim().slice(0, 20);
  if (!clean) return { error: "name" };
  if (g.phase !== "lobby") return { error: "started" };
  if (g.players.length >= MAX_PLAYERS) return { error: "full" };
  if (g.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return { error: "name" };
  g.players.push({ id, name: clean, score: 0, answers: {} });
  return { ok: true };
}

/** Faster correct answers score more: 1000 at once, down to 500 at the buzzer. */
export function answer(g: Game, playerId: string, choice: number, now: number): boolean {
  tick(g, now);
  const p = g.players.find((x) => x.id === playerId);
  const q = g.questions[g.index];
  if (!p || g.phase !== "question" || p.answers[g.index] || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return false;
  const ms = Math.max(0, now - g.startedAt);
  const correct = choice === q.answer;
  const gained = correct ? Math.round(POINTS * (1 - ms / g.limitMs / 2)) : 0;
  p.answers[g.index] = { choice, ms, correct, gained };
  p.score += gained;
  tick(g, now);
  return true;
}

export function hostAction(g: Game, action: "start" | "reveal" | "next" | "end", now: number): boolean {
  tick(g, now);
  if (action === "start" && g.phase === "lobby" && g.questions.length > 0) {
    Object.assign(g, { phase: "question", index: 0, startedAt: now });
  } else if (action === "reveal" && g.phase === "question") {
    g.phase = "reveal";
  } else if (action === "next" && g.phase === "reveal") {
    if (g.index + 1 >= g.questions.length) g.phase = "end";
    else Object.assign(g, { phase: "question", index: g.index + 1, startedAt: now });
  } else if (action === "end") {
    g.phase = "end";
  } else return false;
  return true;
}

const ranked = (g: Game) => [...g.players].sort((a, b) => b.score - a.score);

/** What a screen may see. Players never get the right answer before the reveal. */
export function view(g: Game, now: number, opts: { playerId?: string; host?: boolean } = {}) {
  tick(g, now);
  const q = g.questions[g.index];
  const order = ranked(g);
  const me = opts.playerId ? g.players.find((p) => p.id === opts.playerId) : undefined;
  const mine = me?.answers[g.index];
  return {
    pin: g.pin,
    title: g.title,
    phase: g.phase,
    index: g.index,
    total: g.questions.length,
    players: g.players.length,
    names: g.phase === "lobby" ? g.players.map((p) => p.name) : undefined,
    question: g.phase === "question" || g.phase === "reveal" ? { q: q.q, options: q.options } : undefined,
    timeLeftMs: g.phase === "question" ? Math.max(0, g.limitMs - (now - g.startedAt)) : 0,
    answered: g.phase === "question" ? g.players.filter((p) => p.answers[g.index]).length : undefined,
    correct: g.phase === "reveal" ? q.answer : undefined,
    counts: g.phase === "reveal" && opts.host ? q.options.map((_, i) => g.players.filter((p) => p.answers[g.index]?.choice === i).length) : undefined,
    top: g.phase === "reveal" || g.phase === "end" ? order.slice(0, 5).map((p) => ({ name: p.name, score: p.score })) : undefined,
    me: me
      ? {
          name: me.name,
          score: me.score,
          rank: order.indexOf(me) + 1,
          answered: !!mine,
          ...(g.phase === "reveal" ? { choice: mine?.choice ?? null, wasCorrect: !!mine?.correct, gained: mine?.gained ?? 0 } : {}),
        }
      : undefined,
  };
}
export type GameView = ReturnType<typeof view>;
