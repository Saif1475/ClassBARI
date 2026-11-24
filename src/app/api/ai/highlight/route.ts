import { costUsd, MODELS, budgetPaused, takeTurn, usedTokens } from "@/lib/ai-chat";
import { allowance } from "@/lib/ai-allowance";
import { gate } from "@/lib/ai-gate";
import { HIGHLIGHT_MAX_BYTES, HIGHLIGHT_MAX_PAGES, highlightInput } from "@/lib/chat-tools";
import { admin, aiSpent } from "@/lib/data-server";
import { aiHighlights, basicHighlights, type Highlight } from "@/lib/pdf-insights";
import { highlightPdf, readPages } from "@/lib/pdf-mark";
import { geminiRead } from "@/lib/pdf-pipeline";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NOTE = `This is a student's own study PDF. Leave "transcript" empty on all pages.`;

/**
 * The AI chat's Highlight tool with a PDF attached (website and the AI app): the PDF's bytes (application/pdf, at most
 * 8 MB and 30 pages) → the same PDF with key terms, definitions, formulas and exam points as real highlight marks.
 * Counted in the student's allowance and the monthly budget like a chat answer. The AI reads it when the student's plan
 * has a Gemini model that is switched on and set up; otherwise the non-AI highlights (free).
 */
export async function POST(request: Request) {
  const g = await gate(request);
  if ("error" in g) return g.error;
  const { me, student, plan, ai } = g;
  if (Number(request.headers.get("content-length")) > HIGHLIGHT_MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  const key = `${me.institute}:student:${student.id}`;
  const fast = limited(request, "ai-highlight", 4, 60_000, key);
  if (fast) return fast;
  const pdf = new Uint8Array(await request.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const bad = highlightInput(pdf);
  if (bad) return Response.json({ error: bad }, { status: bad === "too large" ? 413 : 400 });
  const pages = await readPages(pdf).catch(() => null);
  if (!pages) return Response.json({ error: "not pdf" }, { status: 400 });
  if (pages.length > HIGHLIGHT_MAX_PAGES) return Response.json({ error: "pages" }, { status: 413 });

  const release = await takeTurn(key); // one AI job at a time per student, as the chat
  try {
    const a = await allowance(admin(), key, me.institute, plan, ai, student.premiumUntil);
    if (a.over) return Response.json({ error: "limit", resetsAt: a.resetsAt }, { status: 429 });
    // The cheapest Gemini model of the student's plan (only Gemini reads the PDF file itself here).
    const model = g.models.find((id) => MODELS[id]?.provider === "google");
    let highlights: Highlight[] | null = null;
    let tokens = 0, cost = 0;
    if (model) {
      if (budgetPaused(await aiSpent(`${a.day.slice(0, 7)}-01`), ai, plan.pack)) return Response.json({ error: "paused" }, { status: 503 });
      try {
        const read = await geminiRead(model, pdf, NOTE, 120, async (u) => {
          tokens = usedTokens(u);
          cost = costUsd(model, u);
          await a.record(cost, tokens);
        });
        highlights = aiHighlights(read.pages, pages);
        console.info(`ai highlight: ${model} pages=${pages.length} marks=${highlights.length} cost=${cost.toFixed(5)}`);
      } catch (e) {
        console.error("ai highlight:", e instanceof Error ? e.message : e); // the non-AI marks instead
      }
    }
    highlights ??= basicHighlights(pages);
    const out = await highlightPdf(pdf, highlights);
    return new Response(new Uint8Array(out), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store", "X-Highlights": String(highlights.length), "X-Left": String(a.left(tokens, cost)), ...(a.paying ? { "X-Credit": String(a.creditTk(cost)) } : {}) },
    });
  } catch (e) {
    console.error("ai highlight:", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 503 });
  } finally {
    release();
  }
}
