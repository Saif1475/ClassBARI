// "Import students": a file becomes a table (Excel/CSV as they are; a PDF or a photo by where its words sit on the page),
// the person says which column is which (filled in first from the headings and what the columns hold), and every row
// is checked with the enrol form's rules before anything is added. Pure (scripts/student-import.test.mjs); used by the
// website's import and by /api/import-students for the phone app.
import { IMPORT_COLUMNS, TEMPLATE_HEADER, type ImportField } from "./sheet.ts";
import { validateStudent, type EnrolError, type StudentContact } from "./site.ts";

/** What a column holds; "" when it isn't used. */
export type Field = ImportField | "";
export type ImportRecord = Partial<Record<ImportField, string>>;
export type ImportProblem = EnrolError | { unknownBatch: string };
export type ImportRow = { line: number; input: StudentContact & { batch: string; school?: string; address?: string }; problems: ImportProblem[] };
/** A piece of text on a page and where it sits: x to the right, y downwards (one scale per page), w wide, h tall. */
export type Piece = { str: string; x: number; y: number; w: number; h: number; page: number };

export const FIELDS = Object.keys(IMPORT_COLUMNS) as ImportField[];
const REQUIRED: ImportField[] = ["name", "email", "guardianName", "guardianEmail", "phone"];

/** The template: the headings and one example student, in the batch picked. */
export const templateRows = (batch: string) => [TEMPLATE_HEADER, ["Nusrat Jahan", "nusrat@gmail.com", "Kamal Jahan", "kamal@gmail.com", "01711234511", "", batch, "", ""]];

