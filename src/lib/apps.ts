// The four Android apps (Trusted Web Activities). Each opens its own subdomain, so a student and a guardian
// sharing one phone keep separate logins (logins are per web address). Pure: scripts/apps.test.mjs.
import type { Role } from "./role.ts";

export const APPS = {
  student: { sub: "student", name: "ClassBARI Student", short: "CB Student", pkg: "app.classbari.student", color: "#006a60", letter: "S" },
  teacher: { sub: "teacher", name: "ClassBARI Teacher", short: "CB Teacher", pkg: "app.classbari.teacher", color: "#2f4fbf", letter: "T" },
  institute: { sub: "institute", name: "ClassBARI Institution", short: "CB Institution", pkg: "app.classbari.institute", color: "#6b2fb3", letter: "I" },
  parent: { sub: "guardian", name: "ClassBARI Guardian", short: "CB Guardian", pkg: "app.classbari.guardian", color: "#b4470c", letter: "G" },
} satisfies Record<Role, { sub: string; name: string; short: string; pkg: string; color: string; letter: string }>;

const roles = Object.keys(APPS) as Role[];
/** Which app this page runs in: from the subdomain (guardian.classbari.app), or ?app=guardian when testing on localhost. */
export function appFrom(hostname: string, search = ""): Role | null {
  const sub = hostname.split(".")[0];
  if (hostname.includes(".")) {
    const hit = roles.find((r) => APPS[r].sub === sub);
    if (hit) return hit;
  }
  const q = new URLSearchParams(search).get("app");
  return roles.find((r) => APPS[r].sub === q || r === q) ?? null;
}
