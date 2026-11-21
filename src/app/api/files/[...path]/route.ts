import { REAL_AUTH } from "@/lib/auth-mode";
import { viewFor } from "@/lib/data-access";
import { FILE_PATH, isPublicFile, loadDoc, sessionKey, signedFileUrl, STAFF_ROLES, whoIs, type Me } from "@/lib/data-server";

// Who is asking and which files they may open, remembered for a minute per login. A page with twenty photos asks
// twenty times; without this each photo meant checking the login and reading the whole institute again.
// links: every file in what this person is shown; null for staff (any file of their institute).
type Seen = { me: Me | null; links: Set<string> | null; at: number; missAt: number };
const seen = new Map<string, Seen>();
const open = new Map<string, { ok: boolean; at: number }>(); // free previews, per file
const KEEP_MS = 60_000;
const LINK = /"(\/api\/files\/[0-9a-f-]{36}\/[0-9a-f-]{36})"/g;

async function look(request: Request): Promise<Seen> {
  const me = await whoIs(request);
  let links: Set<string> | null = null;
  if (me && !STAFF_ROLES.includes(me.who.role)) {
    links = new Set();
    for (const m of JSON.stringify(viewFor((await loadDoc(me.institute)).state, me.who)).matchAll(LINK)) links.add(m[1]);
  }
  return { me, links, at: Date.now(), missAt: 0 };
}

/** Opens a stored file for someone allowed to see it: redirects to a link that works for an hour. */
export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!REAL_AUTH) return new Response(null, { status: 404 });
  const path = (await ctx.params).path.join("/");
  if (!FILE_PATH.test(path)) return new Response(null, { status: 404 });
  const institute = path.split("/")[0];
  // Staff: any file of their institute. Students and guardians: only files that appear in what they are shown
  // (their batch's lessons, their own homework, posts they may see), so a link passed on from another batch doesn't open.
  const link = `/api/files/${path}`;
  const allowed = (h: Seen) => h.me?.institute === institute && (!h.links || h.links.has(link));
  const session = sessionKey(request);
  const now = Date.now();
  let hit = session ? seen.get(session) : undefined;
  // Not remembered, or remembered too long ago: look again. A file they couldn't open a moment ago may be one they
  // have just been given (a photo posted seconds ago): look once more, but not on every refused try.
  if (!hit || now - hit.at > KEEP_MS || (!allowed(hit) && now - hit.missAt > 3000)) {
    const missed = !!hit && now - hit.at <= KEEP_MS;
    hit = await look(request);
    if (missed) hit.missAt = now;
    if (session) {
      if (seen.size > 5000) seen.clear();
      seen.set(session, hit);
    }
  }
  let mine = allowed(hit);
  if (!mine) {
    let free = open.get(link);
    if (!free || now - free.at > KEEP_MS) {
      if (open.size > 5000) open.clear();
      open.set(link, (free = { ok: await isPublicFile(institute, link), at: now }));
    }
    mine = free.ok;
  }
  if (!mine) return new Response(null, { status: hit.me ? 403 : 401 });
  const url = await signedFileUrl(path);
  if (!url) return new Response(null, { status: 404 });
  // Phone apps ask with ?link=1 for the link itself (then stream the video or open the PDF from it).
  if (new URL(request.url).searchParams.get("link")) return Response.json({ url }, { headers: { "Cache-Control": "private, max-age=3000" } });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, max-age=3000" } });
}
