// Turn questions written the way teachers usually write them (Word, text, Excel, or OCR of a printed paper)
// into ClassBARI MCQs. Pure functions (scripts/question-import.test.mjs).
//
// Understands:   1. Question?            Q2) Question?        ২। প্রশ্ন?
//                a) x  b. y  (c) z  D: w   ক) x  খ) y  — also all options on one line
//                Answer: B / Ans: b / উত্তর: খ / Correct answer: the option's text
//                *b) x  or  b) x ✓  (marked option)      ## Section     [Topic] Question?
import { parseQuiz, type QuizQuestion } from "./quiz.ts"; // .ts so the Node test runner can load it too

export type Imported = { questions: (QuizQuestion & { answer: number })[]; problems: number[] }; // answer -1 = not found

const LETTERS = "abcdef";
const BANGLA = "কখগঘঙচ";
const letterIndex = (l: string) => {
  const i = LETTERS.indexOf(l.toLowerCase());
  return i >= 0 ? i : BANGLA.indexOf(l);
};
const OPTION = /^(\*?)\s*\(?([A-Fa-fকখগঘঙচ])\s*[).:\]]\s*(.*)$/;
const INLINE_OPT = /(?:^|\s)\(?([A-Fa-fকখগঘ])[).]\s+/g;
const QUESTION = /^(?:Q(?:uestion)?\s*)?([0-9০-৯]{1,3})\s*[).:।.-]\s*(.+)$/i;
const ANSWER = /^(?:ans(?:wer)?|correct(?:\s+answer)?|উত্তর|সঠিক\s*উত্তর)\s*[:：.\-=]?\s*(.+)$/i;
const MARK = /\s*(?:✓|✔|\(correct\)|\(ans\))\s*$/i;

/** "a) x b) y c) z" on one line -> separate option lines (only if at least 2 markers in order a, b, …). */
function splitInlineOptions(line: string): string[] {
  const hits = [...line.matchAll(INLINE_OPT)];
  if (hits.length < 2 || !hits.every((h, i) => letterIndex(h[1]) === i)) return [line];
  const out: string[] = [];
  const head = line.slice(0, hits[0].index).trim();
  if (head) out.push(head);
  hits.forEach((h, i) => out.push(line.slice(h.index, hits[i + 1]?.index ?? line.length).trim()));
  return out;
}

export function parseLooseMcq(text: string): Imported {
  const lines = text.split(/\r?\n/).flatMap((l) => splitInlineOptions(l.trim())).filter(Boolean);
  // Already in ClassBARI's own format (options without letters, right one starred): use the strict reader.
  if (!lines.some((l) => OPTION.test(l)) && !lines.some((l) => ANSWER.test(l))) {
    const strict = parseQuiz(text);
    if (!strict.badQuestion && strict.questions.length) return { questions: strict.questions, problems: [] };
  }
  const questions: Imported["questions"] = [];
  let section: string | undefined;
  let cur: { q: string; options: string[]; answer: number; topic?: string; section?: string } | null = null;
  const finish = () => {
    if (cur && cur.q) questions.push(cur);
    cur = null;
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s*(.{1,40})$/);
    if (heading) {
      finish();
      section = heading[1].trim();
      continue;
    }
    const ans = line.match(ANSWER);
    if (ans && cur) {
      const a = ans[1].replace(/[()\s.]/g, "");
      const byLetter = a.length === 1 ? letterIndex(a) : -1;
      const byNumber = /^[1-6]$/.test(a) ? Number(a) - 1 : -1;
      const byText = cur.options.findIndex((o) => o.toLowerCase() === ans[1].trim().toLowerCase());
      cur.answer = [byLetter, byNumber, byText].find((i) => i >= 0 && i < cur!.options.length) ?? -1;
      continue;
    }
    const opt = line.match(OPTION);
    if (opt && cur && letterIndex(opt[2]) === cur.options.length) {
      const marked = !!opt[1] || MARK.test(opt[3]);
      cur.options.push(opt[3].replace(MARK, "").trim());
      if (marked) cur.answer = cur.options.length - 1;
      continue;
    }
    const qm = line.match(QUESTION);
    if (qm || !cur || cur.options.length >= 2) {
      // a numbered line, the first line, or a line after a full set of options starts a new question
      finish();
      const body = (qm ? qm[2] : line).trim();
      const tag = body.match(/^\[([^\]]{1,40})\]\s*(.+)$/);
      cur = { q: tag ? tag[2] : body, options: [], answer: -1, ...(tag ? { topic: tag[1].trim() } : {}), ...(section ? { section } : {}) };
      continue;
    }
    cur.q = `${cur.q} ${line}`; // question text that wraps onto the next line
  }
  finish();
  const kept = questions.filter((q) => q.options.length >= 2);
  return { questions: kept, problems: kept.flatMap((q, i) => (q.answer < 0 ? [i + 1] : [])) };
}

/** Spreadsheet rows (first row = headings): Question, A, B, C, D (E, F), Answer, Topic, Section. */
export function rowsToMcq(rows: string[][]): Imported {
  const [head = [], ...data] = rows;
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const qi = col("question", "questions", "q", "প্রশ্ন");
  const opts = [0, 1, 2, 3, 4, 5].map((i) => col(LETTERS[i], `option ${LETTERS[i]}`, `option${LETTERS[i]}`, BANGLA[i], `${i + 1}`)).filter((i) => i >= 0);
  const ai = col("answer", "correct", "correct answer", "ans", "উত্তর");
  const ti = col("topic", "chapter", "অধ্যায়");
  const si = col("section", "subject", "বিষয়");
  if (qi < 0 || opts.length < 2) return { questions: [], problems: [] };
  const questions = data
    .filter((r) => r[qi]?.trim())
    .map((r) => {
      const options = opts.map((i) => r[i]?.trim() ?? "").filter(Boolean);
      const a = (r[ai] ?? "").trim();
      const answer = [a.length === 1 ? letterIndex(a) : -1, /^[1-6]$/.test(a) ? Number(a) - 1 : -1, options.findIndex((o) => o.toLowerCase() === a.toLowerCase())].find((i) => i >= 0 && i < options.length) ?? -1;
      return { q: r[qi].trim(), options, answer, ...(r[ti]?.trim() ? { topic: r[ti].trim() } : {}), ...(r[si]?.trim() ? { section: r[si].trim() } : {}) };
    })
    .filter((q) => q.options.length >= 2);
  return { questions, problems: questions.flatMap((q, i) => (q.answer < 0 ? [i + 1] : [])) };
}

/** Back to the text format of the question box (questions without a known answer have no * so the teacher adds it). */
export function toQuizText(qs: Imported["questions"]) {
  let section: string | undefined;
  return qs
    .map((q) => {
      const head = q.section && q.section !== section ? `## ${(section = q.section)}\n` : "";
      return `${head}${q.topic ? `[${q.topic}] ` : ""}${q.q}\n${q.options.map((o, i) => `${i === q.answer ? "*" : ""}${o}`).join("\n")}`;
    })
    .join("\n\n");
}

/** "Paper + answer key" test: the questions are on the uploaded paper; the screen just shows A–D for each number. */
export const answerSheetQuestions = (key: number[], label: (n: number) => string): QuizQuestion[] =>
  key.map((answer, i) => ({ q: label(i + 1), options: ["A", "B", "C", "D"], answer }));
