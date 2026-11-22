// The teacher's own PDF, unchanged, with the highlights written into it as real PDF highlight marks (the kind any
// PDF app shows, prints, and lets a teacher delete). Text stays selectable; nothing else on the page changes.
// Where each highlight sits is found from the page's own text (pdf.js), exactly as the server read it.
import { PDFDocument, PDFName, PDFString, StandardFonts, type PDFContext } from "pdf-lib";
import { locate, type Highlight, type HighlightType } from "./pdf-insights.ts";

/** The highlighter colours (as on the website): yellow terms, green definitions, blue formulas, orange exam points. */
const RGB: Record<HighlightType, [number, number, number]> = { term: [1, 0.878, 0.4], definition: [0.698, 0.949, 0.733], formula: [0.647, 0.847, 1], exam: [1, 0.753, 0.471] };
const LABEL: Record<HighlightType, string> = { term: "Key term", definition: "Definition", formula: "Formula", exam: "Exam point" };

type Rect = [number, number, number, number]; // x0, y0, x1, y1 in the page's own units

/** For each page: the rectangles each highlight covers (none for scanned pages: their words are part of a picture). */
export async function highlightRects(pdf: Uint8Array, highlights: Highlight[]) {
  const pdfjs = (await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: true, disableFontFace: true });
  const doc = await task.promise;
  const out: { page: number; type: HighlightType; rects: Rect[] }[] = [];
  const at = await letterX();
  for (let n = 1; n <= doc.numPages; n++) {
    const mine = highlights.filter((h) => h.page === n && !h.hidden);
    if (!mine.length) continue;
    const content = await (await doc.getPage(n)).getTextContent();
    // The same text the server read, with where each piece of it sits.
    let text = "";
    const spans: { a: number; b: number; x: number; y: number; w: number; h: number }[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const a = text.length;
      text += it.str + (it.hasEOL ? "\n" : " ");
      spans.push({ a, b: a + it.str.length, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.hypot(it.transform[2], it.transform[3]) });
    }
    // How wide this PDF's font is compared with the standard one: measured on lines that are not stretched (shorter
    // than the page's full lines, like the last line of a paragraph), so stretched lines can be worked out.
    const full = Math.max(...spans.map((s) => s.w));
    const ratios = spans.filter((s) => s.w < full * 0.85 && s.b - s.a > 8).map((s) => s.w / (s.h * at.natural(text.slice(s.a, s.b)))).sort((x, y) => x - y);
    const fontScale = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0;
    // Marks of one kind that overlap become one ("law of inertia" and "inertia"): a doubled mark looks darker.
    const ranges: { type: HighlightType; a: number; b: number }[] = [];
    for (const h of mine) {
      const found = locate(text, h.text);
      if (!found) continue; // not on the page's text (a scanned page, or text the PDF stores scrambled)
      const [a, b] = wholeWords(text, found);
      const same = ranges.find((r) => r.type === h.type && r.a < b && a < r.b);
      if (same) [same.a, same.b] = [Math.min(same.a, a), Math.max(same.b, b)];
      else ranges.push({ type: h.type, a, b });
    }
    for (const r of ranges) {
      const rects: Rect[] = [];
      for (const s of spans) {
        const from = Math.max(r.a, s.a), to = Math.min(r.b, s.b);
        if (from >= to || s.b === s.a) continue;
        const piece = text.slice(s.a, s.b);
        const x0 = s.x + at.x(piece, s.w, s.h * fontScale, from - s.a), x1 = s.x + at.x(piece, s.w, s.h * fontScale, to - s.a);
        // A little extra each side keeps a word's first and last letters inside the mark.
        const pad = s.h * 0.12;
        rects.push([x0 - (from === r.a ? pad : 0), s.y - s.h * 0.22, x1 + (to === r.b ? pad : 0), s.y + s.h * 0.92]);
      }
      if (rects.length) out.push({ page: n, type: r.type, rects: joinLines(rects) });
    }
  }
  await task.destroy();
  return out;
}

/**
 * Where the i-th letter of a line starts, from the line's start (a PDF tells where a line starts and how wide it is,
 * not where each letter is). Letter widths come from a standard font; what is left over is the stretch justified
 * text puts in its spaces. Unknown letters (Bangla) count as half a letter-height wide.
 */
