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
