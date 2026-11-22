// Run: npm run check:ai                       asks every AI chat model that is switched on one question and one photo question
//      npm run check:ai -- path/to/file.pdf   also puts that PDF into the test institute as a lesson and reports how it was read and marked
// Everything goes through the website on port 3000 as the test people (npm run test:accounts, npm run test:lessons), so
// it checks exactly what users get. It never reads or prints an AI key: the keys stay inside the running website.
// Costs real (small) money on the AI accounts: a few short questions, and one reading of the PDF the first time it is given.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { findInText, isScanned } from "../src/lib/pdf-insights.ts";
import { as, finish, INSTITUTE } from "./test-login.mjs";

const pdfFile = process.argv[2];
const TRAILER = "\u001e"; // ends a streamed chat answer; JSON follows it
const CHAPTER = "Chapter 1: Motion";
let bad = 0;
const say = (line = "") => console.log(line);
const fail = (line) => (bad++, say(`  ✗ ${line}`));

// ---- chat models ------------------------------------------------------------------------------------------------
say("AI chat models (asked through the website as the test student)");
const owner = await as("owner");
const pupil = (await owner.data()).students.find((s) => s.email === "cb.s@gmail.com");
if (!pupil?.premiumUntil) throw new Error("The test student has no AI pack. Run: npm run test:accounts");
const packWas = pupil.aiPack;
await owner.send("setStudentPremium", [pupil.id, pupil.premiumUntil, 1500]); // the biggest pack for a moment, so every model can be asked
try {
  const student = await as("student");
  const menu = await student.call("/api/ai/assistant");
  if (menu.status !== 200) throw new Error(`The model list was refused (${menu.status}).`);
  const models = JSON.parse(menu.text).models;
  const photo = `data:image/png;base64,${(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200"><rect width="480" height="200" fill="#fff"/><text x="240" y="125" text-anchor="middle" font-family="DejaVu Sans, Arial" font-size="72" fill="#111">7 × 8 = ?</text></svg>`)).png().toBuffer()).toString("base64")}`;
  const ask = async (model, content, image) => {
    const r = await student.call("/api/ai/assistant", { messages: [{ role: "user", content }], model, fresh: true, ...(image ? { image } : {}) }); // fresh: always the AI itself, never a saved answer
    const [answer, tail] = r.text.split(TRAILER);
    let info = {};
    try {
      info = JSON.parse(tail ?? r.text);
    } catch {
      /* no trailer: an error answer */
    }
    return { ok: r.status === 200 && !info.error && !info.declined && !!answer?.trim(), answer: (answer ?? "").trim().replace(/\s+/g, " "), why: r.status !== 200 ? `refused (${r.status} ${info.error ?? ""})` : info.declined ? "the model declined" : "no answer came back", ms: r.ms, left: info.left };
  };
  const ready = models.filter((m) => !m.soon && !m.locked);
  for (const m of models.filter((x) => x.soon)) say(`  – ${m.label}: not switched on (no key for it on the server)`);
  if (!ready.length) fail("No chat model is switched on. Add GEMINI_API_KEY and/or OPENAI_API_KEY to .env.local and restart the website.");
  for (const m of ready) {
    const text = await ask(m.id, "What is the capital of Bangladesh? Answer in one word.");
    if (text.ok && /dhaka|ঢাকা/i.test(text.answer)) say(`  ✓ ${m.label}: answered a question in ${(text.ms / 1000).toFixed(1)} s — "${text.answer.slice(0, 60)}"`);
    else fail(`${m.label}: question ${text.ok ? `answered wrongly: "${text.answer.slice(0, 80)}"` : `failed: ${text.why}`}`);
    const seen = await ask(m.id, "What number is the answer to the sum in this picture? Reply with the number only.", photo);
    if (seen.ok && /56|৫৬/.test(seen.answer)) say(`  ✓ ${m.label}: read a photo in ${(seen.ms / 1000).toFixed(1)} s — "${seen.answer.slice(0, 40)}"${typeof seen.left === "number" ? ` (${seen.left}% of the test student's allowance left)` : ""}`);
    else fail(`${m.label}: photo ${seen.ok ? `read wrongly: "${seen.answer.slice(0, 80)}"` : `failed: ${seen.why}`}`);
  }
} finally {
  await owner.send("setStudentPremium", [pupil.id, pupil.premiumUntil, packWas]); // back to the pack it had
}

// ---- one PDF: read (scanned pages too) and marked -----------------------------------------------------------------
if (pdfFile) {
  say();
  say(`PDF: ${basename(pdfFile)}`);
  const bytes = readFileSync(resolve(pdfFile));
  // What is in the file, read here the same way the server reads it (to know the scanned pages and where highlights should sit).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+\n/g, "\n").trim();
    pages.push({ n, text, scanned: isScanned(text) });
  }
  const scans = pages.filter((p) => p.scanned).map((p) => p.n);
  say(`  ${pages.length} pages, ${(bytes.length / 1048576).toFixed(1)} MB; ${scans.length ? `pages with no text of their own (scans or photos): ${scans.join(", ")}` : "every page has its own text"}`);
  if (pages.length > 100 || bytes.length > 20 * 1048576) fail("Over 100 pages or 20 MB: the AI is not used for files this big (they get the basic marks only).");

  const teacher = await as("teacher");
  const title = `AI check: ${basename(pdfFile)}`;
  let state = await teacher.data();
  const chapter = state.modules.find((m) => m.title === CHAPTER);
  if (!chapter) throw new Error("The test institute has no sample chapter. Run: npm run test:lessons");
  let lesson = chapter.items.find((it) => it.kind === "pdf" && it.title === title);
  if (lesson) say("  This file was checked before: showing the result that was saved then (nothing is paid again).");
  else {
    const slot = await teacher.call("/api/files", {});
    if (slot.status !== 200) throw new Error(`The upload was refused (${slot.status}).`);
    const { path, token, url } = JSON.parse(slot.text);
    // The two public Supabase values, the same ones the website sends to every browser.
    const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]));
    const up = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }).storage.from("files").uploadToSignedUrl(path, token, bytes, { contentType: "application/pdf" });
    if (up.error) throw new Error(`The upload failed: ${up.error.message}`);
    state = await teacher.send("addModuleItem", [chapter.id, { kind: "pdf", title, meta: `${pages.length} pages`, url }]);
    lesson = state.modules.find((m) => m.id === chapter.id).items.find((it) => it.title === title);
  }
  const started = Date.now();
  let got;
  for (;;) {
    const r = await teacher.call(`/api/pdf-insights?file=${encodeURIComponent(lesson.url)}`);
    if (r.status === 403) {
      fail(`${INSTITUTE} is not a premium institute, so its PDFs are not read. Switch premium on for it on the /admin page, then run this again.`);
      break;
    }
    got = r.status === 200 ? JSON.parse(r.text) : { status: `refused (${r.status})` };
    if (!["queued", "processing"].includes(got.status) && !got.improving) break; // basic highlights first: wait for the AI's
    if (Date.now() - started > 8 * 60_000) break;
    await new Promise((wait) => setTimeout(wait, 4000));
  }
  if (got && got.status !== "ready") fail(`The PDF was not read: ${got.status}. The website's log says why.`);
  if (got?.status === "ready") {
    say(`  Read in about ${Math.round((Date.now() - started) / 1000)} s. Marked by: ${got.source === "ai" ? "the AI" : "the basic, non-AI marker"}`);
    if (got.source !== "ai") fail("The AI did not read this PDF (no key for it, the monthly AI budget is used up, or the AI call failed — the website's log says which).");
    // Scanned pages: did the AI read their text?
    for (const n of scans) {
      const read = got.scanned.find((p) => p.n === n)?.text ?? "";
      if (read.replace(/\s+/g, "").length >= 30) say(`  ✓ page ${n} (scan): ${read.length} characters read — "${read.replace(/\s+/g, " ").slice(0, 70)}…"`);
      else fail(`page ${n} (scan): no text was read from the picture`);
    }
    // Highlights: how many, of which kind, and can each one be found on its page (only those can be drawn there)?
    const kinds = { term: 0, definition: 0, formula: 0, exam: 0 };
    let found = 0;
    const lost = [];
    for (const h of got.highlights) {
      kinds[h.type]++;
      const page = pages.find((p) => p.n === h.page);
      const text = page?.scanned ? (got.scanned.find((p) => p.n === h.page)?.text ?? "") : (page?.text ?? "");
      if (findInText(text, h.text)) found++;
      else lost.push(h);
    }
    const all = got.highlights.length;
    say(`  ${all} highlights: ${kinds.term} key terms, ${kinds.definition} definitions, ${kinds.formula} formulas, ${kinds.exam} exam points`);
    if (!all) fail("No highlights at all.");
    else if (found / all >= 0.85) say(`  ✓ ${found} of ${all} highlights sit exactly on their page's text (those are the ones drawn on the page)`);
    else fail(`Only ${found} of ${all} highlights can be found on their page's text; the rest cannot be drawn on the page.`);
    const bare = pages.filter((p) => !got.highlights.some((h) => h.page === p.n)).map((p) => p.n);
    if (bare.length) say(`  Pages with nothing marked: ${bare.join(", ")}`);
    for (const type of Object.keys(kinds)) {
      const one = got.highlights.find((h) => h.type === type);
      if (one) say(`    ${type}, page ${one.page}: "${one.text.replace(/\s+/g, " ").slice(0, 90)}"`);
    }
    for (const h of lost.slice(0, 3)) say(`    not found on page ${h.page}: "${h.text.replace(/\s+/g, " ").slice(0, 90)}"`);
    say(`  To look at it: log in on the website as the test teacher or student and open the lesson "${title}".`);
  }
}

await finish();
say();
say(bad ? `${bad} problem(s) found.` : "All checks passed.");
process.exit(bad ? 1 : 0);
