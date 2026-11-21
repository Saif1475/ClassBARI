// MCQ quiz format the teacher types (no imports: also loaded directly by scripts/quiz.test.mjs).
//
//   What is the SI unit of frequency?
//   *Hertz
//   Newton
//
//   Next question…
//
// Blank line between questions; first line is the question; other lines are options; "*" marks the right one.
// Optional topic tag at the start of the question: "[Pendulum] What is…" (used for per-topic mastery).
// Optional section heading on its own: "## Physics" — the questions after it belong to that section.

export type QuizQuestion = { q: string; options: string[]; answer: number; topic?: string; section?: string };

/** Returns the questions, or the 1-based number of the first broken question. */
export function parseQuiz(text: string): { questions: QuizQuestion[]; badQuestion?: number } {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length > 0);
  const questions: QuizQuestion[] = [];
  let section: string | undefined;
  for (let [first, ...lines] of blocks) {
    const heading = first.match(/^#{1,3}\s*(.{1,40})$/);
    if (heading) {
      section = heading[1].trim();
      if (lines.length === 0) continue;
      [first, ...lines] = lines; // heading written directly above a question
    }
    const marked = lines.filter((l) => l.startsWith("*"));
    if (lines.length < 2 || marked.length !== 1) return { questions: [], badQuestion: questions.length + 1 };
    const tag = first.match(/^\[([^\]]{1,40})\]\s*(.+)$/);
    questions.push({
      q: tag ? tag[2] : first,
      ...(tag ? { topic: tag[1].trim() } : {}),
      ...(section ? { section } : {}),
      options: lines.map((l) => l.replace(/^\*\s*/, "")),
      answer: lines.findIndex((l) => l.startsWith("*")),
    });
  }
  return { questions };
}

/** Which questions were answered correctly (for topic mastery and "practise my mistakes"). */
export const markQuiz = (questions: QuizQuestion[], picks: (number | null)[]) => questions.map((q, i) => picks[i] === q.answer);

/** Mastery level from % correct: Khan-Academy-style buckets. */
export const masteryLevel = (pct: number): "familiar" | "proficient" | "mastered" => (pct >= 90 ? "mastered" : pct >= 60 ? "proficient" : "familiar");

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Marks scaled to the quiz's total points. Unanswered gets 0; with negative marking each wrong answer
 * loses `negative` marks (admission-test style), so the total can drop below zero.
 */
export function scoreQuiz(questions: QuizQuestion[], picks: (number | null)[], points: number, negative = 0) {
  if (questions.length === 0) return 0;
  const right = questions.filter((q, i) => picks[i] === q.answer).length;
  const wrong = questions.filter((q, i) => picks[i] !== null && picks[i] !== undefined && picks[i] !== q.answer).length;
  return negative ? round2((right * points) / questions.length - wrong * negative) : Math.round((right / questions.length) * points);
}

/** Right / wrong / skipped per section ("" = no section). */
export function sectionResults(questions: QuizQuestion[], picks: (number | null)[]) {
  const out = new Map<string, { right: number; wrong: number; skipped: number }>();
  questions.forEach((q, i) => {
    const r = out.get(q.section ?? "") ?? { right: 0, wrong: 0, skipped: 0 };
    if (picks[i] === null || picks[i] === undefined) r.skipped++;
    else if (picks[i] === q.answer) r.right++;
    else r.wrong++;
    out.set(q.section ?? "", r);
  });
  return [...out].map(([section, r]) => ({ section, ...r }));
}

