// Who may open which part of the app, from the roles the database gives a signed-in person
// (my_access(): owner / manager / teacher of an institute, student, guardian). Pure (scripts/access.test.mjs).

export type DbRole = "owner" | "manager" | "teacher" | "student" | "guardian";
export type Area = "institute" | "teacher" | "student" | "parent" | "settings";

const AREA_ROLES: Record<Area, DbRole[]> = {
  institute: ["owner", "manager"],
  teacher: ["owner", "manager", "teacher"], // owners can also open the instructor view
  student: ["student"],
  parent: ["guardian"],
  settings: ["owner", "manager", "teacher", "student", "guardian"],
};

export const canOpen = (area: string, roles: string[]) => (AREA_ROLES[area as Area] ?? []).some((r) => roles.includes(r));

/** Where to send someone after login. `wanted` is the button they picked on the login page, if it fits their roles. */
export function homeFor(roles: string[], wanted?: string): { path: string; uiRole: "institute" | "teacher" | "student" | "parent" } | null {
  const order: ["institute" | "teacher" | "student" | "parent", Area][] = [
    ["institute", "institute"],
    ["teacher", "teacher"],
    ["student", "student"],
    ["parent", "parent"],
  ];
  const fits = order.filter(([, area]) => canOpen(area, roles));
  const pick = fits.find(([ui]) => ui === wanted) ?? fits[0];
  return pick ? { path: `/${pick[1]}`, uiRole: pick[0] } : null;
}

/** Forget the institute picked earlier on this browser: owners aren't tied to it, and nor is anyone who chose "Institute" or chose nothing (a reset or confirm link opened in a new tab): their roles were never checked against the pick, so a stale one would leave them on an empty screen. */
export const forgetsPickedInstitute = (uiRole: string, wanted?: string) => uiRole === "institute" || !wanted || wanted === "institute";

/** After an institute sign-up: create their centre unless they already own one (being a teacher, student or guardian elsewhere doesn't count). */
export const needsOwnInstitute = (allRoles: string[], signupKind: unknown) => signupKind === "institute" && !allRoles.includes("owner");

/** Owns a centre (from my_access rows; a switched-off owner row isn't listed): the sign-up form must not make or rename one. */
export const ownsInstitute = (rows: { role: string }[] | null | undefined) => !!rows?.some((r) => r.role === "owner");

/** Open their own centre through /auth/continue as if "Institute" was chosen: it forgets an institute picked earlier (B, as a teacher) and the last screen. Returns where to go. */
export const openOwnCentre = (session: Pick<Storage, "setItem">) => (session.setItem("classbari-wanted-role", "institute"), "/auth/continue"); // same key as WANTED in StepLogin

/** An institute sign-up whose first batch never saved (that request failed once, and the centre already exists): the owner's centre is still untouched, so send it again. */
// Not only the owner name: a sign-up with a blank name saved its batch but left teacherName "", and must not add a batch on every login.
export const needsFirstBatch = (signupKind: unknown, view: { role?: string; state?: { teacherName?: string; batches?: unknown[]; staff?: unknown[] } } | null) => signupKind === "institute" && view?.role === "owner" && !view.state?.teacherName && !view.state?.batches?.length && !view.state?.staff?.length;

type Meta = { signup_kind?: unknown; institute?: unknown; full_name?: unknown; phone?: unknown; batch?: unknown; days?: unknown; classDays?: unknown; subject?: unknown; fee?: unknown };
/**
 * After an institute sign-up (run on every login by /auth/continue): create their centre if they own none, then send its first
 * batch if it never saved. Every request names their own centre in the header: the server keys who-is-asking by it, so a teacher
 * or manager at B is never answered as B (B's data untouched). The institute picked on this browser is left alone here.
 */
export async function setUpOwnInstitute(meta: Meta, email: string, d: { access: () => Promise<{ role: string; institute_id: string }[]>; create: () => Promise<{ error: unknown }>; fetch: typeof fetch }): Promise<"skip" | "made" | "failed"> {
  if (meta.signup_kind !== "institute") return "skip";
  let all = await d.access();
  const created = needsOwnInstitute(all.map((r) => r.role), meta.signup_kind);
  if (created) {
    if ((await d.create()).error) return "failed";
    all = await d.access();
  }
  // create_institute hands back an owner's existing centre even when it was switched off (my_access hides it): don't send the batch elsewhere
  const owned = all.find((r) => r.role === "owner");
  if (!owned) return "skip";
  // Asked of their own centre every time, not only right after creating it: a first batch that failed to save once is sent again, one that saved never twice.
  const own = { "x-classbari-institute": owned.institute_id };
  const got = await d.fetch("/api/data", { headers: own, cache: "no-store" });
  if (!got.ok) return created ? "failed" : "skip"; // an owner who signed up long ago still gets in when this check can't be made
  if (!needsFirstBatch(meta.signup_kind, await got.json().catch(() => null))) return "skip"; // an answer that isn't JSON: the next login asks again
  // Their first batch, from the sign-up form (kept with the account until the email was confirmed). A name of only spaces was kept as "": the email instead, as for create_institute.
  const res = await d.fetch("/api/data", {
    method: "POST",
    headers: { ...own, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "signUpTeacher",
      base: Date.now(),
      args: [{ institute: String(meta.institute || ""), name: String(meta.full_name || email || ""), phone: String(meta.phone || ""), batch: String(meta.batch || "Batch 1"), days: String(meta.days || ""), classDays: Array.isArray(meta.classDays) ? meta.classDays : [], subject: String(meta.subject || ""), fee: Number(meta.fee) || 0 }],
    }),
  });
  return res.ok ? "made" : created ? "failed" : "skip"; // a retry that fails (say, the centre was suspended) never locks out an owner: the next login tries again
}

/** Supabase's signUp for an email that already has an account: no error, but a user with no identities, and no email is sent. */
export const emailAlreadyTaken = (user: { identities?: unknown[] } | null | undefined) => !!user && Array.isArray(user.identities) && user.identities.length === 0;

/** Only allow redirects back into our own app (never to another site). */
export function safeNext(next: string | null | undefined): string {
  const here = "http://app.invalid"; // a made-up address, only to see where a browser would really go
  if (!next || !next.startsWith("/")) return "/auth/continue";
  try {
    // Read it the way a browser does (tabs and newlines dropped, "\" taken as "/"): "/\t/evil.com" is really "//evil.com", another site.
    const u = new URL(next, here);
    const path = u.pathname + u.search + u.hash;
    if (u.origin === here && !path.startsWith("//")) return path; // "/.//evil.com" stays on our site but its path is "//evil.com": not that either
  } catch {
    // not an address at all
  }
  return "/auth/continue";
}
