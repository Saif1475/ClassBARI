import { answerIn, basicAnswer, cleanHistory, costUsd, MODELS, packPlan, usedTokens } from "@/lib/ai-chat";
import { allowance } from "@/lib/ai-allowance";
import { modelReady, streamChat } from "@/lib/ai-providers";
import { REAL_AUTH } from "@/lib/auth-mode";
import { admin, aiSpent } from "@/lib/data-server";
import type { PdfPage } from "@/lib/pdf-insights";
import { premiumGate } from "@/lib/pdf-pipeline";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RULES = `You are ClassBARI's study helper for Bangladeshi students (SSC/HSC level). Answer questions about the lesson below.
- Base your answer on the lesson; say which page when you can ("page 3"). If the lesson doesn't cover it, say so briefly, then help with general knowledge.
- Answer in the language the student writes in (Bangla or English). Keep it short and clear, step by step for problems.
- Help the student understand: for homework or exam questions, guide with hints and steps instead of writing a full answer to copy.
- Stay on study topics; politely decline anything else.`;

/** Ask about a PDF lesson (premium students; teachers preview): { file, messages: [{ role, content }] }. */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { file?: unknown; messages?: unknown } | null;
  const g = await premiumGate(request, typeof body?.file === "string" ? body.file : null);
  if ("error" in g) return g.error;
  const history = cleanHistory(body?.messages);
  if (!history) return Response.json({ error: "bad request" }, { status: 400 });

  const db = admin();
  const { data: doc } = await db.from("pdf_insights").select("status, pages").eq("file_path", g.path).maybeSingle();
  if (doc?.status !== "ready") return Response.json({ status: doc?.status ?? "queued" }, { status: 409 }); // still being read
  const pages = (doc.pages ?? []) as PdfPage[];

  // Limits: tokens per person per 12-hour window, and the monthly budget for everyone.
  const key = `${g.me.institute}:${g.me.who.role}:${g.me.who.studentIds[0] ?? g.me.who.name}`;
  const plan = g.staff ? null : packPlan(g.pack); // students: their pack decides the models, tokens and money per window
  const a = await allowance(key, g.me.institute, plan);
  if (a.over) return Response.json({ error: "limit", resetsAt: a.resetsAt }, { status: 429 });
  const fast = limited(request, "ai", 12, 60_000, key); // one question at a time
  if (fast) return fast;
  if ((await aiSpent(`${a.day.slice(0, 7)}-01`)) >= Number(process.env.AI_MONTHLY_BUDGET_USD || 30)) return Response.json({ error: "paused" }, { status: 503 });
  const record = a.record;
  const left = (tokens: number, cost = 0) => a.left(tokens, cost); // % of this window's allowance

  const question = history[history.length - 1].content;
  // Students: the first model of their pack that is set up.
  // Staff previews: AI_CHAT_MODEL or Claude Opus if its key is set, else the strongest model that is.
  const model = plan ? plan.models.find(modelReady) : [process.env.AI_CHAT_MODEL || "claude-opus-5-5", ...Object.keys(MODELS).sort((a, b) => MODELS[b].price[1] - MODELS[a].price[1])].find(modelReady);
  if (!model) {
    await record(0, 0); // no AI used: costs nothing, uses no allowance
    return Response.json({ answer: basicAnswer(pages, question), source: "basic", left: left(0) });
  }
  const lesson = pages.map((p) => `--- Page ${p.n} ---\n${p.text}`).join("\n").slice(0, 150_000); // shortcut: very long PDFs are cut; split by chapter if needed
  try {
    let answer = "";
    // The lesson is the same for every question about this PDF: cached, so follow-up questions cost much less.
    const r = await streamChat({ model, system: [{ text: RULES }, { text: `Lesson:\n${lesson}`, cache: true }, { text: answerIn(question) }], messages: history, maxTokens: 2000 }, (t) => (answer += t));
    const tokens = usedTokens(r.usage);
    const cost = costUsd(model, r.usage);
    await record(cost, tokens);
    if (r.declined) return Response.json({ answer: null, source: "ai", declined: true, left: left(tokens, cost) });
    return Response.json({ answer: answer.trim(), source: "ai", left: left(tokens, cost) });
  } catch (e) {
    console.error("ai chat:", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 503 });
  }
}
