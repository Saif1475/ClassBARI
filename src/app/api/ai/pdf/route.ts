import { REAL_AUTH } from "@/lib/auth-mode";
import { chatHtml, htmlToPdf, pdfTurns } from "@/lib/chat-pdf";
import { whoIs } from "@/lib/data-server";
import bn from "@/lib/i18n/bn";
import en from "@/lib/i18n/en";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * An AI chat as a PDF file: { title, messages: [{ role, content, photo? }], lang } → the PDF to download. The same file
 * for the website and the apps. The chat is the person's own (it lives on their device), so it is sent here to print.
 */
export async function POST(request: Request) {
  const me = REAL_AUTH ? await whoIs(request) : null;
  if (REAL_AUTH && !me) return Response.json({ error: "sign in" }, { status: 401 });
  const over = limited(request, "ai-pdf", 10, 60_000, me ? `${me.institute}:${me.who.email ?? me.who.studentIds[0]}` : undefined);
  if (over) return over;
  if (Number(request.headers.get("content-length")) > 1_500_000) return Response.json({ error: "too large" }, { status: 413 });
  const body = (await request.json().catch(() => null)) as { title?: unknown; messages?: unknown; lang?: unknown } | null;
  const turns = pdfTurns(body?.messages);
  if (!turns) return Response.json({ error: "bad request" }, { status: 400 });
  const lang = body?.lang === "bn" ? "bn" : "en";
  const A = (lang === "bn" ? bn : en).aichat;
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : A.title;
  const date = new Date().toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
  try {
    const pdf = await htmlToPdf(chatHtml({ title, turns, you: A.pdfYou, ai: A.title, photo: A.photo, note: A.disclaimer, date }));
    const name = `${title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 60) || "chat"}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="chat.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("ai pdf:", e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 503 });
  }
}
