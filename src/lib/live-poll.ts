// Live class poll: one active poll per batch, one vote per student device. Pure rules (scripts/live-poll.test.mjs);
// the server keeps polls in memory (src/app/api/poll/route.ts), like the live quiz game.

export type Poll = { id: string; batch: string; question: string; options: string[]; correct: number; votes: Record<string, number>; at: number };

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

export function startPoll(input: Record<string, unknown>, id: string, now: number): Poll | { error: string } {
  const batch = str(input.batch, 120), question = str(input.question, 300);
  const options = Array.isArray(input.options) ? input.options.map((o) => str(o, 120)).filter((o): o is string => !!o) : [];
  const correct = Number(input.correct);
  if (!batch || !question || options.length < 2 || options.length > 6 || !Number.isInteger(correct) || correct < 0 || correct >= options.length) return { error: "invalid poll" };
  return { id, batch, question, options, correct, votes: {}, at: now };
}

/** A device votes once; voting again (or after the poll changed) is refused. */
export function vote(p: Poll, pollId: unknown, voter: unknown, option: unknown): { ok: true } | { error: string } {
  if (pollId !== p.id) return { error: "poll ended" };
  if (typeof voter !== "string" || !/^[\w-]{8,64}$/.test(voter)) return { error: "bad voter" };
  if (!Number.isInteger(option) || (option as number) < 0 || (option as number) >= p.options.length) return { error: "bad option" };
  if (voter in p.votes) return { error: "already voted" };
  p.votes[voter] = option as number;
  return { ok: true };
}

/** What a viewer may see: counts always; the right answer only for staff or after this device has voted. */
export function pollView(p: Poll, viewer: { staff: boolean; voter?: string }) {
  const counts = p.options.map((_, i) => Object.values(p.votes).filter((v) => v === i).length);
  const mine = viewer.voter !== undefined ? p.votes[viewer.voter] : undefined;
  const show = viewer.staff || mine !== undefined;
  return { id: p.id, question: p.question, options: p.options, counts, total: Object.keys(p.votes).length, mine: mine ?? null, correct: show ? p.correct : null };
}
