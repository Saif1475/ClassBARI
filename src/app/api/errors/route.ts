import { report } from "@/lib/alerts";
import { limited } from "@/lib/rate-limit";

/** A browser tells us a screen crashed: { message, page }. Anyone can call this, so it is small and rate-limited. */
export async function POST(request: Request) {
  const over = limited(request, "client-error", 10, 600_000);
  if (over) return over;
  if (Number(request.headers.get("content-length")) > 4000) return Response.json({ error: "too large" }, { status: 413 });
  const body = (await request.json().catch(() => null)) as { message?: unknown; page?: unknown } | null;
  if (typeof body?.message !== "string" || !body.message.trim()) return Response.json({ error: "bad request" }, { status: 400 });
  await report(`browser ${typeof body.page === "string" ? body.page.slice(0, 80) : ""}`, body.message.slice(0, 1000));
  return Response.json({ ok: true });
}
