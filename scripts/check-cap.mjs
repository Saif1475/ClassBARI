// Run: npm run check:cap -- --yes
// Uses up the test student's AI allowance for the current 12-hour window, through the website on port 3000, and checks
// that the cap holds: every answer lowers what is left, questions sent at the same moment are all counted, the chat is
// refused once nothing is left (on every model), and the page says when it refills.
// Costs real money on the AI accounts: at most one window of the test student's pack plus the last answer (a few taka).
// Afterwards the test student has no AI chat until the window ends (12 noon or 12 midnight, Bangladesh time).
import { mkdirSync } from "node:fs";
import { as, finish, SITE } from "./test-login.mjs";

if (!process.argv.includes("--yes")) {
  console.log("This uses up the test student's AI allowance until the next 12-hour refill and costs a few taka.\nRun it with: npm run check:cap -- --yes");
  process.exit(1);
}
const TRAILER = "\u001e"; // ends a streamed chat answer; JSON follows it
const QUESTIONS = [
  "Explain photosynthesis step by step for a class 9 student.",
  "Explain Newton's three laws of motion with one everyday example each.",
  "Describe the water cycle and why it matters for farming in Bangladesh.",
  "Explain how to solve a quadratic equation by factorising, with two worked examples.",
  "Describe the causes and the main events of the Liberation War of 1971.",
  "Explain the difference between mitosis and meiosis.",
  "Explain acids, bases and the pH scale with examples from the kitchen.",
  "Explain how an electric circuit works: current, voltage and resistance.",
  "Explain the structure of an atom and how the periodic table is arranged.",
  "Explain the tenses of English verbs with one example sentence each.",
];
let bad = 0;
const say = (line = "") => console.log(line);
const fail = (line) => (bad++, say(`  ✗ ${line}`));
const ok = (line) => say(`  ✓ ${line}`);

const student = await as("student", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const menu = async () => JSON.parse((await student.call("/api/ai/assistant")).text);
/** One question as the chat sends it. Answer settings are sent along, so a saved answer is never used: the AI itself is asked. */
const ask = async (model, content, plain = false) => {
  for (;;) {
    const r = await student.call("/api/ai/assistant", { messages: [{ role: "user", content }], model, ...(plain ? {} : { prefs: { lang: "en", length: "long" } }) });
    const [answer, tail] = r.text.split(TRAILER);
    let info = {};
    try {
      info = JSON.parse(tail ?? r.text);
    } catch {
      /* no trailer: an error answer */
    }
    if (r.status === 429 && info.error !== "limit") {
      await new Promise((wait) => setTimeout(wait, 20_000)); // more than 12 questions in a minute: wait, then ask again
      continue;
    }
    return { status: r.status, info, chars: tail === undefined ? 0 : answer.trim().length, secs: r.ms / 1000 };
  }
};

// ---- before ------------------------------------------------------------------------------------------------------
let m = await menu();
if (typeof m.left !== "number") throw new Error("The website does not say how much allowance is left. Is it the newest build?");
const ready = m.models.filter((x) => !x.locked && !x.soon);
const cheap = ready[0], strong = ready[ready.length - 1];
if (!cheap) throw new Error("No chat model is switched on for the test student.");
say(`The test student's pack: ৳${m.pack} a month. Allowance left in this 12-hour window: ${m.left}%.`);
// When this window ends, worked out here on its own: the next 12 noon or 12 midnight in Bangladesh (UTC+6).
const dhaka = new Date(Date.now() + 6 * 3600_000);
const ends = new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate(), dhaka.getUTCHours() < 12 ? 12 : 24) - 6 * 3600_000).toISOString();
const at = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
if (m.resetsAt === ends) ok(`It refills at ${at(m.resetsAt)} Bangladesh time: the end of this 12-hour window.`);
else fail(`The website says it refills at ${m.resetsAt}; this window really ends at ${ends}.`);

