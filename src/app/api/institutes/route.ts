import { REAL_AUTH } from "@/lib/auth-mode";
import { findInstitutes, instituteCard, setListed, whoIs } from "@/lib/data-server";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** "Find your institute": ?q=<name or code> → up to 10 matches; ?id=<uuid> → that one (to show its name again). */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json([], { status: 404 });
  const p = new URL(request.url).searchParams;
  if (p.get("mine")) {
    // The signed-in owner's / teacher's own institute (Settings shows its code to share with families).
    const me = await whoIs(request);
    const card = me && ["owner", "manager", "teacher"].includes(me.who.role) ? await instituteCard(me.institute) : null;
    return card ? Response.json(card, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "sign in" }, { status: 401 });
  }
  // Enough for typing a name letter by letter, too slow for copying the whole list of institutes.
  const over = limited(request, "institute-search", 600, 60_000); // a classroom logging in together shares one address
  if (over) return over;
  const id = p.get("id");
  if (id) {
    const one = await instituteCard(id);
    return one ? Response.json({ id: one.id, name: one.name, code: one.code }) : Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(await findInstitutes(p.get("q") ?? ""), { headers: { "Cache-Control": "public, max-age=60" } });
}

/** The owner shows or hides their institute in the search: { listed: boolean }. */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me || me.who.role !== "owner") return Response.json({ error: "owner only" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { listed?: unknown } | null;
  if (typeof body?.listed !== "boolean") return Response.json({ error: "bad request" }, { status: 400 });
  await setListed(me.institute, body.listed);
  return Response.json(await instituteCard(me.institute));
}
