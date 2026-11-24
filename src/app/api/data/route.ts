import { REAL_AUTH } from "@/lib/auth-mode";
import { checkAction, heard, newlyPublished, Refused, SAVES_PER_MINUTE, viewFor } from "@/lib/data-access";
import { act, instituteCard, loadChanged, loadDoc, loadPart, publicDocs, whoIs } from "@/lib/data-server";
import { afterSaved } from "@/lib/notify-server";
import { afterAction } from "@/lib/pdf-pipeline";
import { holdPost } from "@/lib/image-check";
import { unkind } from "@/lib/word-filter";
import { MAX_IMAGES } from "@/lib/community";
import { isSuspended } from "@/lib/platform";
import { readPlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";
import { POST_MAX, postLimit, readCapped } from "@/lib/doc-limit";
import { crossSite } from "@/lib/same-site";

export const dynamic = "force-dynamic";

/** This person's view of their institute's data. ?v=<version> answers 204 when nothing changed. */
export async function GET(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const me = await whoIs(request);
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  heard(`${me.institute}:${me.who.role}:${me.who.studentIds[0] ?? me.who.email}`); // screens ask every 15–20 s: a quiz hand-in can tell a real offline wait from a device clock set back
  const seen = Number(new URL(request.url).searchParams.get("v"));
  // Staff also get their institute's name and code (to tell families how to find it at login): asked for alongside the data.
  const card = ["owner", "manager", "teacher"].includes(me.who.role) && !seen ? instituteCard(me.institute) : null;
  // Screens ask again every 15 seconds with the version they have; the data is only fetched when it is a different one.
  const doc = seen > 0 ? await loadChanged(me.institute, seen) : await loadDoc(me.institute);
  if (!doc) return new Response(null, { status: 204 });
  const institute = card ? await card : ["owner", "manager", "teacher"].includes(me.who.role) ? await instituteCard(me.institute) : null;
  return Response.json({ state: viewFor(doc.state, me.who), version: doc.version, role: me.who.role, institute });
}

/** One change: { name, args, base }. Checked against who is asking, then saved. */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  if (crossSite(request)) return Response.json({ error: "cross-site request" }, { status: 403 }); // src/proxy.ts skips this route
  const me = await whoIs(request);
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const quiet = heard(`${me.institute}:${me.who.role}:${me.who.studentIds[0] ?? me.who.email}`);
  // Suspended by Instanton Campus (admin panel): everyone there can still look, but nothing is saved. 423, not 403: the
  // phones and browsers keep their queued changes (cash fees taken offline) and send them once the institute is unsuspended.
  if (isSuspended(await readPlatform(), me.institute))
    return Response.json({ error: "suspended", message: "This institute is suspended by Instanton Campus, so changes can't be saved. Please contact Instanton Campus support." }, { status: 423 });
  // A homework photo is a few MB; nothing a person does by hand needs more than this, or more often.
  // Only a restore may be bigger: it carries the whole institute (up to DOC_MAX), so the owner can restore any backup the server made.
  const max = postLimit(me.who.role);
  if (Number(request.headers.get("content-length")) > max) return Response.json({ error: "too large" }, { status: 413 });
  const over = limited(request, "data", SAVES_PER_MINUTE, 60_000, `${me.institute}:${me.who.role}:${me.who.studentIds[0] ?? me.who.email}`);
  if (over) return over;
  // Read with a limit even when the sender gave no length.
  const text = await readCapped(request, max).catch(() => "");
  if (text === null) return Response.json({ error: "too large" }, { status: 413 });
  const body = (() => {
    try {
      return JSON.parse(text) as { name?: unknown; args?: unknown; base?: unknown } | null;
    } catch {
      return null;
    }
  })();
  if (Buffer.byteLength(text) > POST_MAX && body?.name !== "importBackup") return Response.json({ error: "too large" }, { status: 413 });
  if (!body || typeof body.name !== "string" || !Array.isArray(body.args) || !Number.isSafeInteger(body.base))
    return Response.json({ error: "bad request" }, { status: 400 });
  const { name, args, base } = body as { name: string; args: unknown[]; base: number };
  try {
    // A student's community post is checked first: unkind words or a flagged photo, and it waits for a teacher.
    const images = (args[3] as { images?: unknown } | undefined)?.images;
    if (name === "addCommunityPost" && Array.isArray(images) && images.length > MAX_IMAGES) return Response.json({ error: "not allowed" }, { status: 403 }); // before any photo is checked
    const hold = name === "addCommunityPost" && me.who.role === "student" && (unkind(String(args[1] ?? "")) || (await holdPost(args)));
    // Two institutes never publish one address: visitors (and their bKash payments) would reach the wrong centre.
    // shortcut: two owners publishing the same new address in the same second can both pass; add a unique index on the published slug if that ever matters.
    if (name === "updateSite" && me.who.role !== "teacher") {
      const slug = newlyPublished((await loadPart(me.institute, "site")).site, args[0]);
      if (slug && (await publicDocs({ slug })).some((d) => d.institute !== me.institute)) return Response.json({ error: "address taken" }, { status: 409 });
    }
    let checked: unknown[] = args; // what was really saved: notifications use this, never the raw request
    const doc = await act(me, name, args, base, (s) => {
      const ok = checkAction(name, args, me.who, s, quiet);
      if (ok && hold) ok[3] = { ...(ok[3] as object), held: true }; // set here, never taken from the browser
      if (ok) checked = ok;
      return ok;
    });
    // The change is saved: nothing from here on may answer with an error, or the sender sends it again.
    try {
      void afterAction(me.institute, name, checked).catch(() => {}); // premium: read and highlight a new PDF lesson
      // Notifications it causes (homework posted, marks, absent, messages…), sent after the answer: never slows the save.
      if ("before" in doc && doc.before) void afterSaved(me.institute, name, checked, doc.before, doc.state, { email: me.who.email, staff: ["owner", "manager", "teacher"].includes(me.who.role) });
      return Response.json({ state: viewFor(doc.state, me.who), version: doc.version, role: me.who.role });
    } catch (e) {
      console.error("data: saved, but the answer could not be built:", name, e instanceof Error ? e.message : e);
      return Response.json({ role: me.who.role }); // "saved" without the data or its version: the sender keeps what it shows and asks for the data again
    }
  } catch (e) {
    if (e instanceof Refused) return Response.json({ error: "not allowed" }, { status: 403 });
    console.error("data action failed:", name, e instanceof Error ? e.message : e);
    return Response.json({ error: "try again" }, { status: 503 });
  }
}
