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

test("a stuck PDF is started again sooner when it is short; the AI's time limit grows with the pages", async () => {
  const { aiSeconds, stuckAfterMs } = await import("../src/lib/pdf-insights.ts");
  assert.equal(aiSeconds(2), 70);
  assert.equal(aiSeconds(100), 300); // never more than 5 minutes
  assert.equal(stuckAfterMs("processing", 2), 130_000); // a 2-page PDF: just over 2 minutes, not 10
  assert.equal(stuckAfterMs("processing", 0), 180_000); // pages not read yet
  assert.equal(stuckAfterMs("failed", 2), 600_000);
});

test("text with a 'null' character can be saved (the database refuses it otherwise)", async () => {
  const { clean } = await import("../src/lib/pdf-insights.ts");
  assert.deepEqual(clean({ text: "a\u0000b", list: ["\u0000x"] }), { text: "ab", list: ["x"] });
});

test("Bangla stored scrambled in a PDF is still found by its letters", async () => {
  const { locate } = await import("../src/lib/pdf-insights.ts");
  // How the test chapter's text comes out of the PDF: vowel signs before their letter, joined letters unknown.
  const page = "চ ত\u0000 থ\u0000   অ ধ\u0000া য় :   কা জ, ক্ষম তা   ও শ \u0000\u0000 \nিশ খনফল।   এই অ ধ\u0000া য়   প েড়   ত\u0000 িম   কা জ, ক্ষম তা   ও শ \u0000\u0000 র অ থ\u0000";
  const hit = locate(page, "কাজ, ক্ষমতা ও শক্তি");
  assert.ok(hit, "found");
  assert.equal(page.slice(...hit).replace(/\s+/g, ""), "কাজ,ক্ষমতাওশ\u0000"); // its place on the page, up to the unknown joined letter of শক্তি
  assert.ok(locate(page, "শিখনফল"));
  assert.equal(locate(page, "বিদ্যুৎশক্তি"), null); // not on this page
  assert.deepEqual(locate("Force equals mass", "equals"), [6, 12]); // English: exactly as before
});

test("Bangla: either way of writing য় matches, and a phrase may start with an unknown joined letter", async () => {
  const { locate } = await import("../src/lib/pdf-insights.ts");
  const page = "\u0000কা েনা   বস্তুর ওপর বল প্র েয়া েগ র ফ েল   য িদ ।  কাজ এক\u0000 \u0000লা র রা িশ ।";
  assert.ok(locate(page, "প্রয়োগের"), "য় written as one character");
  assert.ok(locate(page, "প্রয়োগের"), "য় written as য with a dot");
  assert.ok(locate(page, "স্কেলার রাশি"), "starts with a joined letter the PDF doesn't know");
});

test("Bangla: a রেফ stored out of place still matches", async () => {
  const { locate } = await import("../src/lib/pdf-insights.ts");
  assert.ok(locate("কাজ করা র সাম থ\u0000\u0000 র েক শ\u0000\u0000 ব েল ।", "কাজ করার সামর্থ্যকে শক্তি বলে।"));
});

test("Bangla: a short word is not 'found' in unrelated text through the PDF's unknown letters", async () => {
  const { locate } = await import("../src/lib/pdf-insights.ts");
  const page = "শক্তি র অ থ\u0000 ব\u0000া খ\u0000া কর েত পা র েব ।  \n৪.৩ শ\u0000\u0000 \nকাজ করা র সাম থ\u0000\u0000 র েক শ\u0000\u0000 ব েল ।";
  const hit = locate(page, "কাজ করার সামর্থ্যকে শক্তি বলে।");
  assert.ok(hit && page.slice(...hit).startsWith("কাজ"), "the definition starts at its own first word, not on the heading above");
  assert.equal(locate("এই অধ\u0000া য় প েড় ত\u0000 িম কা জ", "গতিশক্তি"), null);
});

test("Bangla: a word ending in a joined letter is marked up to its end, not into the next word", async () => {
  const { locate } = await import("../src/lib/pdf-insights.ts");
  const page = "যেমন যা \u0000\u0000ক শ\u0000\u0000 , তা পশ\u0000\u0000 ।";
  const hit = locate(page, "শক্তি");
  assert.ok(hit);
  assert.ok(!page.slice(...hit).includes("তা"), page.slice(...hit));
});

test("Bangla: an unknown character stands only for joined letters (ওয়াট is not found in 'হলেও \\0েয়াল')", async () => {
  const { locate } = await import("../src/lib/pdf-insights.ts");
  assert.equal(locate("ক্লা\u0000 হ েলও \u0000 েয়া ল না সর েল", "ওয়াট"), null);
  assert.ok(locate("ক্ষমতা র একক ওয়া ট।", "ওয়াট"));
  assert.ok(locate("ক্ষম তা   ও শ \u0000\u0000 \n", "শক্তি"));
});