/** The same shuffled order every time for one student (seed), different between students. */
export function seededOrder(n: number, seed: number) {
  const order = [...Array(n).keys()];
  let x = (seed * 2654435761) % 4294967296 || 1;
  for (let i = n - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) % 4294967296;
    const j = x % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Merit list: highest first; equal marks share a rank (1, 2, 2, 4).
 * percentile = % of the others this student beat.
 */
/** Minutes a quiz allows: the teacher's limit, or one minute per question. */
export const quizMinutes = (item: { timeLimitMin?: number; questions?: unknown[] }) => (item.timeLimitMin && item.timeLimitMin > 0 ? item.timeLimitMin : (item.questions?.length ?? 0));
/** Went over time? `took` is the server-measured seconds (-1: never pressed Start). A minute's grace for slow internet. */
export const overTime = (item: { timeLimitMin?: number; questions?: unknown[] }, took: number | undefined) =>
  took === undefined ? null : took < 0 ? ("unknown" as const) : took > quizMinutes(item) * 60 + 60 ? Math.round(took / 60) : null;

export function meritList(scores: Record<number, number>) {
  const rows = Object.entries(scores).map(([id, score]) => ({ id: Number(id), score })).sort((a, b) => b.score - a.score);
  const n = rows.length;
  // Sorted high to low, so equal marks sit together: everyone before the group is above it, everyone after is below.
  const out: { id: number; score: number; rank: number; of: number; percentile: number }[] = [];
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && rows[j].score === rows[i].score) j++;
    const percentile = n > 1 ? Math.round(((n - j) / (n - 1)) * 100) : 100;
    for (let k = i; k < j; k++) out.push({ ...rows[k], rank: i + 1, of: n, percentile });
    i = j;
  }
  return out;
}

export type GradeBand = { label: string; minPct: number };

export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { label: "A+", minPct: 80 },
  { label: "A", minPct: 70 },
  { label: "A-", minPct: 60 },
  { label: "B", minPct: 50 },
  { label: "C", minPct: 40 },
  { label: "D", minPct: 33 },
  { label: "F", minPct: 0 },
];

export const EXAM_PRESETS = [
  { id: "hsc", label: "HSC Board", negative: 0, passPct: 33, shuffle: false, antiCheat: false },
  { id: "buet", label: "BUET / Engg", negative: 0.25, passPct: 40, shuffle: true, antiCheat: true },
  { id: "medical", label: "Medical", negative: 0.25, passPct: 40, shuffle: true, antiCheat: true },
  { id: "du", label: "DU Ka-Unit", negative: 0.25, passPct: 40, shuffle: true, antiCheat: true },
] as const;

export function gradeFor(score: number, points: number, scale: GradeBand[] = DEFAULT_GRADE_SCALE, passPct = 33) {
  const pct = points > 0 ? Math.max(0, Math.round((score / points) * 100)) : 0;
  const band = scale.find((b) => pct >= b.minPct) ?? scale[scale.length - 1] ?? { label: "F", minPct: 0 };
  return { label: band.label, pct, passed: pct >= passPct };
}

/** Rubric text, one "Criterion: max marks" per line. Returns null if any line is malformed. */
export function parseRubric(text: string): { name: string; max: number }[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = lines.map((l) => l.match(/^(.{1,60}?)\s*[:：]\s*(\d{1,3})$/)).map((m) => (m ? { name: m[1].trim(), max: Number(m[2]) } : null));
  return out.every((c) => c && c.max > 0) ? (out as { name: string; max: number }[]) : null;
}

/** Display order (website and phone apps): sections stay together; with `shuffle`, questions (within their section) and options are per-student. */
export function quizOrder(item: { id: number; questions?: QuizQuestion[]; shuffle?: boolean }, studentId: number) {
  const qs = item.questions ?? [];
  const seed = studentId * 7919 + (item.id % 100000);
  const sections = [...new Set(qs.map((q) => q.section ?? ""))];
  const questions = sections.flatMap((sec, si) => {
    const idx = qs.flatMap((q, i) => ((q.section ?? "") === sec ? [i] : []));
    return item.shuffle ? seededOrder(idx.length, seed + si).map((k) => idx[k]) : idx;
  });
  const options = qs.map((q, i) => (item.shuffle ? seededOrder(q.options.length, seed + 101 * (i + 1)) : q.options.map((_, k) => k)));
  return { questions, options };
}
