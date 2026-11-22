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
  const norm: number[] = []; // index in `page` of each kept character
  let flat = "";
  for (let i = 0; i < page.length; i++) {
    if (/\s/.test(page[i])) {
      if (flat && flat[flat.length - 1] !== " ") {
        flat += " ";
        norm.push(i);
      }
      continue;
    }
    flat += page[i].toLowerCase();
    norm.push(i);
  }
  const needle = phrase.toLowerCase().replace(/\s+/g, " ").trim();
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
