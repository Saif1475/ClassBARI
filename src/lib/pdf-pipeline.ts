// Server only: turns each PDF a teacher uploads in a premium institute into its highlighted version, once.
// ① read the text page by page (free, on our server); ② the AI marks key terms, definitions, formulas and exam
// points and reads scanned / Bangla pages from their images; without an AI key, a non-AI fallback marks them.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { admin, aiSpent, loadPart, whoIs } from "./data-server";
import { dayKey } from "./dates";
import { aiWindow, costUsd, usedTokens } from "./ai-chat";
import { basicHighlights, canSeeInsights, dedupe, isScanned, type Highlight, type PdfPage } from "./pdf-insights";

const AI_MAX_BYTES = 20 * 1024 * 1024; // the API takes up to 32 MB per request; base64 adds a third
const AI_MAX_PAGES = 100;
export const filePath = (url: string) => url.match(/^\/api\/files\/([0-9a-f-]{36}\/[0-9a-f-]{36})$/)?.[1] ?? null;

async function readPages(pdf: Uint8Array): Promise<PdfPage[]> {
  // Loaded from node_modules at run time (not bundled): the browser build of pdf.js stays separate.
  const pdfjs = (await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: true, disableFontFace: true });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+\n/g, "\n").trim();
    pages.push({ n, scanned: isScanned(text), text });
  }
  await task.destroy();
  return pages;
}

const AiResult = z.object({
  pages: z.array(
    z.object({
      page: z.number().int(),
      transcript: z.string(),
      highlights: z.array(z.object({ text: z.string(), type: z.enum(["term", "definition", "formula", "exam"]) })),
    }),
  ),
});

const PROMPT = `You prepare study material for Bangladeshi students (SSC/HSC level) at coaching centres.
You receive a teacher's PDF chapter. For every page, pick what a student should notice:
- "term": key terms and names (a few words),
- "definition": sentences that define something,
- "formula": formulas and equations,
- "exam": sentences most likely to be asked in exams.
Copy each highlight EXACTLY as it is written on the page, in the page's own language (Bangla or English), so it can be found on the page. At most 12 highlights per page; skip pages with nothing worth marking. Never invent text.`;

/** The AI's reading, or null when no AI key is set or the PDF is too big for one request. */
/** Highlighting counts in the monthly AI budget, under the institute (not any one person). */
async function recordPdfCost(path: string, model: string, usage: Parameters<typeof costUsd>[1]) {
  const institute = path.split("/")[0];
  const key = `${institute}:pdf-highlights`;
  const { day, slot } = aiWindow();
  const db = admin();
  const { data } = await db.from("ai_usage").select("questions, cost_usd, tokens").eq("user_key", key).eq("day", day).eq("slot", slot).maybeSingle();
  await db.from("ai_usage").upsert({ user_key: key, day, slot, institute_id: institute, questions: (data?.questions ?? 0) + 1, cost_usd: Number(data?.cost_usd ?? 0) + costUsd(model, usage), tokens: Number(data?.tokens ?? 0) + usedTokens(usage) });
}

async function aiRead(path: string, pdf: Uint8Array, pages: PdfPage[]) {
  if (!process.env.ANTHROPIC_API_KEY || pdf.byteLength > AI_MAX_BYTES || pages.length > AI_MAX_PAGES) return null;
  // The monthly AI budget covers highlighting too: over it, PDFs get the basic highlights.
  if ((await aiSpent(`${aiWindow().day.slice(0, 7)}-01`)) >= Number(process.env.AI_MONTHLY_BUDGET_USD || 30)) return null;
  const scanned = pages.filter((p) => p.scanned).map((p) => p.n);
  const client = new Anthropic();
  const res = await client.beta.messages.parse({
    model: process.env.AI_PDF_MODEL || "claude-opus-5-5",
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // a declined request is retried on another model inside the same call
    output_config: { effort: "low", format: betaZodOutputFormat(AiResult) },
    system: PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
          {
            type: "text",
            text: scanned.length
              ? `Pages ${scanned.join(", ")} are scans or photos with no text layer: for those pages put the full text you read from the image in "transcript" (original language). For all other pages leave "transcript" empty.`
              : `Every page has a text layer: leave "transcript" empty on all pages.`,
          },
        ],
      },
    ],
  });
  await recordPdfCost(path, process.env.AI_PDF_MODEL || "claude-opus-5-5", res.usage); // paid even if the result is unusable
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`AI gave no result (${res.stop_reason})`);
  return res.parsed_output;
}