async function letterX() {
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const cache = new Map<string, number>();
  const width = (ch: string) => {
    let w = cache.get(ch);
    if (w === undefined) {
      try {
        w = font.widthOfTextAtSize(ch, 1);
      } catch {
        w = 0.5;
      }
      cache.set(ch, w);
    }
    return w;
  };
  const natural = (line: string) => [...line].reduce((x, c) => x + width(c), 0);
  /** `size`: the font's width per letter-height (0 when unknown: then the letters share the line's width evenly by their widths). */
  const x = (line: string, lineWidth: number, size: number, i: number) => {
    const chars = [...line];
    const ws = chars.map(width);
    const sum = ws.reduce((p, q) => p + q, 0);
    const spaces = chars.filter((c) => c === " ").length;
    const stretch = size ? lineWidth - sum * size : 0;
    // Wider than its letters, with spaces: justified, and the extra goes into the spaces. Otherwise all letters share it.
    const perSpace = spaces && stretch > 0 ? stretch / spaces : 0;
    const scale = perSpace ? size : sum ? lineWidth / sum : 0;
    let pos = 0;
    chars.slice(0, i).forEach((c, k) => (pos += ws[k] * scale + (c === " " ? perSpace : 0)));
    return pos;
  };
  return { natural, x };
}

/** A found range widened to whole words (a highlight never starts or ends inside a word). */
export function wholeWords(text: string, [a, b]: [number, number]): [number, number] {
  const inWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}\p{M}]/u.test(ch);
  while (a > 0 && inWord(text[a - 1]) && inWord(text[a])) a--;
  while (b < text.length && inWord(text[b]) && inWord(text[b - 1])) b++;
  return [a, b];
}

/** Pieces on the same line that touch become one band (overlaps would show a darker stripe between words). */
export function joinLines(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of [...rects].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
    const last = out.at(-1);
    const sameLine = last && Math.abs(last[1] - r[1]) < (r[3] - r[1]) * 0.3;
    if (last && sameLine && r[0] <= last[2] + (r[3] - r[1]) * 0.6) {
      last[0] = Math.min(last[0], r[0]);
      last[2] = Math.max(last[2], r[2]);
      last[1] = Math.min(last[1], r[1]);
      last[3] = Math.max(last[3], r[3]);
    } else out.push([...r]);
  }
  return out;
}

/** The PDF with its highlights added (the original bytes are not changed; a new file is made). */
export async function highlightPdf(pdf: Uint8Array, highlights: Highlight[]) {
  const marks = await highlightRects(pdf, highlights);
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const pages = doc.getPages();
  const multiply = doc.context.register(doc.context.obj({ Type: "ExtGState", BM: "Multiply" })); // the colour sits under the ink, like a highlighter
  for (const m of marks) {
    const page = pages[m.page - 1];
    if (page) page.node.addAnnot(doc.context.register(annotation(doc.context, m.type, m.rects, multiply)));
  }
  return doc.save();
}

/** One highlight mark: its areas, its colour, and a drawing of it, so every PDF app shows it the same way. */
function annotation(ctx: PDFContext, type: HighlightType, rects: Rect[], multiply: ReturnType<PDFContext["register"]>) {
  const box: Rect = [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))];
  const [r, g, b] = RGB[type];
  const draw = `/GS0 gs ${r} ${g} ${b} rg ` + rects.map(([x0, y0, x1, y1]) => `${x0.toFixed(2)} ${y0.toFixed(2)} ${(x1 - x0).toFixed(2)} ${(y1 - y0).toFixed(2)} re f`).join(" ");
  const look = ctx.register(ctx.stream(draw, { Type: "XObject", Subtype: "Form", BBox: box, Resources: { ExtGState: { GS0: multiply } } }));
  return ctx.obj({
    Type: "Annot",
    Subtype: "Highlight",
    Rect: box,
    // Each area's four corners, in the order PDF apps expect: top-left, top-right, bottom-left, bottom-right.
    QuadPoints: rects.flatMap(([x0, y0, x1, y1]) => [x0, y1, x1, y1, x0, y0, x1, y0]),
    C: [r, g, b],
    F: 4, // printed with the page
    T: PDFString.of("ClassBARI"),
    Contents: PDFString.of(LABEL[type]),
    AP: { N: look },
    BM: PDFName.of("Multiply"),
  });
}
