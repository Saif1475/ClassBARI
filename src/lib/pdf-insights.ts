// Premium highlighted PDFs: the parts that are plain logic (tested in scripts/pdf-insights.test.mjs).
import { extractKeywords, keySentences } from "./keywords.ts";

export type HighlightType = "term" | "definition" | "formula" | "exam";
export type Highlight = { page: number; text: string; type: HighlightType; hidden?: boolean };
export type PdfPage = { n: number; scanned: boolean; text: string };

/** A page with almost no text layer is a scan or photo: its text has to be read from the image. */
export const isScanned = (text: string) => text.replace(/\s+/g, "").length < 30;

const FORMULA = /[=∝→≈≤≥]|\b\w+\s*\/\s*\w+\b|\^\d/;
const DEFINITION = /\b(is called|is known as|is defined as|refers to|means)\b|বলে|বলা হয়|সংজ্ঞা/i;

/**
 * Highlights without AI (used until an AI key is set, and if the AI fails): key terms that repeat across the
 * chapter, plus sentences that look like formulas, definitions or important points, on the page they appear.
 */
export function basicHighlights(pages: PdfPage[]): Highlight[] {
  const all = pages.map((p) => p.text).join("\n");
  const terms = extractKeywords(all, 12).map((k) => k.term);
  const important = new Set(keySentences(all, extractKeywords(all, 25), 12));
  const out: Highlight[] = [];
  for (const p of pages) {
    const lower = p.text.toLowerCase();
    for (const term of terms) if (lower.includes(term.toLowerCase())) out.push({ page: p.n, text: term, type: "term" });
    for (const s of p.text.split(/(?<=[.!?।])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 8 && x.length < 300)) {
      if (FORMULA.test(s)) out.push({ page: p.n, text: s, type: "formula" });
      else if (DEFINITION.test(s)) out.push({ page: p.n, text: s, type: "definition" });
      else if (important.has(s)) out.push({ page: p.n, text: s, type: "exam" });
    }
  }
  return dedupe(out);
}

/** One highlight per (page, text); keep AI output tidy too. */
export function dedupe(list: Highlight[]) {
  const seen = new Set<string>();
  return list.filter((h) => {
    const k = `${h.page}|${h.text.trim().toLowerCase()}`;
    if (!h.text.trim() || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Who sees the highlighted version: staff of a premium institute (teachers preview it), and students of a premium
 * institute whose premium hasn't run out. Guardians and everyone else: no.
 */
export function canSeeInsights(role: string, institutePremium: boolean, premiumUntil: string | undefined, today: string) {
  if (!institutePremium) return false;
  if (role === "owner" || role === "manager" || role === "teacher") return true;
  return role === "student" && !!premiumUntil && premiumUntil >= today;
}

/** Where a highlight's text sits in a page's text (spaces and case ignored): [start, end) or null. */
export function findInText(page: string, phrase: string): [number, number] | null {
  // Spaces are left out on both sides: PDFs often split words ("de fi ned") and put spaces before full stops.
  const norm: number[] = []; // index in `page` of each kept character
  let flat = "";
  for (let i = 0; i < page.length; i++) {
    if (/\s|\u0000/.test(page[i])) continue;
    flat += page[i].toLowerCase();
    norm.push(i);
  }
  const needle = phrase.toLowerCase().replace(/[\s\u0000]+/g, "");
  const at = needle ? flat.indexOf(needle) : -1;
  return at < 0 ? null : [norm[at], norm[at + needle.length - 1] + 1];
}

// ---- reading a PDF with Gemini (Google's Interactions API) ------------------------------------------------------
// Used when the server has a Gemini key and no Claude key. Kept here, free of server imports, so it can be tested.
const GEMINI_SHAPE = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page: { type: "integer" },
          transcript: { type: "string" },
          highlights: { type: "array", items: { type: "object", properties: { text: { type: "string" }, type: { type: "string", enum: ["term", "definition", "formula", "exam"] } }, required: ["text", "type"] } },
        },
        required: ["page", "transcript", "highlights"],
      },
    },
  },
  required: ["pages"],
};
/** The request that sends the PDF itself (so scanned and Bangla pages are read from the image) and asks for JSON back. */
export const geminiPdfAsk = (model: string, rules: string, pdfBase64: string, note: string) => ({
  model,
  system_instruction: rules,
  input: [
    { type: "document", data: pdfBase64, mime_type: "application/pdf" },
    { type: "text", text: note },
  ],
  response_format: { type: "text", mime_type: "application/json", schema: GEMINI_SHAPE },
  generation_config: { max_output_tokens: 32000 },
  store: false, // the teacher's PDF and the answer are not kept on Google's side afterwards
});
type GeminiOut = { status?: string; steps?: { type?: string; content?: { type?: string; text?: string }[] }[]; usage?: { total_input_tokens?: number; total_output_tokens?: number; total_thought_tokens?: number } };
/** The answer's text and what it cost in tokens (thinking is paid as output). `done` is false when it was cut short or failed. */
export function geminiAnswer(out: GeminiOut) {
  const text = (out.steps ?? []).flatMap((s) => (s.type === "model_output" ? (s.content ?? []) : [])).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
  const u = out.usage ?? {};
  return { text, done: out.status === "completed" && !!text, status: out.status ?? "no status", usage: { input_tokens: u.total_input_tokens ?? 0, output_tokens: (u.total_output_tokens ?? 0) + (u.total_thought_tokens ?? 0) } };
}