const latin = (s: string) => s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x9e6)); // Bangla digits
/** A mobile number as 01XXXXXXXXX: Excel drops the 0 (1711234511), lists write +880 1711-234511. Anything else stays. */
export const fixPhone = (p = "") => {
  const d = latin(p).replace(/\D/g, "");
  return /^(?:88)?0?1[3-9]\d{8}$/.test(d) ? `0${d.slice(-10)}` : p.trim();
};

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+?88[\s-]?)?(?:0[\s-]?)?1[3-9](?:[\s-]?\d){8}(?!\d)/; // no lookbehind: older iPhones can't read one
const MARKS = new RegExp(`(${EMAIL.source})|${PHONE.source}`, "g");
/** Has a Gmail or a mobile number, as a student's line has (a mobile that is the end of a longer number doesn't count). */
const marked = (s: string) => [...latin(s).matchAll(MARKS)].some((m) => m[1] || !/\d/.test(latin(s)[m.index - 1] ?? ""));
const isEmail = (s: string) => new RegExp(`^${EMAIL.source}$`).test(s.trim());
const isPhone = (s: string) => /^01[3-9]\d{8}$/.test(fixPhone(s));
const isWords = (s: string) => /^[\p{L}\p{M}][\p{L}\p{M}\s.'’()-]*$/u.test(s.trim());
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const norm = (s: string) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[*:#.]/g, "").replace(/\s+/g, " ").trim();

/** A line that isn't laid out as a table, cut at its Gmails and numbers: [words, mark, words, mark, …, words]. */
function cutAtMarks(line: string) {
  const s = latin(line).replace(/\s+/g, " ").trim(), cells: string[] = [];
  let at = 0;
  for (const m of s.matchAll(MARKS)) {
    if (!m[1] && /\d/.test(s[m.index - 1] ?? "")) continue;
    cells.push(s.slice(at, m.index).replace(/^[\s\d.,;:|()#*-]+|[\s.,;:|(#*-]+$/g, ""), m[0].trim()); // the words, without a row number or table lines
    at = m.index + m[0].length;
  }
  return [...cells, s.slice(at).replace(/^[\s.,;:|)#*-]+|[\s.,;:|(#*-]+$/g, "")];
}

/**
 * A PDF's or a photo's words as a table. Words at one height make a line. The columns are where the students' lines
 * (those with a Gmail or a mobile number) have words, cut at the empty strips between them; a few lines may cross a
 * strip (a long name, or two cells the PDF wrote as one piece). The headings are the line just above the first
 * student; titles above it are left out, the headings again on a later page too, and a line with words in one column
 * only, right under a student, is the rest of a cell that ran onto a second line. A list that isn't a table at all
 * (one student per line, as a sentence) is cut at its Gmails and mobile numbers instead.
 * shortcut: columns are found across all pages at once, so a PDF mixing typed and scanned pages may come out wrong.
 */
export function gridFromPieces(pieces: Piece[]): string[][] {
  const ps = pieces.filter((p) => p.str.trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  if (!ps.length) return [];
  const h = median(ps.map((p) => p.h)) || 10;
  const lines: Piece[][] = [];
  for (const p of ps) {
    const line = lines[lines.length - 1];
    if (line && line[0].page === p.page && Math.abs(p.y - line[0].y) <= h / 2) line.push(p);
    else lines.push([p]);
  }
  for (const l of lines) l.sort((a, b) => a.x - b.x);
  const text = (l: Piece[]) => l.map((p) => p.str).join(" ");
  const students = lines.filter((l) => marked(text(l)));
  const sample = students.length >= 2 ? students : lines.filter((l) => l.length >= 2);
  // How many sample lines have words at each x, in steps of a quarter letter height.
  const left = Math.min(...ps.map((p) => p.x)), step = h / 4;
  const cover: number[] = [];
  for (const l of sample) {
    const hit = new Set<number>();
    for (const p of l) for (let b = Math.floor((p.x - left) / step); b <= Math.floor((p.x + p.w - left) / step); b++) hit.add(b);
    for (const b of hit) cover[b] = (cover[b] ?? 0) + 1;
  }
  const crossing = Math.floor(sample.length / 10), gapSteps = Math.ceil((h * 0.6) / step); // a column gap: 0.6 letter heights or more
  const cols: [number, number][] = [];
  cover.forEach((n, b) => {
    if (n <= crossing) return;
    const last = cols[cols.length - 1];
    if (last && b - last[1] <= gapSteps) last[1] = b;
    else cols.push([b, b]);
  });
  if (cols.length < 2) {
    const cut = lines.map(text).filter(marked).map(cutAtMarks);
    const width = Math.max(0, ...cut.map((r) => r.length));
    return cut.map((r) => [...r, ...Array<string>(width - r.length).fill("")]);
  }
  const columnOf = (p: Piece) => {
    const mid = (p.x + p.w / 2 - left) / step;
    const dist = cols.map(([a, b]) => (mid < a ? a - mid : mid > b + 1 ? mid - b - 1 : 0));
    return dist.indexOf(Math.min(...dist));
  };
  const cells = (l: Piece[]) => {
    const out = cols.map(() => [] as string[]);
    for (const p of l) out[columnOf(p)].push(p.str.trim());
    return out.map((c) => c.join(" "));
  };
  const filled = (r: string[]) => r.filter(Boolean).length;
  const first = lines.findIndex((l) => marked(text(l)));
  const top = first < 0 ? lines.findIndex((l) => filled(cells(l)) >= 2) : first;
  if (top < 0) return [];
  const above = first > 0 && lines[first - 1][0].page === lines[first][0].page ? cells(lines[first - 1]) : null;
  const head = above && filled(above) >= 2 ? above : null;
  const out: string[][] = head ? [head] : [];
  let prev: Piece[] | null = null;
  for (const l of lines.slice(top)) {
    const r = cells(l);
    if (head && r.every((c, i) => norm(c) === norm(head[i]))) prev = null; // the headings again on a new page
    else if (marked(text(l)) || (first < 0 && filled(r) >= 2)) {
      out.push(r);
      prev = l;
    } else if (prev && filled(r) === 1 && l[0].page === prev[0].page && l[0].y - prev[0].y <= h * 1.6) {
      const last = out[out.length - 1]; // the rest of a cell that ran onto the next line
      r.forEach((c, i) => c && (last[i] = `${last[i]} ${c}`.trim()));
      prev = l;
    } else if (filled(r) >= 2) {
      out.push(r); // a student without a Gmail or a number: shown, and flagged when checked
      prev = l;
    }
  }
  return out;
}

/**
 * What each column holds, filled in before the person checks it: from the headings first (English or Bangla, see
 * IMPORT_COLUMNS), then from what the other columns hold: Gmails (the student's, then the guardian's), mobile numbers
 * (the guardian's, then the student's), batch names, and words (the student's name, then the guardian's).
 * `heads`: whether the first row is headings; worked out when not given (it is when a heading is known, or when the
 * first row has no Gmail or number while later rows do).
 */
export function guessFields(grid: string[][], batchNames: string[], heads?: boolean): { heads: boolean; fields: Field[] } {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const first = grid[0] ?? [];
  const known = first.map((c) => FIELDS.find((f) => (IMPORT_COLUMNS[f] as readonly string[]).includes(norm(c))));
  const isHeads = heads ?? (known.some(Boolean) || (!first.some(marked) && grid.slice(1).some((r) => r.some(marked))));
  const fields: Field[] = Array.from({ length: width }, () => "");
  if (isHeads) known.forEach((f, i) => f && !fields.includes(f) && (fields[i] = f));
  const data = isHeads ? grid.slice(1) : grid;
  const most = (i: number, test: (s: string) => boolean) => {
    const values = data.map((r) => (r[i] ?? "").trim()).filter(Boolean);
    return values.length > 0 && values.filter(test).length * 2 >= values.length;
  };
  const next = (...options: ImportField[]): Field => options.find((f) => !fields.includes(f)) ?? "";
  for (let i = 0; i < width; i++) {
    if (fields[i]) continue;
    if (most(i, isEmail)) fields[i] = next("email", "guardianEmail");
    else if (most(i, isPhone)) fields[i] = next("phone", "studentPhone");
    else if (most(i, (s) => batchNames.includes(s.trim()))) fields[i] = next("batch");
    else if (most(i, isWords)) fields[i] = next("name", "guardianName");
  }
  return { heads: isHeads, fields };
}

/** Column `i` now holds `f`; a column that held it before holds nothing (one column per kind). */
export const assign = (fields: Field[], i: number, f: Field) => fields.map((x, j) => (j === i ? f : f && x === f ? "" : x));

/** The kinds every student needs that no column holds yet. */
export const missingFields = (fields: Field[]) => REQUIRED.filter((f) => !fields.includes(f));

/** Each column's heading (when the first row is headings) and its first two values, to show while choosing. */
export const columnInfo = (grid: string[][], heads: boolean) =>
  Array.from({ length: Math.max(0, ...grid.map((r) => r.length)) }, (_, i) => ({
    heading: heads ? (grid[0]?.[i] ?? "").trim() : "",
    samples: (heads ? grid.slice(1) : grid)
      .map((r) => (r[i] ?? "").trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => (s.length > 40 ? `${s.slice(0, 39)}…` : s)),
  }));

/** The table's rows as students, using what each column holds; empty rows are left out. */
export const gridToRecords = (grid: string[][], fields: Field[], heads: boolean): ImportRecord[] =>
  (heads ? grid.slice(1) : grid).filter((r) => r.some((c) => c?.trim())).map((r) => Object.fromEntries(fields.flatMap((f, i) => (f ? [[f, (r[i] ?? "").trim()]] : []))));

/**
 * Each row checked with the enrol form's rules against the students already there and the rows before it (two rows
 * with one Gmail: the second is flagged). A row without a batch goes into `defaultBatch`. `firstLine`: the number of
 * the first row as the person sees it (2 in a sheet, under its headings).
 */
export function checkRows(records: ImportRecord[], defaultBatch: string, batchNames: string[], existing: { id: number; email: string; guardianEmail: string }[], firstLine = 2): ImportRow[] {
  const accepted = [...existing];
  return records.map((r, i) => {
    const input = { name: r.name ?? "", email: r.email ?? "", guardianName: r.guardianName ?? "", guardianEmail: r.guardianEmail ?? "", phone: fixPhone(r.phone), studentPhone: fixPhone(r.studentPhone) || undefined, batch: r.batch && batchNames.includes(r.batch) ? r.batch : defaultBatch, school: r.school, address: r.address };
    const problems: ImportProblem[] = Object.values(validateStudent(input, accepted)).filter((e) => e !== undefined);
    if (r.batch && !batchNames.includes(r.batch)) problems.push({ unknownBatch: r.batch });
    if (!problems.length) accepted.push({ id: -1 - i, email: input.email, guardianEmail: input.guardianEmail });
    return { line: i + firstLine, input, problems };
  });
}

/** The rows that need fixing, as a sheet in the template's columns: fixed in Excel, it can be imported again. */
export const rowsToFix = (rows: ImportRow[]) => [
  TEMPLATE_HEADER,
  ...rows.filter((r) => r.problems.length).map(({ input: s }) => [s.name, s.email, s.guardianName, s.guardianEmail, s.phone, s.studentPhone ?? "", s.batch, s.school ?? "", s.address ?? ""]),
];
