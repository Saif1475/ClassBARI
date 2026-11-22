// Checks one Flutter app without a phone, and photographs its screens: opens its browser build in a phone-sized
// window, logs in with a test account against the ClassBARI server on this computer (port 3000) and walks its screens.
//   cd flutter && flutter build web --dart-define=APP=teacher --dart-define-from-file=config.local.json -o /tmp/web-teacher
//   cd ..      && node scripts/flutter-web-check.mjs teacher /tmp/web-teacher data/app-screens
//                 node scripts/flutter-web-check.mjs sheets data/app-screens        (one picture per app with all its screens)
// Needs the test accounts and sample lessons (npm run test:accounts, npm run test:lessons); the password is read from
// data/test-accounts.txt and never printed. DARK=1 photographs just the first screens in the dark theme.
// The Teacher run also makes one real change and undoes it (the test student absent, then present again).
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const [app, root, outArg] = process.argv.slice(2);
if (app === "sheets") {
  // One wide picture per app: every screen side by side with its name above it.
  const W = 300, H = 649, GAP = 16, TOP = 34, PER_ROW = 7;
  for (const name of [...new Set(readdirSync(root).filter((f) => /^[a-z-]+-\d\d-/.test(f)).map((f) => f.replace(/-\d\d-.*/, "")))]) {
    const files = readdirSync(root).filter((f) => new RegExp(`^${name}-\\d\\d-`).test(f)).sort();
    const rows = Math.ceil(files.length / PER_ROW), cols = Math.min(files.length, PER_ROW);
    const parts = [];
    for (const [i, f] of files.entries()) {
      const x = GAP + (i % PER_ROW) * (W + GAP), y = GAP + Math.floor(i / PER_ROW) * (H + TOP + GAP);
      const label = f.replace(`${name}-`, "").replace(".png", "").replace(/^(\d\d)-/, "$1  ").replaceAll("-", " ");
      parts.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TOP}"><text x="0" y="22" font-family="DejaVu Sans, Arial" font-size="17" font-weight="bold" fill="#1c2b24">${label}</text></svg>`), left: x, top: y });
      parts.push({ input: await sharp(join(root, f)).resize(W, H, { fit: "cover", position: "top" }).png().toBuffer(), left: x, top: y + TOP });
    }
    await sharp({ create: { width: GAP + cols * (W + GAP), height: GAP + rows * (H + TOP + GAP), channels: 3, background: "#dfe7e2" } }).composite(parts).png().toFile(join(root, `all-${name}.png`));
    console.log(`all-${name}.png: ${files.length} screens`);
  }
  process.exit(0);
}

