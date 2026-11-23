// The three Android apps (Trusted Web Activities). Each opens its own subdomain, so a student and a guardian
// sharing one phone keep separate logins (logins are per web address). Teachers and institutes share Instanton Campus
// and pick which on its login page. Pure: scripts/apps.test.mjs.
import type { Role } from "./role.ts";

export type AppId = "student" | "teacher" | "parent";
export const APPS: Record<AppId, { sub: string; name: string; short: string; pkg: string; color: string; letter: string; roles: Role[] }> = {
  student: { sub: "student", name: "Instanton Student", short: "IC Student", pkg: "app.classbari.student", color: "#006a60", letter: "S", roles: ["student"] },
  teacher: { sub: "teacher", name: "Instanton Campus", short: "IC Campus", pkg: "app.classbari.teacher", color: "#4d3fb9", letter: "", roles: ["teacher", "institute"] },
  parent: { sub: "guardian", name: "Instanton Guardian", short: "IC Guardian", pkg: "app.classbari.guardian", color: "#b4470c", letter: "G", roles: ["parent"] },
};

const ids = Object.keys(APPS) as AppId[];
/** Which app this page runs in: from the subdomain (guardian.classbari.app), or ?app=guardian when testing on localhost. */
export function appFrom(hostname: string, search = ""): AppId | null {
  const sub = hostname.split(".")[0];
  if (hostname.includes(".")) {
    const hit = ids.find((a) => APPS[a].sub === sub);
    if (hit) return hit;
  }
  const q = new URLSearchParams(search).get("app");
  return ids.find((a) => APPS[a].sub === q || a === q) ?? null;
}

/** The role to open in an app: the one picked on its login page if the app has it, else the app's first. */
export const roleIn = (app: AppId, picked: string | null | undefined): Role =>
  APPS[app].roles.find((r) => r === picked) ?? APPS[app].roles[0];
