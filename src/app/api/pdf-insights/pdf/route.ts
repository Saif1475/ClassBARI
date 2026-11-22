import { REAL_AUTH } from "@/lib/auth-mode";
import { admin, signedFileUrl } from "@/lib/data-server";
import type { Highlight } from "@/lib/pdf-insights";
import { highlightPdf } from "@/lib/pdf-mark";
import { premiumGate as gate } from "@/lib/pdf-pipeline";

export const dynamic = "force-dynamic";

/**
 * The teacher's own PDF with the highlights written into it: ?file=/api/files/<institute>/<id>. Premium students;
 * teachers preview. Opens the file (a link that works for an hour); phone apps ask with &link=1 for the link itself.
 * Made once and kept in file storage next to the original; made again after a teacher hides or restores a highlight.
 */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const ask = new URL(request.url).searchParams;
  const g = await gate(request, ask.get("file"));
  if ("error" in g) return g.error;
  const db = admin();
  const { data } = await db.from("pdf_insights").select("status, highlights, updated_at").eq("file_path", g.path).maybeSingle();
  if (!data?.highlights) return Response.json({ status: data?.status ?? "queued" }, { status: 409 }); // not read yet
  const copy = `${g.path}-highlighted-v10-${Date.parse(data.updated_at)}.pdf`; // a new name after every change (v: how marks are drawn)
  // shortcut: older copies stay in storage after a teacher's change; delete them here if storage use matters.
  let url = await signedFileUrl(copy);
  if (!url) {
    const { data: blob, error } = await db.storage.from("files").download(g.path);
    if (error || !blob) return Response.json({ error: "file missing" }, { status: 404 });
    try {
      const out = await highlightPdf(new Uint8Array(await blob.arrayBuffer()), data.highlights as Highlight[]);
      const up = await db.storage.from("files").upload(copy, out, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
    } catch (e) {
      console.error("highlighted pdf:", g.path.slice(-12), e instanceof Error ? e.message : e);
      return Response.json({ error: "try again" }, { status: 503 });
    }
    url = await signedFileUrl(copy);
    if (!url) return Response.json({ error: "try again" }, { status: 503 });
  }
  if (ask.get("link")) return Response.json({ url });
  return new Response(null, { status: 302, headers: { Location: url } });
}