const out = outArg, dark = !!process.env.DARK, prefix = dark ? `${app}-dark` : app;
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.startsWith(`${prefix}-`) && /-(\d\d|stopped)[-.]/.test(f)) rmSync(join(out, f));
const password = readFileSync("data/test-accounts.txt", "utf8").match(/Password for [^:\n]*: (\S+)/)?.[1];
if (!password) throw new Error("no test accounts");
const WHO = { student: "cb.s@gmail.com", chatbot: "cb.s@gmail.com", guardian: "cb.g@gmail.com", teacher: "classbari.test.teacher@example.com", institute: "classbari.test.owner@example.com" };
const HOME = { student: "To do", guardian: "This month", teacher: "Needs your attention", institute: "Collected this month", chatbot: "ClassBARI AI" };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".otf": "font/otf", ".ttf": "font/ttf", ".bin": "application/octet-stream", ".symbols": "text/plain" };
const server = createServer((req, res) => {
  let file = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(file) || file.endsWith("/")) file = join(root, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);

const browser = await chromium.launch({ args: ["--disable-web-security"] }); // the app and the server are on two local ports
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" })).newPage();
const problems = [], calls = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 300)}`));
page.on("response", (r) => r.url().includes("localhost:3000/api/") && calls.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));

let n = 0;
const shot = async (name) => { await page.mouse.move(195, 2); await page.waitForTimeout(900); await page.screenshot({ path: join(out, `${prefix}-${String(++n).padStart(2, "0")}-${name}.png`) }); };
// A named part: its text may be drawn text or only a label for screen readers.
const named = (text) => page.getByText(text, { exact: false }).or(page.locator(`[aria-label*="${text}"]`));
const see = (text, ms = 20000) => named(text).first().waitFor({ state: "attached", timeout: ms });
// Flutter draws on a canvas; its named parts are an invisible layer, so presses go to the screen position of the part.
const tap = async (loc) => { const b = await loc.first().boundingBox({ timeout: 15000 }); if (!b) throw new Error(`not on screen: ${loc}`); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(600); };
const press = (name) => tap(page.getByRole("button", { name }).or(page.getByText(name, { exact: true })));
const tab = (i) => tap(page.locator(`[flt-semantics-identifier="tab-${i}"]`));
const back = () => tap(page.getByRole("button", { name: "Back", exact: true })).catch(() => page.goBack().then(() => page.waitForTimeout(700))); // the bar's arrow, or the browser's own
// Types into a text box and reads it back: if a first key was lost while the box was still getting ready, it is typed again.
const typeInto = async (box, text) => {
  for (let tries = 0; tries < 3; tries++) {
    await tap(box);
    await page.keyboard.press("Control+A");
    await page.keyboard.type(text, { delay: 15 });
    await page.waitForTimeout(350);
    if ((await page.evaluate(() => document.activeElement?.value ?? "")) === text) return;
  }
  throw new Error("could not type into a text box");
};
const type = (nth, text) => typeInto(page.locator("input, textarea").nth(nth), text); // the nth text box on screen
const typePassword = () => typeInto(page.locator('input[type="password"]').last(), password);
const down = async (by = 500) => { await page.mouse.move(195, 420); await page.mouse.wheel(0, by); await page.waitForTimeout(500); };
/** One screen of the tour: a failure is noted and the tour goes on. */
const step = async (name, go) => { try { await go(); await shot(name); } catch (e) { problems.push(`${name}: ${e.message.split("\n")[0]}`); } };
const quietly = (go) => go().catch((e) => problems.push(`going back: ${e.message.split("\n")[0]}`));

const TOURS = {
  student: async () => {
    await step("lessons", () => tab(1));
    await step("quiz", () => tap(named("Quiz: Motion basics")));
    await quietly(back);
    await step("homework", () => tap(named("Homework 2")));
    await quietly(back);
    await step("homework-handed-in", () => tap(named("Homework 1")));
    await quietly(back);
    await step("video-lesson", () => tap(named("Speed and velocity")));
    await quietly(back);
    await step("progress", () => tab(2));
    await step("profile", () => tab(3));
    await step("profile-in-bangla", () => tap(named("বাংলা")));
    await step("home-in-bangla", () => tab(0));
    await step("lessons-in-bangla", () => tab(1));
  },
  guardian: async () => {
    await step("home-lower-part", () => down(700));
    await step("results", () => tab(1));
    await step("messages", () => tab(2));
    await step("profile", () => tab(3));
  },
  teacher: async () => {
    await step("to-mark", () => tap(named("answers to mark")));
    await step("mark-one-homework", async () => { await tap(named("Homework 1")); await page.waitForTimeout(2500); });
    await quietly(back);
    await quietly(back);
    await step("guardian-chat", () => tap(named("Wa alaikum assalam")));
    await quietly(back);
    await step("attendance", () => tab(1));
    // A real change, there and back: it goes to the server as an action and the answer redraws the row.
    await step("attendance-marked-absent", async () => { await tap(named("Test Student")); await see("Absent"); });
    await quietly(async () => { await tap(named("Test Student")); await see("Present"); await page.waitForTimeout(1500); });
    if (!calls.some((c) => c.startsWith("POST /api/data 200"))) problems.push("the attendance change never reached the server");
    await step("marking-tab", () => tab(2));
    await step("notices", () => tab(3));
    await step("profile", () => tab(4));
  },
  institute: async () => {
    await step("fees", () => tab(1));
    await step("record-a-payment", () => tap(named("Test Student")));
    await quietly(() => press("Cancel"));
    await step("students", () => tab(2));
    await step("add-student", () => tap(named("Add student")));
    await step("add-student-lower-part", () => down(600));
    await quietly(back);
    await step("notices", () => tab(3));
    await step("profile", () => tab(4));
  },
  chatbot: async () => {
    // A real question (a few paisa on the AI account): one of the suggestions, then the finished answer from its end and its start.
    await step("answer", async () => { await tap(named("Explain Newton")); await see("Try again", 90000); });
    await step("answer-from-the-top", async () => { await page.mouse.move(195, 400); await page.mouse.wheel(0, -8000); await page.waitForTimeout(600); });
    await step("chat-list", () => tap(page.getByRole("button", { name: "Chats", exact: true })));
    await quietly(async () => { await page.mouse.click(375, 420); await page.waitForTimeout(700); }); // outside the side panel closes it
    await step("choose-a-model", () => tap(named("AI model").or(page.getByRole("button", { name: /Gemini|Qwen|Claude|GPT/ }))));
  },
};

try {
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForSelector("flt-glass-pane, flutter-view", { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector("flt-semantics-placeholder")?.click()); // lets the test find things by name
  await page.waitForTimeout(800);
  if (app !== "institute") {
    await see(app === "teacher" ? "Find your institute" : "ClassBARI Test Institute");
    await see("ClassBARI Test Institute");
    await shot("find-institute");
    await tap(page.getByText("ClassBARI Test Institute"));
  }
  await page.waitForTimeout(600);
  if (app === "institute" || app === "teacher") await shot("login");
  await type(0, WHO[app]);
  if (app !== "institute" && app !== "teacher") {
    await press("Continue");
    await see("Use another Gmail");
    await shot("password-step");
  }
  await typePassword();
  await press("Sign in");
  await see(HOME[app], 30000);
  await page.waitForTimeout(1500);
  await shot("home");
  if (dark) await step("second-tab", () => (app === "chatbot" ? tap(page.getByRole("button", { name: "Chats", exact: true })) : tab(1)));
  else await TOURS[app]();
} catch (e) {
  problems.push(`stopped: ${e.message.split("\n")[0]}`);
  await page.screenshot({ path: join(out, `${prefix}-stopped.png`) }).catch(() => {});
}
console.log(JSON.stringify({ app: prefix, screens: n, problems, calls: [...new Set(calls)] }));
await browser.close();
server.close();
