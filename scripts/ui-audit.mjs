// Layout check of every screen at many window sizes (demo site on :3300):
//   node --experimental-strip-types scripts/ui-audit.mjs [en|bn] [light|dark] [100%|125%] [sizes e.g. 320,390,768]
// Reports: page scrolling sideways, things cut off at the screen edge, text spilling out of buttons,
// controls cut by their container, and (dark mode) text too faint to read.
import { chromium } from "@playwright/test";
import { tour } from "./tour.mjs";
import bn from "../src/lib/i18n/bn.ts";

const [lang = "en", theme = "light", text = "100%", sizesArg] = process.argv.slice(2);
const BASE = process.env.AUDIT_BASE || "http://localhost:3300";
const ALL = [[320, 568], [360, 740], [390, 844], [600, 960], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const SIZES = sizesArg ? ALL.filter(([w]) => sizesArg.split(",").includes(String(w))) : ALL;

function measure(checkContrast) {
  const W = window.innerWidth;
  const issues = [];
  const desc = (el) => {
    const cls = String(el.className?.baseVal ?? el.className ?? "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    const txt = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 36);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${txt}"`;
  };
  const seen = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
  };
  const over = document.documentElement.scrollWidth - W;
  if (over > 1) issues.push(["page scrolls sideways", `by ${over}px`]);

  const scroller = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
    return false;
  };
  const clipper = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return null;
      if (/(hidden|clip)/.test(s.overflowX + s.overflowY)) return p;
    }
    return null;
  };
  const flagged = new Set();
  const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = (c) => {
    cv.clearRect(0, 0, 1, 1);
    cv.fillStyle = "#000";
    cv.fillStyle = c;
    cv.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);

  for (const el of document.body.querySelectorAll("*")) {
    if (flagged.has(el.parentElement)) {
      flagged.add(el);
      continue;
    }
    if (el.closest("[aria-hidden='true'], [data-testid='watermark']")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || !seen(el)) continue;
    if (r.left >= W || r.right <= 0) continue; // fully off-screen: a closed drawer
    if ((r.right > W + 2 || r.left < -2) && !scroller(el)) {
      flagged.add(el);
      issues.push(["cut off at the screen edge", `${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)} of ${W}]`]);
      continue;
    }
    const control = /^(BUTTON|A|SUMMARY)$/.test(el.tagName) || el.getAttribute("role") === "tab";
    if (control) {
      const s = getComputedStyle(el);
      if (s.display !== "inline" && s.overflowX === "visible" && (el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 3))
        issues.push(["text spills out of a button", `${desc(el)} [needs ${el.scrollWidth}x${el.scrollHeight}, has ${el.clientWidth}x${el.clientHeight}]`]);
      const c = clipper(el);
      if (c) {
        const cr = c.getBoundingClientRect();
        if (r.right > cr.right + 4 || r.left < cr.left - 4) issues.push(["button cut by its container", desc(el)]);
      }
    }
    if (checkContrast && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) {
      const s = getComputedStyle(el);
      if (parseFloat(s.fontSize) < 11) continue;
      const fg = rgba(s.color);
      // Background: the colours behind this text, from the page up to the element (pictures and gradients are not known).
      const layers = [];
      let unknown = false;
      for (let p = el; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.backgroundImage !== "none" && p !== document.body && p !== document.documentElement) unknown = true;
        const bg = rgba(ps.backgroundColor);
        if (bg[3] > 0) layers.unshift(bg);
        if (bg[3] >= 0.99) break;
      }
      if (unknown) continue;
      let base = document.documentElement.classList.contains("dark") ? [12, 20, 19] : [238, 247, 244];
      for (const [r2, g2, b2, a] of layers) base = [0, 1, 2].map((i) => [r2, g2, b2][i] * a + base[i] * (1 - a));
      const text3 = [0, 1, 2].map((i) => fg[i] * fg[3] + base[i] * (1 - fg[3]));
      const [l1, l2] = [lum(text3), lum(base)].sort((a, b) => b - a);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      if (ratio < 2.4) issues.push(["text too faint to read", `${desc(el)} [contrast ${ratio.toFixed(1)}]`]);
    }
  }
  return issues;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await ctx.addInitScript(([l, t, x]) => {
  localStorage.setItem("edunest-lang", l);
  localStorage.setItem("classbari-theme", t);
  localStorage.setItem("classbari-text-size", x);
}, [lang, theme, text]);
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

const found = new Map(); // "kind | what" -> Set of "screen @ width"
let screens = 0;
const snap = async (p, group, title) => {
  screens++;
  for (const [w, h] of SIZES) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(180);
    for (const [kind, what] of await p.evaluate(measure, theme === "dark")) {
      const key = `${kind} | ${what.replace(/\[.*\]$/, "").trim()}`;
      if (!found.has(key)) found.set(key, { where: new Set(), sample: what });
      found.get(key).where.add(`${group.replace(/^\d+ · /, "")} › ${title} @${w}`);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(120);
};
await tour({ page, ctx, BASE, snap, adminToken: process.env.AUDIT_ADMIN_TOKEN || "audit-token", t: lang === "bn" ? bn : undefined });
await browser.close();

const rows = [...found].sort((a, b) => b[1].where.size - a[1].where.size);
console.log(`\n${screens} screens × ${SIZES.length} sizes (${lang}, ${theme}, text ${text}) — ${rows.length} different problems\n`);
for (const [key, v] of rows) {
  const where = [...v.where];
  console.log(`• ${key}\n    e.g. ${v.sample}\n    ${where.length} places: ${where.slice(0, 4).join("; ")}${where.length > 4 ? "; …" : ""}`);
}
