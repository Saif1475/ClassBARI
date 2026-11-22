import { REAL_AUTH } from "@/lib/auth-mode";
import { admin } from "@/lib/data-server";
import { stuckAfterMs, type Highlight } from "@/lib/pdf-insights";
import { premiumGate as gate, queuePdfs } from "@/lib/pdf-pipeline";

export const dynamic = "force-dynamic";
/** The highlighted version of a PDF lesson: ?file=/api/files/<institute>/<id>. Premium students; teachers preview. */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const g = await gate(request, new URL(request.url).searchParams.get("file"));
  if ("error" in g) return g.error;
  const { data } = await admin().from("pdf_insights").select("status, source, pages, highlights, updated_at").eq("file_path", g.path).maybeSingle();
  const pageCount = Array.isArray(data?.pages) ? data.pages.length : 0;
  const stale = data && data.status !== "ready" && Date.now() - Date.parse(data.updated_at) > stuckAfterMs(data.status, pageCount);
  if (!data || stale) {
    if (stale) await admin().from("pdf_insights").update({ status: "queued" }).eq("file_path", g.path);
    queuePdfs(g.me.institute, [g.path]); // not read yet (e.g. uploaded before the institute went premium)
    return Response.json({ status: "queued" });
  }
  // While the AI reads, the basic highlights are shown; `improving` tells the screen to ask again for the AI's.
  const improving = data.status !== "ready";
  if (improving && !data.highlights) return Response.json({ status: data.status });
  // Students don't see highlights a teacher removed; teachers see them greyed out so they can bring them back.
  const highlights = ((data.highlights ?? []) as Highlight[]).map((h, i) => ({ ...h, i })).filter((h) => g.staff || !h.hidden);
  // Page text only for scanned pages (to show what the AI read); other pages are highlighted on the PDF itself.
  const scanned = ((data.pages ?? []) as { n: number; scanned: boolean; text: string }[]).filter((p) => p.scanned).map((p) => ({ n: p.n, text: p.text }));
  return Response.json({ status: "ready", source: data.source, highlights, scanned, canEdit: g.staff, improving });
}

/** A teacher hides a wrong highlight (or brings it back): { file, index, hidden }. */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { file?: unknown; index?: unknown; hidden?: unknown } | null;
  const g = await gate(request, typeof body?.file === "string" ? body.file : null);
  if ("error" in g) return g.error;
  if (!g.staff) return Response.json({ error: "teachers only" }, { status: 403 });
  if (!Number.isInteger(body?.index) || typeof body?.hidden !== "boolean") return Response.json({ error: "bad request" }, { status: 400 });
  const { data } = await admin().from("pdf_insights").select("highlights").eq("file_path", g.path).maybeSingle();
  const list = (data?.highlights ?? []) as Highlight[];
  const i = body!.index as number;
  if (!list[i]) return Response.json({ error: "not found" }, { status: 404 });
  list[i] = { ...list[i], hidden: body!.hidden as boolean };
  await admin().from("pdf_insights").update({ highlights: list, updated_at: new Date().toISOString() }).eq("file_path", g.path);
  return Response.json({ ok: true });
}
