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
export const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/auth/continue");
