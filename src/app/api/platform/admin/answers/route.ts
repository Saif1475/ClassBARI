import { REAL_AUTH } from "@/lib/auth-mode";
import { admin } from "@/lib/data-server";
import { isAdmin } from "@/lib/platform-server";

export const dynamic = "force-dynamic";

/** ClassBARI admin: the AI answers kept for reuse, the most reused first (to spot-check and delete bad ones). */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ answers: [], total: 0 });
  const db = admin();
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80).replace(/[%_\\*,()]/g, "") ?? "";
  let query = db.from("ai_answers").select("id, question, answer, model, lang, hits, created_at", { count: "exact" });
  if (q) query = query.ilike("question", `%${q}%`);
  const { data, count, error } = await query.order("hits", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (error) return Response.json({ error: "Could not read the saved answers. Has migration 0010 been applied?" }, { status: 503 });
  return Response.json({ answers: data ?? [], total: count ?? 0 });
}

/** Delete one saved answer: { id }. The next student who asks gets a fresh answer. */
export async function DELETE(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!Number.isSafeInteger(body?.id)) return Response.json({ error: "bad request" }, { status: 400 });
  const { error } = await admin().from("ai_answers").delete().eq("id", body!.id as number);
  return error ? Response.json({ error: "delete failed" }, { status: 503 }) : Response.json({ ok: true });
}
