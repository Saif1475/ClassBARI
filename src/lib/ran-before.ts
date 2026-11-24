// Which changes each institute's data already took in. Nothing from the app is imported, so it can be tested on its own.
import { createHash } from "node:crypto";

/**
 * A sender whose answer never arrived (it timed out, the app was closed, the connection dropped) sends its change
 * again. Run a second time it made a second student, payment, message or post, so the server remembers what it ran.
 * shortcut: the last 200 changes of each institute, in this server's memory only (lost on a restart, not shared between servers); keep them with the institute's data in Supabase when there is a second server or changes are sent again later than that.
 */
const ran = new Map<string, Set<string>>();

/**
 * Names one change: who sent it, its base, the action and what it carried. The app and the website give every change
 * a different base; the rest is for two screens of one person whose counters happen to meet, and for a website page
 * opened before it did that (there, changes that made no new id shared a base).
 */
export const changeKey = (who: { role: string; email?: string; studentIds: number[] }, name: string, args: unknown[], base: number) =>
  // No email: the server acting for the institute (joins, orders, admin approvals), whose details are not in args, so two in one millisecond look alike; never a resend.
  who.email ? createHash("sha256").update(JSON.stringify([who.role, who.email, who.studentIds, base, name, args])).digest("base64") : null;

export const ranBefore = (institute: string, change: string | null) => !!change && !!ran.get(institute)?.has(change);

export function ranNow(institute: string, change: string | null) {
  if (!change) return;
  const mine = ran.get(institute) ?? new Set<string>();
  ran.delete(institute); // the newest last, so the institute quiet the longest goes first when the memory is full
  ran.set(institute, mine);
  if (ran.size > 2000) ran.delete(ran.keys().next().value!);
  mine.add(change);
  if (mine.size > 200) mine.delete(mine.values().next().value!);
}
