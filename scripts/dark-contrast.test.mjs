// Student Explore video tiles: in dark mode (both tones) every tile's text must stay readable on its colour (at least 3:1, the large-text minimum).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/student/page.tsx", import.meta.url), "utf8");
const vars = (sel) => { const m = css.match(new RegExp(sel.replace(/[[\]"]/g, "\\$&") + "\\s*\\{([^}]*)\\}")); return Object.fromEntries([...m[1].matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1], x[2]])); };
const light = vars(":root"), dark = { ...light, ...vars("html.dark") }, sky = { ...dark, ...vars('html.dark[data-tone="sky"]') };
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const tones = [...page.match(/const thumbs = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].split(" "));

test("dark-mode video tiles have readable text", () => {
  for (const [bg, fg] of tones) {
    if (css.includes(`html.dark .${bg}.${fg}`)) continue; // a dark fix-up rule recolours this pair
    for (const t of [dark, sky]) {
      const color = (cls, pre) => (cls === `${pre}-white` ? "#ffffff" : t[cls.slice(pre.length + 1)]);
      assert.ok(ratio(color(bg, "bg"), color(fg, "text")) >= 3, `${bg} ${fg} is unreadable in dark mode`);
    }
  }
});