/** Read and mark one PDF; saves 'ready' (or 'failed' with the reason). */
export async function processPdf(path: string) {
  const db = admin();
  const save = (patch: Record<string, unknown>) => db.from("pdf_insights").update({ ...patch, updated_at: new Date().toISOString() }).eq("file_path", path);
  await save({ status: "processing", error: null });
  try {
    const { data: blob, error } = await db.storage.from("files").download(path);
    if (error || !blob) throw new Error(`download failed: ${error?.message}`);
    const pdf = new Uint8Array(await blob.arrayBuffer());
    const pages = await readPages(pdf);
    let highlights: Highlight[] | null = null;
    let source: "ai" | "basic" = "basic";
    try {
      const ai = await aiRead(path, pdf, pages);
      if (ai) {
        for (const p of ai.pages) {
          const page = pages.find((x) => x.n === p.page);
          if (page?.scanned && p.transcript.trim()) page.text = p.transcript.trim(); // the AI read the image
        }
        highlights = dedupe(ai.pages.flatMap((p) => p.highlights.map((h) => ({ page: p.page, text: h.text.trim(), type: h.type }))).filter((h) => pages.some((x) => x.n === h.page)));
        source = "ai";
      }
    } catch (e) {
      console.error("pdf ai:", path, e instanceof Error ? e.message : e); // fall back to the non-AI marks
    }
    await save({ status: "ready", source, pages, highlights: highlights ?? basicHighlights(pages) });
  } catch (e) {
    await save({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "failed" });
  }
}

// shortcut: an in-memory queue on one server, one PDF at a time; a stuck or lost job is re-queued when someone opens it.
let chain: Promise<void> = Promise.resolve();
export function queuePdfs(institute: string, paths: string[]) {
  if (!paths.length) return;
  chain = chain.then(async () => {
    await admin().from("pdf_insights").upsert(paths.map((p) => ({ file_path: p, institute_id: institute, status: "queued" })), { onConflict: "file_path", ignoreDuplicates: true });
    for (const p of paths) {
      const { data } = await admin().from("pdf_insights").select("status").eq("file_path", p).maybeSingle();
      if (data?.status === "queued") await processPdf(p);
    }
  }).catch((e) => console.error("pdf queue:", e instanceof Error ? e.message : e));
}

export async function isPremiumInstitute(institute: string) {
  const { data } = await admin().from("institutes").select("premium").eq("id", institute).maybeSingle();
  return data?.premium === true;
}

/** Every PDF lesson of an institute (when it becomes premium). */
export async function queueInstitute(institute: string) {
  const state = await loadPart(institute, "modules");
  const paths = state.modules.flatMap((m) => m.items).filter((it) => it.kind === "pdf" && it.url).map((it) => filePath(it.url!)).filter((p): p is string => !!p && p.startsWith(institute));
  queuePdfs(institute, paths);
}

/** After a teacher adds a PDF lesson in a premium institute: read and mark it. */
export async function afterAction(institute: string, name: string, args: unknown[]) {
  if (name !== "addModuleItem") return;
  const item = args[1] as { kind?: string; url?: string } | undefined;
  const path = item?.kind === "pdf" && item.url ? filePath(item.url) : null;
  if (path?.startsWith(institute) && (await isPremiumInstitute(institute))) queuePdfs(institute, [path]);
}

const STAFF = ["owner", "manager", "teacher"];

/** Who is asking, which PDF, and may they use its premium extras (highlights, Ask AI)? Students need premium; staff preview. */
export async function premiumGate(request: Request, url: string | null) {
  const me = await whoIs(request);
  if (!me) return { error: Response.json({ error: "sign in" }, { status: 401 }) };
  const path = url ? filePath(url) : null;
  if (!path || !path.startsWith(me.institute)) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  const premium = await isPremiumInstitute(me.institute);
  if (!premium) return { error: Response.json({ locked: "institute" }, { status: 403 }) };
  const state = await loadPart(me.institute, "students", "modules"); // the lessons and the student list, not the whole institute
  const student = me.who.role === "student" ? state.students.find((s) => s.id === me.who.studentIds[0]) : undefined;
  if (!canSeeInsights(me.who.role, premium, student?.premiumUntil, dayKey())) return { error: Response.json({ locked: "premium" }, { status: 402 }) };
  const staff = STAFF.includes(me.who.role);
  // Only real PDF lessons (for a student: of their own batch), not any file whose address someone knows or makes up.
  const lesson = state.modules.some((m) => (staff || (m.published && m.batch === student?.batch)) && m.items.some((it) => it.kind === "pdf" && it.url === url));
  if (!lesson) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  return { me, path, staff, pack: student?.aiPack };
}

