// Run: npm test — the AI chat's Tools: which tool flags are accepted, ==highlight== shown safely in the PDF, the
// Highlight route's checks on the PDF sent, and the non-AI highlights making a real highlighted PDF.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { chatTools, HIGHLIGHT_MAX_BYTES, highlightInput, toolsRule } from "../src/lib/chat-tools.ts";
import { richHtml } from "../src/lib/chat-pdf.ts";
import { basicHighlights } from "../src/lib/pdf-insights.ts";
import { highlightPdf, readPages } from "../src/lib/pdf-mark.ts";

test("only pdf and highlight, as true or false, are accepted as tools", () => {
  assert.deepEqual(chatTools(undefined), {});
  assert.deepEqual(chatTools({}), {});
  assert.deepEqual(chatTools({ pdf: true, highlight: true }), { pdf: true, highlight: true });
  assert.deepEqual(chatTools({ pdf: false, highlight: true }), { highlight: true });
  for (const bad of [null, "pdf", ["pdf"], { pdf: "yes" }, { pdf: 1 }, { search: true }, { pdf: true, extra: true }]) assert.equal(chatTools(bad), null, JSON.stringify(bad));
  assert.equal(toolsRule({}), "");
  assert.match(toolsRule({ pdf: true }), /document/);
  assert.match(toolsRule({ highlight: true }), /==/);
});

test("==text== is a highlight in the PDF, escaped; a == b in a sum is not", () => {
  assert.equal(richHtml("The ==law of inertia== matters"), "<p>The <mark>law of inertia</mark> matters</p>");
  const html = richHtml("==<img src=x onerror=alert(1)>== and **b** `c`");
  assert.ok(!html.includes("<img") && html.includes("<mark>&lt;img src=x onerror=alert(1)&gt;</mark>"));
  assert.ok(html.includes("<strong>b</strong>") && html.includes("<code>c</code>"));
  assert.equal(richHtml("if a == b and c == d"), "<p>if a == b and c == d</p>");
  assert.equal(richHtml("Use ==F = ma== here"), "<p>Use <mark>F = ma</mark> here</p>"); // a formula keeps its own =
  assert.ok(richHtml("```\n==x==\n```").includes("<pre><code>==x==</code></pre>")); // code stays as written
});

async function sample(pages = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText("Inertia is defined as the tendency of a body to keep its state of motion.", { x: 50, y: 760, size: 12, font });
    page.drawText("Newton's second law says F = m a for every body with inertia.", { x: 50, y: 740, size: 12, font });
  }
  return doc.save();
}

test("the Highlight route takes only a real PDF of a sensible size", async () => {
  assert.equal(highlightInput(new Uint8Array()), "empty");
  assert.equal(highlightInput(new TextEncoder().encode("hello, not a pdf")), "not pdf");
  assert.equal(highlightInput(new Uint8Array(HIGHLIGHT_MAX_BYTES + 1)), "too large");
  assert.equal(highlightInput(await sample()), null);
  assert.equal((await readPages(await sample(3))).length, 3); // the page count the route checks (at most 30)
});

test("without an AI key, the basic highlights come back as real highlight marks in the same PDF", async () => {
  const pdf = await sample();
  const pages = await readPages(pdf);
  const marks = basicHighlights(pages);
  assert.ok(marks.some((h) => h.type === "definition") && marks.some((h) => h.type === "formula"), JSON.stringify(marks));
  const out = await highlightPdf(pdf, marks);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: out, useSystemFonts: true, disableFontFace: true }).promise;
  assert.equal(doc.numPages, 1);
  const notes = await (await doc.getPage(1)).getAnnotations();
  assert.ok(notes.length >= 2 && notes.every((a) => a.subtype === "Highlight"), notes.map((a) => a.subtype).join());
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
  assert.match(text, /Inertia is defined as/); // the student's own words, untouched
});

test("Think deeper is a tool like the others: accepted, and nothing else new", async () => {
  const { chatTools } = await import("../src/lib/chat-tools.ts");
  assert.deepEqual(chatTools({ think: true }), { think: true });
  assert.deepEqual(chatTools({ think: false, pdf: true }), { pdf: true });
  assert.equal(chatTools({ think: "yes" }), null);
  assert.equal(chatTools({ reason: true }), null);
});
