// Checks one Flutter app without a phone: opens its browser build in a phone-sized window, logs in with a test account
// against the ClassBARI server on this computer (port 3000), walks its tabs and saves screenshots.
//   cd flutter && flutter build web --dart-define=APP=teacher --dart-define-from-file=config.local.json -o /tmp/web-teacher
//   cd ..      && node scripts/flutter-web-check.mjs teacher /tmp/web-teacher /tmp/shots
// Needs the test accounts (npm run test:accounts); the password is read from data/test-accounts.txt and never printed.
// The Teacher run also makes one real change and undoes it (the test student absent, then present again).
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const [app, root, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const password = readFileSync("data/test-accounts.txt", "utf8").match(/Password for [^:\n]*: (\S+)/)?.[1];
if (!password) throw new Error("no test accounts");
const WHO = { student: "cb.s@gmail.com", chatbot: "cb.s@gmail.com", guardian: "cb.g@gmail.com", teacher: "classbari.test.teacher@example.com", institute: "classbari.test.owner@example.com" };
const TABS = { student: ["Lessons", "Progress", "Profile"], guardian: ["Results", "Messages", "Profile"], teacher: ["Attendance", "Marking", "Notices", "Profile"], institute: ["Fees", "Students", "Notices", "Profile"], chatbot: [] };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".otf": "font/otf", ".ttf": "font/ttf", ".bin": "application/octet-stream", ".symbols": "text/plain" };
const server = createServer((req, res) => {
  let file = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(file) || file.endsWith("/")) file = join(root, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ["--disable-web-security"] }); // the app and the server are on two local ports
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: process.env.DARK ? "dark" : "light" })).newPage();
const problems = [], calls = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 300)}`));
page.on("response", (r) => r.url().includes("localhost:3000/api/") && calls.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));
const shot = (name) => page.screenshot({ path: join(out, `${app}-${name}.png`) });
// A named part: its text may be drawn text or only a label for screen readers.
const named = (text) => page.getByText(text, { exact: false }).or(page.locator(`[aria-label*="${text}"]`));
const see = (text, ms = 20000) => named(text).first().waitFor({ state: "attached", timeout: ms });
// Flutter draws on a canvas; its named parts are an invisible layer, so presses go to the screen position of the part.
const tap = async (loc) => { const b = await loc.first().boundingBox({ timeout: 15000 }); if (!b) throw new Error("not on screen: " + loc); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(400); };
const typePassword = async () => { await tap(page.locator('input[type="password"]').last()); await page.keyboard.type(password, { delay: 5 }); await page.waitForTimeout(300); };
const press = (name) => tap(page.getByRole("button", { name }).or(page.getByText(name, { exact: true })));
const type = async (nth, text) => { await tap(page.locator("input, textarea").nth(nth)); await page.keyboard.type(text, { delay: 5 }); await page.waitForTimeout(300); }; // the nth text box on screen

try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("flt-glass-pane, flutter-view", { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector("flt-semantics-placeholder")?.click()); // lets the test find things by name
  await page.waitForTimeout(800);
  if (app !== "institute") {
    await see("ClassBARI Test Institute");
    await shot("1-find-institute");
    await tap(page.getByText("ClassBARI Test Institute"));
  }
  await page.waitForTimeout(600);
  await type(0, WHO[app]);
  if (app === "institute" || app === "teacher") {
    await typePassword();
  } else {
    await press("Continue");
    await see("Use another Gmail");
    await shot("2-password-step");
    await typePassword();
  }
  await press("Sign in");
  await see(app === "chatbot" ? "ClassBARI AI" : app === "institute" ? "Collected this month" : app === "teacher" ? "Batches" : app === "guardian" ? "Attendance this month" : "To do", 30000);
  await page.waitForTimeout(1500);
  await shot("3-home");
  for (const [i, tab] of TABS[app].entries()) {
    await tap(page.getByRole("tab", { name: tab }).or(page.getByRole("button", { name: tab })).or(page.getByText(tab, { exact: true })).last());
    await page.waitForTimeout(1200);
    await shot(`${4 + i}-${tab.toLowerCase()}`);
  }
  if (app === "teacher") {
    // A real change, there and back: it goes to the server as an action and the answer redraws the row.
    await tap(page.getByRole("tab", { name: "Attendance" }).or(named("Attendance")).last());
    await tap(named("Test Student"));
    await see("Absent");
    await shot("8-marked-absent");
    await tap(named("Test Student"));
    await see("Present");
    await page.waitForTimeout(1500);
    if (!calls.some((c) => c.startsWith("POST /api/data 200"))) problems.push("the attendance change never reached the server");
  }
} catch (e) {
  problems.push(`stopped: ${e.message.split("\n")[0]}`);
  await shot("stopped").catch(() => {});
}
console.log(JSON.stringify({ app, problems, calls: [...new Set(calls)] }, null, 1));
await browser.close();
server.close();
