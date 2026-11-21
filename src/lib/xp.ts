// Duolingo-style streaks, XP and weekly leagues. No imports: also loaded by scripts/xp.test.mjs.
// XP is stored per student per day: { "2026-11-19": 35, ... } (local YYYY-MM-DD keys).

export type XpLog = Record<string, number>;

/** XP rewards for actions. */
export const XP = { itemDone: 10, quizPerCorrect: 5, practiceCorrect: 2, submit: 15, liveGame: 20 } as const;

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

/**
 * Days in a row with XP. Today counts if studied; if not yet, the streak from yesterday is still alive
 * (it only breaks when a whole day is missed).
 */
export function streak(log: XpLog, today = new Date()): { days: number; doneToday: boolean } {
  const doneToday = (log[key(today)] ?? 0) > 0;
  let day = doneToday ? today : shift(today, -1);
  let days = 0;
  while ((log[key(day)] ?? 0) > 0) {
    days++;
    day = shift(day, -1);
  }
  return { days, doneToday };
}

/** Week starts on Saturday (Bangladesh school week). Returns the YYYY-MM-DD keys of this week so far. */
export function weekDays(today = new Date()): string[] {
  const back = (today.getDay() + 1) % 7; // Sat=0 … Fri=6
  return Array.from({ length: back + 1 }, (_, i) => key(shift(today, -back + i)));
}

export const weekXp = (log: XpLog, today = new Date()) => weekDays(today).reduce((s, d) => s + (log[d] ?? 0), 0);
export const totalXp = (log: XpLog) => Object.values(log).reduce((s, v) => s + v, 0);
