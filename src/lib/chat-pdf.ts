// Server only: an AI chat (or one answer) as a PDF, the same file for the website and the phone apps. Drawn by a real
// browser engine so Bangla letters join correctly (simple PDF libraries break conjuncts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INLINE } from "./chat-tools.ts";

export type PdfTurn = { role: "user" | "assistant"; content: string; photo?: boolean };
export const PDF_TURNS_MAX = 200;
export const PDF_TEXT_MAX = 300_000;

/** The turns as sent, checked: at most 200, at most 300,000 letters in all; null when not usable. */
export function pdfTurns(raw: unknown): PdfTurn[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > PDF_TURNS_MAX) return null;
  let total = 0;
  const out: PdfTurn[] = [];
  for (const t of raw) {
    if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.content !== "string") return null;
    total += t.content.length;
    out.push({ role: t.role, content: t.content, ...(t.photo === true ? { photo: true } : {}) });
  }
  return total <= PDF_TEXT_MAX ? out : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** **bold**, ==highlight== and `code` inside one line, as the chat screen shows them (odd pieces are the marks). */
const inline = (line: string) =>
  line
    .split(INLINE)
    .map((p, i) => (i % 2 === 0 ? esc(p) : p.startsWith("**") ? `<strong>${esc(p.slice(2, -2))}</strong>` : p.startsWith("==") ? `<mark>${esc(p.slice(2, -2))}</mark>` : `<code>${esc(p.slice(1, -1))}</code>`))
    .join("");
/** The chat screen's formatting (components/student/AiChat.tsx `Rich`): code blocks, headings, lists, paragraphs. */
export const richHtml = (text: string) =>
  text
    .split(/```\w*\n?/)
    .map((block, i) =>
      i % 2
        ? `<pre><code>${esc(block.trimEnd())}</code></pre>`
        : block
            .split("\n")
            .map((line) => {
              const h = line.match(/^#{1,4}\s+(.*)/);
              const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
              if (h) return `<p class="h">${inline(h[1])}</p>`;
              if (li) return `<p class="li">${/^\d/.test(li[1]) ? esc(li[1]) : "•"} ${inline(li[2])}</p>`;
              return line.trim() ? `<p>${inline(line)}</p>` : `<div class="gap"></div>`;
            })
            .join(""),
    )
    .join("");

const fontDir = join(process.cwd(), "flutter/assets/fonts"); // the apps' own font files, also used here
const font = (file: string, weight: number, family: string) =>
  `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(fontDir, file)).toString("base64")}) format("truetype")}`;
let fonts: string | undefined;

/** The whole page: title, date, each turn, and the note that AI answers can be wrong. */
export function chatHtml(o: { title: string; turns: PdfTurn[]; you: string; ai: string; photo: string; note: string; date: string }) {
  fonts ??= [font("PlusJakartaSans.ttf", 400, "Jakarta"), font("PlusJakartaSans.ttf", 700, "Jakarta"), font("HindSiliguri-Regular.ttf", 400, "Hind"), font("HindSiliguri-Bold.ttf", 700, "Hind")].join("");
  const turns = o.turns
    .map((t) => `<section class="${t.role}"><div class="who">${esc(t.role === "user" ? o.you : o.ai)}</div>${t.photo ? `<p class="muted">${esc(o.photo)}</p>` : ""}${t.role === "assistant" ? richHtml(t.content) : `<p>${esc(t.content).replace(/\n/g, "<br>")}</p>`}</section>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
body{font-family:Jakarta,Hind,sans-serif;color:#1a1c1b;font-size:12.5pt;line-height:1.55;margin:0}
header{border-bottom:2px solid #0b5d3b;padding-bottom:8px;margin-bottom:14px}
header b{color:#0b5d3b;font-size:11pt}h1{font-size:17pt;margin:4px 0 0}
.muted{color:#5f6662;font-size:10pt}section{margin:0 0 12px;padding:10px 12px;border-radius:10px;break-inside:auto}
.user{background:#e8f3ec}.assistant{border:1px solid #d6dcd8}.who{font-weight:700;font-size:10pt;color:#0b5d3b;margin-bottom:2px}
p{margin:2px 0}.h{font-weight:700;margin-top:8px}.li{padding-left:1.2em;text-indent:-1.2em}.gap{height:6px}
mark{background:#ffe066;color:inherit;border-radius:3px;padding:0 2px}code{background:#eef1ef;border-radius:4px;padding:0 3px;font-size:.92em}pre{background:#f4f7f5;color:#1a1c1b;border:1px solid #d6dcd8;border-left:4px solid #0b5d3b;border-radius:8px;padding:10px 12px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Consolas,monospace;font-size:10pt;line-height:1.45}pre code{background:none;padding:0;font-size:inherit} /* light, so code stays readable on screen and in print */
footer{margin-top:16px;color:#5f6662;font-size:9.5pt}</style></head><body>
<header><b>ClassBARI AI</b><h1>${esc(o.title)}</h1><div class="muted">${esc(o.date)}</div></header>${turns}<footer>${esc(o.note)}</footer></body></html>`;
}

// One browser for the whole server, started on first use; a page per PDF.
let browser: Promise<import("playwright-core").Browser> | null = null;
export async function htmlToPdf(html: string) {
  const { chromium } = await import("playwright-core");
  browser ??= chromium.launch();
  const b = await browser.catch((e) => ((browser = null), Promise.reject(e))); // a failed start is tried again next time
  const page = await b.newPage({ javaScriptEnabled: false }); // the page is our own text; nothing in it may run
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    return await page.pdf({ format: "A4", margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" }, printBackground: true });
  } finally {
    await page.close();
  }
}
/** Stop the shared browser (tests; a server just keeps it). */
export const closePdfBrowser = async () => (await browser?.catch(() => null))?.close();
