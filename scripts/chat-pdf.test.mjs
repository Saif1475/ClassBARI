// Run: npm test — an AI chat as a PDF: what is accepted, that chat text can't inject HTML, and that Bangla makes a real PDF.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chatHtml, closePdfBrowser, htmlToPdf, pdfTurns, richHtml } from "../src/lib/chat-pdf.ts";

test("only a sensible chat is accepted", () => {
  assert.equal(pdfTurns([]), null);
  assert.equal(pdfTurns([{ role: "system", content: "x" }]), null);
  assert.equal(pdfTurns([{ role: "user", content: "x".repeat(300_001) }]), null);
  assert.deepEqual(pdfTurns([{ role: "user", content: "hi", photo: true, extra: 1 }]), [{ role: "user", content: "hi", photo: true }]);
});

test("a long chat keeps its newest turns instead of failing", () => {
  const long = Array.from({ length: 202 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
  const got = pdfTurns(long);
  assert.equal(got.length, 200);
  assert.equal(got[0].content, "2");
  assert.equal(got.at(-1).content, "201");
  const big = pdfTurns([{ role: "user", content: "old" }, { role: "assistant", content: "x".repeat(200_000) }, { role: "user", content: "y".repeat(200_000) }]);
  assert.deepEqual(big.map((t) => t.content.length), [200_000]);
});

test("chat text is shown, never run: no HTML gets through", () => {
  const html = richHtml('<img src=x onerror=alert(1)> **bold** `a<b`\n```\n<script>x</script>\n```');
  assert.ok(!html.includes("<img") && !html.includes("<script>"));
  assert.ok(html.includes("<strong>bold</strong>") && html.includes("&lt;script&gt;"));
  const page = chatHtml({ title: "</title><script>", turns: [{ role: "user", content: "<b>x</b>" }], you: "You", ai: "AI", photo: "Photo", note: "n", date: "d" });
  assert.ok(!page.includes("<script>") && !page.includes("<b>x</b>"));
});

test("a Bangla chat becomes a PDF file", { timeout: 60_000 }, async () => {
  const pdf = await htmlToPdf(chatHtml({ title: "নিউটনের সূত্র", turns: [{ role: "user", content: "ক্ষ, ত্র, জ্ঞ বোঝাও" }, { role: "assistant", content: "## উত্তর\n- **বল** = ভর × ত্বরণ" }], you: "তুমি", ai: "Instanton AI", photo: "ছবি", note: "AI ভুল করতে পারে।", date: "২৩ নভেম্বর ২০২৬" }));
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
  assert.ok(pdf.length > 5000);
  await closePdfBrowser(); // the shared browser would otherwise keep the test run open
});

test("code blocks are dark text on a light box (readable on screen and in print)", () => {
  const page = chatHtml({ title: "t", turns: [{ role: "assistant", content: "```js\nconst a = 1;\n```" }], you: "You", ai: "AI", photo: "", note: "", date: "" });
  const pre = page.match(/pre\{[^}]*\}/)[0];
  assert.ok(/background:#f/.test(pre) && /color:#1a1c1b/.test(pre), pre);
  assert.ok(/pre code\{background:none/.test(page)); // inline-code grey doesn't cover the block's text
});
