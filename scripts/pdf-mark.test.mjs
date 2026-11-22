// Run: npm test — highlights are written into the teacher's own PDF as real highlight marks; nothing else changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { highlightPdf, highlightRects, joinLines, wholeWords } from "../src/lib/pdf-mark.ts";

async function sample() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Speed is defined as the distance travelled per unit time.", { x: 50, y: 760, size: 12, font });
  page.drawText("The formula for speed is v = d / t.", { x: 50, y: 740, size: 12, font });
  doc.addPage([595, 842]).drawText("Second page.", { x: 50, y: 760, size: 12, font });
  return doc.save();
}

test("each highlight becomes a highlight mark over its words; pages and text stay as they were", async () => {
  const pdf = await sample();
  const hl = [
    { page: 1, text: "Speed is defined as the distance travelled per unit time.", type: "definition" },
    { page: 1, text: "v = d / t", type: "formula" },
    { page: 1, text: "not on the page", type: "term" },
    { page: 2, text: "Second page", type: "exam", hidden: true }, // a teacher took it out
  ];
  const rects = await highlightRects(pdf, hl);
  assert.deepEqual(rects.map((r) => r.type), ["definition", "formula"]);
  const [x0, y0, x1, y1] = rects[1].rects[0];
  assert.ok(x0 > 150 && x1 < 260 && y0 < 740 && y1 > 745, `formula sits on its words: ${rects[1].rects[0]}`);

  const out = await highlightPdf(pdf, hl);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: out, useSystemFonts: true, disableFontFace: true }).promise;
  assert.equal(doc.numPages, 2);
  const marks = await (await doc.getPage(1)).getAnnotations();
  assert.deepEqual(marks.map((a) => a.subtype), ["Highlight", "Highlight"]);
  assert.deepEqual((await (await doc.getPage(2)).getAnnotations()).length, 0);
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
  assert.match(text, /Speed is defined as the distance travelled per unit time\./); // the words are untouched
});

test("word pieces on one line join into one band; separate lines stay separate", () => {
  const out = joinLines([[50, 100, 80, 112], [82, 100, 120, 112], [50, 80, 90, 92]]);
  assert.deepEqual(out, [[50, 100, 120, 112], [50, 80, 90, 92]]);
});

test("a mark is widened to whole words, never cut inside one", () => {
  const t = "Force is a vector quantity, because it has direction; inertia";
  assert.deepEqual(wholeWords(t, [2, 8]), [0, 8]); // "rce is" -> "Force is"
  assert.deepEqual(wholeWords(t, [43, 51]), [43, 52]); // "directio" -> "direction"
  assert.equal(t.slice(...wholeWords(t, [28, 35])), "because");
});
