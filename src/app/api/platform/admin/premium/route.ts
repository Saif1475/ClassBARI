import { REAL_AUTH } from "@/lib/auth-mode";
import { admin } from "@/lib/data-server";
import { queueInstitute } from "@/lib/pdf-pipeline";
import { isAdmin, updatePlatform } from "@/lib/platform-server";

/** ClassBARI team: make an institute premium (or not) by its institute code: { code, premium }. */
export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { code?: unknown; premium?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,12}$/.test(code) || typeof body?.premium !== "boolean") return Response.json({ error: "Give the institute code and premium true/false" }, { status: 400 });
  const { data, error } = await admin().from("institutes").update({ premium: body.premium }).eq("code", code).select("id, name, premium");
  if (error || !data?.length) return Response.json({ error: "No institute with that code" }, { status: 404 });
  await updatePlatform((p) => void (p.audit.unshift({ at: new Date().toISOString(), action: "premium", detail: `${data[0].name} (${code}): ${body.premium ? "on" : "off"}` }), (p.audit.length = Math.min(p.audit.length, 500))));
  if (body.premium) await queueInstitute(data[0].id); // read and highlight the PDFs it already has
  return Response.json({ name: data[0].name, premium: data[0].premium });
}
