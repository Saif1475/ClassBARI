// Pure views of an institute's data (attendance, results, payroll…), shared by the website and the phone apps.
import { dayKey, toDate } from "./dates.ts";
import type { Batch, CourseModule, ModuleItem, Payment, Staff } from "./mock-data.ts";
import { masteryLevel, type QuizQuestion } from "./quiz.ts";
import { weekDays, type XpLog } from "./xp.ts";

/** Attendance this month: recorded days (optionally only the given weekdays), and how many the student attended. */
export function monthAttendance(attendance: Record<string, number[]>, studentId: number, classDays?: number[], now = new Date()) {
  // Day keys are "YYYY-MM-DD": other months are dropped by their text, so only this month's few days are read as dates.
  const prefix = dayKey(now).slice(0, 8);
  const days = Object.keys(attendance)
    .filter((d) => {
      if (d.length === 10 && !d.startsWith(prefix)) return false;
      const x = toDate(d);
      return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth() && x <= now && (!classDays || classDays.includes(x.getDay()));
    })
    .sort();
  const present = days.filter((d) => !attendance[d].includes(studentId)).length;
  return { held: days.length, present, pct: days.length ? Math.round((present / days.length) * 100) : 0, days };
}

/** Quizzes a student has taken, with their percentage, for grades, reports and "needs more practice". */
export const quizResults = (modules: CourseModule[], studentId: number) =>
  modules
    .flatMap((m) => m.items)
    .filter((it) => it.kind === "quiz" && it.scores?.[studentId] !== undefined)
    .map((it) => {
      const score = it.scores![studentId];
      const points = it.points ?? 30;
      return { id: it.id, title: it.title, score, points, pct: Math.round((score / points) * 100) };
    });

/** Rank of a student in a quiz (1 = best) and the sorted board. */
export const quizBoard = (item: ModuleItem, students: { id: number; name: string }[]) => {
  const names = new Map<number, string>();
  for (const s of students) if (!names.has(s.id)) names.set(s.id, s.name); // the first with that id, as a search would find
  return Object.entries(item.scores ?? {})
    .map(([id, score]) => ({ id: Number(id), name: names.get(Number(id)) ?? "—", score }))
    .sort((a, b) => b.score - a.score);
};

/** Marks per student for any graded item: quiz scores, or grades of written exams / assignments. */
export const itemScores = (it: ModuleItem): Record<number, number> =>
  it.kind === "quiz"
    ? { ...it.scores }
    : Object.fromEntries(Object.entries(it.submissions ?? {}).flatMap(([id, sub]) => (sub.grade === undefined ? [] : [[Number(id), sub.grade]]))) as Record<number, number>;

/**
 * A student's position in one graded item. Students and guardians are sent only their own marks, with the position
 * worked out on the server (`ranks`); where everyone's marks are at hand (demo, staff) it is counted here.
 */
export function myRank(it: ModuleItem, studentId: number): { rank: number; of: number } | undefined {
  if (it.ranks?.[studentId]) return it.ranks[studentId];
  // One pass over the marks: count who is above and below this student (no need to rank everybody).
  const mine = it.kind === "quiz" ? it.scores?.[studentId] : it.submissions?.[studentId]?.grade;
  if (mine === undefined) return undefined;
  let above = 0, below = 0, of = 0;
  const see = (v: number | undefined) => {
    if (v === undefined) return;
    of++;
    if (v > mine) above++;
    else if (v < mine) below++;
  };
  if (it.kind === "quiz") for (const v of Object.values(it.scores ?? {})) see(v);
  else for (const sub of Object.values(it.submissions ?? {})) see(sub.grade);
  return { id: studentId, score: mine, rank: above + 1, of, percentile: of > 1 ? Math.round((below / (of - 1)) * 100) : 100 } as { rank: number; of: number };
}

/** This week's XP position of a student within their batch. */
export function leagueRank(students: { id: number; batch: string }[], xp: Record<number, XpLog>, studentId: number) {
  const me = students.find((s) => s.id === studentId);
  if (!me) return undefined;
  const days = weekDays(); // this week's day keys, worked out once for everybody
  const week = (log: XpLog | undefined) => (log ? days.reduce((sum, d) => sum + (log[d] ?? 0), 0) : 0);
  const mine = week(xp[studentId]);
  let above = 0, of = 0;
  for (const s of students) {
    if (s.batch !== me.batch) continue;
    of++;
    if (week(xp[s.id]) > mine) above++;
  }
  return { rank: above + 1, of };
}

