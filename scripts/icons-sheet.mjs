// Run: node --experimental-strip-types scripts/icons-sheet.mjs <out.png> — every Instanton Campus icon on one sheet, to review.
import { chromium } from "playwright";
import { ICONS } from "../src/lib/icon-set.ts";
const out = process.argv[2] ?? "data/app-screens/icons.png";
const svg = (g, size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${(g.a ?? []).map((d) => `<path d="${d}" fill="${color}" fill-opacity="0.18" stroke="none"/>`).join("")}${g.s.map((d) => `<path d="${d}"/>`).join("")}${(g.f ?? []).map((d) => `<path d="${d}" fill="${color}" stroke="none"/>`).join("")}</svg>`;
const cells = Object.entries(ICONS).map(([k, g]) => `<div class="c">${svg(g, 48, "#157347")}${svg(g, 24, "#17201b")}<span>${k}</span></div>`).join("");
const html = `<html><body style="margin:0;padding:24px;background:#f3f6f4;font:13px sans-serif;color:#17201b"><div style="display:grid;grid-template-columns:repeat(8,1fr);gap:14px">${cells}</div><style>.c{background:#fff;border-radius:14px;padding:14px 8px;display:flex;flex-direction:column;align-items:center;gap:8px}.c span{font-weight:600}</style></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(out, Object.keys(ICONS).length, "icons");
