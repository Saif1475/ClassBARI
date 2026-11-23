// Logs in on the local website (port 3000) as one of the four test people, the way a person would, and hands back
// ways to read and change data as them. Used by test-sample-lessons.mjs and check-ai.mjs.
// The password comes from data/test-accounts.txt (made by `npm run test:accounts`) and is never printed.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

export const SITE = "http://localhost:3000", INSTITUTE = "Instanton Test Institute";
const PEOPLE = { owner: ["Institute", "classbari.test.owner@example.com"], teacher: ["Instructor", "classbari.test.teacher@example.com"], student: ["Student", "cb.s@gmail.com"], guardian: ["Parent", "cb.g@gmail.com"] };
let password = "";
try {
  password = readFileSync("data/test-accounts.txt", "utf8").match(/Password for [^:\n]*: (\S+)/)?.[1] ?? "";
} catch {
  /* reported below */
}
if (!password) throw new Error("No test accounts found. Run: npm run test:accounts");

let browser;
/** who: "owner" | "teacher" | "student" | "guardian". `screen`: browser window options, e.g. a phone-sized one. */
export async function as(who, screen = {}) {
  const [role, email] = PEOPLE[who];
  browser ??= await chromium.launch({ args: ["--font-render-hinting=none"] }); // letters spaced as on phones, not as this computer's font hinting bends them
  const page = await (await browser.newContext(screen)).newPage();
  await page.goto(`${SITE}/login`).catch(() => {
    throw new Error("The website is not running on port 3000. Start it first (npx next start -p 3000).");
  });
  await page.getByRole("button", { name: role, exact: true }).click();
  if (who !== "owner") {
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(INSTITUTE) }).click();
  }
  if (who === "student" || who === "guardian") {
    await page.getByPlaceholder("you@gmail.com").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  } else await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(teacher|student|parent|institute)$/, { timeout: 30000 });
  /** Everything /api/data sends this person: { state, role, institute }. */
  const all = () => page.evaluate(async () => (await fetch("/api/data", { cache: "no-store" })).json());
  const data = async () => (await all()).state;
  /** One change, as the website sends it; gives back the new data. */
  const send = async (name, args) => {
    const out = await page.evaluate(async ([n, a]) => { const r = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, args: a, base: Date.now() }) }); return { status: r.status, state: r.ok ? (await r.json()).state : null }; }, [name, args]);
    if (out.status !== 200) throw new Error(`${name} was refused (${out.status})`);
    return out.state;
  };
  /** Any request to the website as this person: gives back { status, text, ms }. */
  const call = (path, body) => page.evaluate(async ([p, b]) => { const t = performance.now(); const r = await fetch(p, b === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, text: await r.text(), ms: Math.round(performance.now() - t) }; }, [path, body]);
  return { page, all, data, send, call };
}
export const finish = () => browser?.close();