/** Payroll for one month: fixed salary + share of fees collected from the teacher's batches, minus payouts. */
export function payroll(state: { staff: Staff[]; batches: Batch[]; payments: Payment[]; staffPayments: { name: string; month: string; amount: number }[] }, month: string) {
  // One pass over the payments and one over the payouts, then each teacher just looks their totals up.
  const byBatch = new Map<string, number>();
  for (const p of state.payments) if (dayKey(toDate(p.at)).startsWith(month)) byBatch.set(p.batch, (byBatch.get(p.batch) ?? 0) + p.amount);
  const paidTo = new Map<string, number>();
  for (const p of state.staffPayments) if (p.month === month) paidTo.set(p.name, (paidTo.get(p.name) ?? 0) + p.amount);
  const batchesOf = new Map<string, Set<string>>();
  for (const b of state.batches) batchesOf.set(b.teacher, (batchesOf.get(b.teacher) ?? new Set()).add(b.name));
  return state.staff.map((st) => {
    let collected = 0;
    for (const name of batchesOf.get(st.name) ?? []) collected += byBatch.get(name) ?? 0;
    const payable = st.salary + Math.round((collected * st.share) / 100);
    const paid = paidTo.get(st.name) ?? 0;
    return { ...st, collected, payable, paid, balance: Math.max(0, payable - paid) };
  });
}

/**
 * Money received per month and batch, for the income table. One pass over the payments; the screen then looks each
 * cell up (it used to re-read every payment for every cell of the table).
 */
export function incomeByMonth(payments: Payment[], months: string[], batchNames: string[]) {
  const wantMonth = new Set(months);
  const wantBatch = new Set(batchNames);
  const cells = new Map<string, number>();
  for (const p of payments) {
    if (!wantBatch.has(p.batch)) continue;
    const month = dayKey(toDate(p.at)).slice(0, 7);
    if (!wantMonth.has(month)) continue;
    cells.set(`${month}|${p.batch}`, (cells.get(`${month}|${p.batch}`) ?? 0) + p.amount);
    cells.set(month, (cells.get(month) ?? 0) + p.amount);
  }
  /** A month's total, or one batch's share of it. */
  return (month: string, batch?: string) => cells.get(batch === undefined ? month : `${month}|${batch}`) ?? 0;
}

/** Everything a student has been marked on (quizzes + graded written exams/assignments), for progress charts. */
export const gradedResults = (modules: CourseModule[], studentId: number) =>
  modules
    .flatMap((m) => m.items)
    .flatMap((it) => {
      const points = it.points ?? (it.kind === "quiz" ? 30 : 20);
      const score = it.kind === "quiz" ? it.scores?.[studentId] : it.submissions?.[studentId]?.grade;
      return score === undefined ? [] : [{ id: it.id, title: it.title, kind: it.kind, dueDate: it.dueDate, score, points, pct: Math.round((score / points) * 100) }];
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

/** The average mark (%) of these students over everything marked in these lessons, or null when nothing is marked. One pass. */
export function averagePct(modules: CourseModule[], studentIds: Iterable<number>) {
  const ids = new Set(studentIds);
  let sum = 0, n = 0;
  const add = (id: string, score: number | undefined, points: number) => {
    if (score === undefined || !ids.has(Number(id))) return;
    sum += Math.round((score / points) * 100);
    n++;
  };
  for (const m of modules)
    for (const it of m.items) {
      const points = it.points ?? (it.kind === "quiz" ? 30 : 20);
      if (it.kind === "quiz") for (const [id, score] of Object.entries(it.scores ?? {})) add(id, score, points);
      else for (const [id, sub] of Object.entries(it.submissions ?? {})) add(id, sub.grade, points);
    }
  return n ? Math.round(sum / n) : null;
}

/** Per-topic results for one student (or a whole class), from tagged quiz questions. */
export function topicMastery(modules: CourseModule[], studentIds: number[]) {
  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const it of modules.flatMap((m) => m.items)) {
    if (!it.questions) continue;
    for (const id of studentIds) {
      it.answers?.[id]?.forEach((ok, i) => {
        const topic = it.questions![i]?.topic;
        if (!topic) return;
        let t = byTopic.get(topic);
        if (!t) byTopic.set(topic, (t = { correct: 0, total: 0 }));
        if (ok) t.correct++;
        t.total++;
      });
    }
  }
  return [...byTopic].map(([topic, t]) => {
    const pct = Math.round((t.correct / t.total) * 100);
    return { topic, ...t, pct, level: masteryLevel(pct) };
  });
}

/** Questions a student got wrong, for "Practise my mistakes". */
export const mistakes = (modules: CourseModule[], studentId: number): QuizQuestion[] =>
  modules.flatMap((m) => m.items).flatMap((it) => (it.questions ?? []).filter((_, i) => it.answers?.[studentId]?.[i] === false));

/** Marked homework and written exams of one student: what "Exam scores" shows with real accounts. */
export const writtenResults = (modules: CourseModule[], studentId: number) => gradedResults(modules, studentId).filter((r) => r.kind !== "quiz");