/** How long the AI may take to read a PDF: a minute, plus 5 seconds a page, at most 5 minutes. */
export const aiSeconds = (pages: number) => Math.min(300, 60 + 5 * pages);
/**
 * When a PDF still "being read" counts as stuck and is started again: the longest the AI may take plus a minute
 * (3 minutes before its pages are known). A PDF that failed is tried again after 10 minutes.
 */
export const stuckAfterMs = (status: string, pages: number) => (status === "failed" ? 10 * 60 : pages ? aiSeconds(pages) + 60 : 180) * 1000;
/** Without the "null" character PDFs often hold: the database refuses text that has one. */
export const clean = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/\\u0000/g, ""));

// ---- finding Bangla in a PDF whose Bangla text is stored scrambled ------------------------------------------------
// Many PDFs (Word, Chrome, most Bangla fonts) store Bangla in drawing order, not reading order: vowel signs come
// before their letter ("িশখন" for "শিখন") and joined letters are often stored as unknown characters (\u0000). So
// a Bangla phrase is looked for by its letters only (vowel signs, hasanta and marks left out on both sides), and
// an unknown character on the page may stand for up to three letters of the phrase.
const SIGN = /[ঁ-ঃ়া-্ৗ]/; // ঁ ং ঃ, nukta, vowel signs, hasanta
const KEEP = /[অ-হৎড়-য়০-৯\p{L}\p{N}]/u;
// NFD first: "য়" is stored either as one character or as য with a dot below; both become য here.
// A রেফ (র with hasanta, drawn on top of the next letter: সামর্থ্য) is stored elsewhere by many PDFs: left out here,
// and a র on the page may be passed over while matching.
const skeleton = (s: string) => [...s.normalize("NFD").replace(/\u09B0\u09CD/g, "")].filter((c) => !SIGN.test(c) && KEEP.test(c)).join("").toLowerCase();

/** Where a highlight's text is on the page: exactly (spaces ignored), or for Bangla by its letters. */
export function locate(page: string, phrase: string): [number, number] | null {
  const exact = findInText(page, phrase);
  if (exact || !/[ঀ-৿]/.test(phrase)) return exact;
  const want = skeleton(phrase);
  // Which of the phrase's letters are part of a joined letter (next to a hasanta: ক্ত, স্ক): only those may be
  // hidden in one of the PDF's unknown characters.
  const joined: boolean[] = [];
  const chars = [...phrase.normalize("NFD").replace(/\u09B0\u09CD/g, "")];
  chars.forEach((c, i) => {
    if (SIGN.test(c) || !KEEP.test(c)) return;
    const next = chars.slice(i + 1).find((x) => x === "\u09CD" || KEEP.test(x));
    const prev = [...chars.slice(0, i)].reverse().find((x) => x === "\u09CD" || KEEP.test(x));
    joined.push(next === "\u09CD" || prev === "\u09CD");
  });
  if (want.length < 2) return null;
  // The page's letters (an unknown character kept as a gap), with where each one is in the page's text.
  const at: number[] = [];
  let flat = "";
  for (let i = 0; i < page.length; i++) {
    for (const c of page[i].normalize("NFD")) {
      if (c === "\u0000" ? flat.endsWith("\u0000") : SIGN.test(c) || !KEEP.test(c)) continue; // several unknowns in a row: one gap
      flat += c === "\u0000" ? c : c.toLowerCase();
      at.push(i);
    }
  }
  // Match from position p of the page against the phrase from q. A gap stands for 0 to 2 of the phrase's letters (a
  // joined letter); more than half of the phrase's letters must be real matches, so a gap can't make a match by itself.
  const need = want.length <= 3 ? 1 : Math.max(2, Math.ceil(want.length * 0.55)); // a short word like শক্তি may be mostly unknown letters
  const from = (p: number, q: number, real: number, steps: number): number => {
    if (q === want.length) return real >= need ? p : -1;
    if (p >= flat.length || steps > 4000) return -1;
    if (flat[p] === "\u0000") {
      for (let k = Math.min(2, want.length - q); k >= 0; k--) { // the gap takes as much as it can first: a match never runs into the next word
        if (joined.slice(q, q + k).some((j) => !j)) continue; // a gap hides joined letters only
        const end = from(p + 1, q + k, real, steps + 1);
        if (end >= 0) return end;
      }
      return -1;
    }
    if (flat[p] === want[q]) return from(p + 1, q + 1, real + 1, steps + 1);
    return flat[p] === "\u09B0" && q > 0 ? from(p + 1, q, real, steps + 1) : -1; // a রেফ stored out of place
  };
  // Starting on the phrase's first letter is tried everywhere first; starting on a gap (a phrase that begins with a
  // joined letter, like স্ক) only when that finds nothing.
  for (const onGap of [false, true])
    for (let p = 0; p < flat.length; p++) {
      if (onGap ? flat[p] !== "\u0000" : flat[p] !== want[0]) continue;
      const end = from(p, 0, 0, 0);
      if (end <= p) continue;
      const range: [number, number] = [at[p], at[end - 1] + 1];
      // A match never crosses a comma or full stop the phrase doesn't have (it would run into the next words).
      if (/[,।;:?!]/.test(page.slice(...range)) && !/[,।;:?!]/.test(phrase)) continue;
      return range;
    }
  return null;
}