if (m.left > 0) {
  // ---- one answer lowers what is left ------------------------------------------------------------------------------
  say();
  say(`One question (${cheap.label})`);
  const one = await ask(cheap.id, QUESTIONS[0]);
  const after = (await menu()).left;
  const single = m.left - after;
  if (one.status === 200 && one.chars && single > 0 && one.info.left === after) ok(`${one.chars} letters of answer took ${single}% (now ${after}% left; the answer and the page agree).`);
  else if (one.status === 200 && one.chars) fail(`The answer came (${one.chars} letters) but what is left went from ${m.left}% to ${after}% (the answer itself said ${one.info.left}%).`);
  else if (one.status !== 429) fail(`The question failed (${one.status} ${one.info.error ?? ""}).`);

  // ---- questions sent at the same moment are all counted -----------------------------------------------------------
  if (after > single * 6) {
    say();
    say(`Four questions at the same moment (${cheap.label})`);
    const burst = await Promise.all([1, 2, 3, 4].map((i) => ask(cheap.id, QUESTIONS[i])));
    const answered = burst.filter((b) => b.status === 200 && b.chars);
    const then = (await menu()).left;
    const took = after - then;
    const letters = answered.reduce((n, b) => n + b.chars, 0);
    // What four answers of this size should take, going by the one above (question and rules cost the same each time).
    const expected = Math.round((single * letters) / Math.max(1, one.chars));
    say(`  ${answered.length} of 4 were answered (${letters} letters in all); ${took}% was taken, where about ${expected}% was expected.`);
    if (answered.length <= 1) ok("Only one question at a time is answered.");
    else if (took >= expected * 0.6) ok("All of them were counted.");
    else fail(`Answers given at the same moment are not all counted: ${answered.length} answers cost the student about as much as ${Math.max(1, Math.round((took / Math.max(1, expected)) * answered.length))}. A student could get several times the allowance this way.`);
  }

  // ---- use up the rest ---------------------------------------------------------------------------------------------
  say();
  say(`Using up the rest (${strong.label})`);
  let left = (await menu()).left, n = 0, rose = false, last;
  for (; n < 60; n++) {
    last = await ask(strong.id, QUESTIONS[n % QUESTIONS.length] + ` (Part ${n + 1}.)`);
    if (last.status !== 200) break;
    if (!last.chars) {
      fail(`Question ${n + 1} came back empty (${JSON.stringify(last.info)}).`);
      break;
    }
    if (last.info.left > left) rose = true;
    say(`    answer ${n + 1}: ${last.chars} letters in ${last.secs.toFixed(0)} s, took ${left - last.info.left}% → ${last.info.left}% left`);
    left = last.info.left;
  }
  if (rose) fail("What is left went up after an answer.");
  if (last.status === 429 && last.info.error === "limit") ok(`After ${n} more answers the next question was refused: the allowance is used up.`);
  else fail(`The allowance never ran out: stopped after ${n} answers with ${last.status} ${last.info.error ?? ""} and ${left}% left.`);
}

// ---- once it is used up ------------------------------------------------------------------------------------------
say();
say("With nothing left");
m = await menu();
if (m.left === 0) ok("The page's own count says 0% left.");
else fail(`The page's own count says ${m.left}% left, but questions are refused.`);
for (const model of ready) {
  const r = await ask(model.id, `${QUESTIONS[5]} (Once more.)`);
  if (r.status === 429 && r.info.error === "limit" && r.info.resetsAt === ends) ok(`${model.label}: refused, with the refill time (${at(r.info.resetsAt)}).`);
  else fail(`${model.label}: ${r.status === 200 ? `still answered (${r.chars} letters)` : `answered ${r.status} ${JSON.stringify(r.info)}`}.`);
}
const kept = await ask(cheap.id, "Explain Newton's second law with an example", true); // a suggested question: an answer may be kept for everyone
say(kept.status === 200 && kept.chars ? "  – A question whose answer is already kept for everyone is still answered (it costs nothing, so it is not counted)." : "  – A common question was refused as well (no answer is kept for it yet).");

// ---- what the student sees ---------------------------------------------------------------------------------------
await student.page.goto(`${SITE}/student`);
await student.page.getByRole("button", { name: /^AI/ }).last().click();
const box = student.page.getByPlaceholder(/Ask anything/).last();
await box.fill("What is osmosis? Explain it with an example from daily life, please.");
await box.press("Enter");
const note = student.page.getByText(/used this 12-hour allowance/).last();
try {
  await note.waitFor({ timeout: 20_000 });
  ok(`The chat says: "${(await note.innerText()).trim()}"`);
} catch {
  fail("The chat page did not say that the allowance is used up.");
}
mkdirSync("data/app-screens/site", { recursive: true });
await student.page.screenshot({ path: "data/app-screens/site/site-chat-limit.png" });

await finish();
say();
say(bad ? `${bad} problem(s) found.` : "The cap held in every check.");
process.exit(bad ? 1 : 0);
