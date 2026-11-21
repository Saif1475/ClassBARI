// Takes a screenshot of every page and feature of the demo site and makes a captioned PDF tour.
//   (demo copy running on :3300)  node --experimental-strip-types scripts/screenshots.mjs [outDir]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { tour } from "./tour.mjs";

const BASE = "http://localhost:3300";
const OUT = process.argv[2] || path.join(process.env.HOME, "ClassBARI-screenshots");
mkdirSync(OUT, { recursive: true });
const shots = [];
let n = 0;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const settle = (page, ms = 900) => page.waitForLoadState("networkidle").catch(() => {}).then(() => page.waitForTimeout(ms));

async function snap(page, group, title, caption) {
  n++;
  const file = `${String(n).padStart(3, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 85 });
  shots.push({ file, group, title, caption });
  console.log(`✓ ${file}`);
}
async function step(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`✗ skipped ${label}: ${String(e.message).split("\n")[0]}`);
  }
}
const asRole = (ctx, role) => ctx.addCookies([{ name: "edunest-role", value: role, url: BASE }]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const go = async (url) => {
  await page.goto(BASE + url);
  await settle(page);
};

await tour({ page, ctx, BASE, snap });

// ---------- Phone size ----------
const MOB = "8 · On a phone";
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const p2 = await phone.newPage();
for (const [role, url, title, cap] of [
  [null, "/", "Landing on a phone", "Fully mobile-friendly."],
  ["student", "/student", "Student app on a phone", "The student's home on a phone."],
  ["parent", "/parent", "Guardian app on a phone", "What a parent sees."],
  ["teacher", "/teacher", "Teacher app on a phone", "Teachers can run the batch from their phone."],
]) {
  await step(title, async () => {
    if (role) await phone.addCookies([{ name: "edunest-role", value: role, url: BASE }]);
    await p2.goto(BASE + url);
    await settle(p2);
    await snap(p2, MOB, title, cap);
  });
}

// ---------- The captioned PDF ----------
const groups = [...new Set(shots.map((s) => s.group))];
const img = (f) => `data:image/jpeg;base64,${readFileSync(path.join(OUT, f)).toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  body { margin: 0; font-family: Arial, sans-serif; color: #171d1b; }
  .page { width: 297mm; height: 210mm; box-sizing: border-box; padding: 9mm 12mm; page-break-after: always; display: flex; flex-direction: column; gap: 4mm; }
  .cover { justify-content: center; background: #eef7f4; }
  h1 { font-size: 40pt; margin: 0; color: #006a60; } h2 { font-size: 17pt; margin: 0; } .g { color: #006a60; font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5px; }
  p { margin: 0; font-size: 11.5pt; color: #3f4947; } .shot { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .shot img { max-width: 100%; max-height: 100%; border: 1px solid #cfe0dc; border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,.08); }
  ol { columns: 2; font-size: 12pt; line-height: 1.7; }
</style></head><body>
  <div class="page cover"><h1>ClassBARI</h1><h2 style="font-weight:normal">Classes, fees, exams and parent updates — in one app, built for Bangladesh.</h2>
  <p style="margin-top:6mm">Feature tour: ${shots.length} screens from the website (demo data). Also available as four phone apps: Student, Guardian, Teacher and Institution.</p>
  <ol>${groups.map((g) => `<li>${g.replace(/^\d+ · /, "")} (${shots.filter((s) => s.group === g).length})</li>`).join("")}</ol></div>
  ${shots.map((s) => `<div class="page"><div class="g">${s.group}</div><h2>${s.title}</h2><p>${s.caption}</p><div class="shot"><img src="${img(s.file)}"></div></div>`).join("\n")}
</body></html>`;
writeFileSync(path.join(OUT, "tour.html"), html);
const pdfPage = await browser.newPage();
await pdfPage.goto("file://" + path.join(OUT, "tour.html"));
await pdfPage.pdf({ path: path.join(OUT, "ClassBARI-feature-tour.pdf"), format: "A4", landscape: true, printBackground: true });
await browser.close();
console.log(`\n${shots.length} screenshots + ClassBARI-feature-tour.pdf in ${OUT}`);
