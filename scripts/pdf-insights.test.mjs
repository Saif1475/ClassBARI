// Run: npm test — premium highlighted PDFs: fallback highlights, who may see them, finding them on a page.
import assert from "node:assert/strict";
import { test } from "node:test";
import { basicHighlights, canSeeInsights, findInText, geminiAnswer, geminiPdfAsk, isScanned } from "../src/lib/pdf-insights.ts";

const pages = [
  { n: 1, scanned: false, text: "Simple harmonic motion is called SHM. In simple harmonic motion the restoring force is proportional to displacement." },
  { n: 2, scanned: false, text: "The force is F = -kx where k is the spring constant. Simple harmonic motion appears in pendulums and springs." },
];

test("without AI, terms, definitions and formulas are still marked on the right page", () => {
  const h = basicHighlights(pages);
  assert.ok(h.some((x) => x.type === "definition" && x.page === 1 && x.text.includes("is called SHM")));
  assert.ok(h.some((x) => x.type === "formula" && x.page === 2 && x.text.includes("F = -kx")));
  assert.ok(h.some((x) => x.type === "term" && /harmonic/.test(x.text)));
  assert.equal(new Set(h.map((x) => `${x.page}|${x.text.toLowerCase()}`)).size, h.length); // no duplicates
});

test("only premium students and staff of premium institutes see highlights", () => {
  assert.equal(canSeeInsights("teacher", true, undefined, "2026-11-20"), true); // teacher preview
  assert.equal(canSeeInsights("student", true, "2026-12-31", "2026-11-20"), true);
  assert.equal(canSeeInsights("student", true, "2026-11-19", "2026-11-20"), false); // expired
  assert.equal(canSeeInsights("student", true, undefined, "2026-11-20"), false);
  assert.equal(canSeeInsights("guardian", true, "2026-12-31", "2026-11-20"), false);
  assert.equal(canSeeInsights("owner", false, undefined, "2026-11-20"), false); // institute not premium
});

test("a highlight is found in the page text, ignoring spaces and case", () => {
  const page = "The  force is\nF = -kx where k";
  const [a, b] = findInText(page, "f = -KX");
  assert.equal(page.slice(a, b), "F = -kx");
  assert.equal(findInText(page, "not there"), null);
});

test("a page with no text layer counts as scanned", () => {
  assert.equal(isScanned("  \n 12 "), true);
  assert.equal(isScanned(pages[0].text), false);
});

test("reading a PDF with Gemini: the PDF itself is sent and not kept; the answer's text and token count are read back", () => {
  const ask = geminiPdfAsk("gemini-3-flash-preview", "rules", "QUJD", "Pages 2 are scans");
  assert.deepEqual(ask.input, [{ type: "document", data: "QUJD", mime_type: "application/pdf" }, { type: "text", text: "Pages 2 are scans" }]);
  assert.equal(ask.store, false); // a teacher's PDF is not left on Google's side
  assert.equal(ask.system_instruction, "rules");
  assert.deepEqual(ask.response_format.schema.properties.pages.items.properties.highlights.items.properties.type.enum, ["term", "definition", "formula", "exam"]);
  const ok = geminiAnswer({ status: "completed", steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text: '{"pages":' }, { type: "text", text: "[]}" }] }], usage: { total_input_tokens: 900, total_output_tokens: 120, total_thought_tokens: 300 } });
  assert.deepEqual(ok, { text: '{"pages":[]}', done: true, status: "completed", usage: { input_tokens: 900, output_tokens: 420 } }); // thinking is paid as output
  assert.equal(geminiAnswer({ status: "incomplete", steps: [{ type: "model_output", content: [{ type: "text", text: '{"pa' }] }] }).done, false); // cut short: not used
  assert.deepEqual(geminiAnswer({}), { text: "", done: false, status: "no status", usage: { input_tokens: 0, output_tokens: 0 } });
});
