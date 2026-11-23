import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultPlatform, type Platform } from "./platform";
import { REAL_AUTH } from "./auth-mode";
import { clientIp, tooMany } from "./rate-limit";
import { rolesOf, supabaseFromRequest } from "./supabase/server";

// shortcut: one JSON file on the server's disk (like data/leads.jsonl); fine for one server, NOT for
// Vercel/serverless or several servers. Move these tables into Supabase when it is connected.
const FILE = process.env.PLATFORM_FILE || path.join(process.cwd(), "data", "platform.json");
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Platform> {
  try {
    return { ...defaultPlatform(), ...JSON.parse(await readFile(FILE, "utf8")) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultPlatform();
    throw err; // a corrupt file must not be silently replaced with an empty one
  }
}

// Pages ask for the feature switches on every visit, and this file can hold thousands of log lines: the parsed copy
// is kept while the file on disk is unchanged (same time and size), instead of reading and parsing it each time.
// Readers must not change what they get; changes go through updatePlatform, which always reads the file itself.
let kept: { stamp: string; value: Platform } | null = null;
const stampOf = async () => {
  try {
    const f = await stat(FILE);
    return `${f.mtimeMs}:${f.size}`;
  } catch {
    return "none";
  }
};
// Not in the queue: writes land whole (temp file, then rename), so reading never waits behind a slow change (an SMS send).
export const readPlatform = async () => {
  const stamp = await stampOf();
  if (kept?.stamp !== stamp) kept = { stamp, value: await load() };
  return kept.value;
};

/** Change the data one request at a time; write to a temp file then rename so a crash never leaves half a file. */
export function updatePlatform<T>(change: (p: Platform) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const p = await load();
    const out = await change(p);
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(p, null, 1));
    await rename(tmp, FILE);
    kept = null; // the copy readers share is now out of date
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

/** `Authorization: Bearer <ADMIN_TOKEN>` */
export function isAdmin(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  // 20 wrong tries lock that address out for 15 minutes.
  const key = `admin-fail:${clientIp(request)}`;
  if (!process.env.RATE_LIMIT_OFF && tooMany(key, 20, 900_000, Date.now(), 0)) return false;
  const ok = !!token && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok && given) tooMany(key, 20, 900_000);
  return ok;
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

/**
 * Is this request from a teacher / institute owner / manager?
 * Real accounts: asks Supabase (cached 60 s per login, because live-class screens poll every 2 s).
 * Demo: the role cookie. shortcut: in demo anyone can set that cookie; daily limits on SMS/push cap the damage.
 */
const staffCache = new Map<string, { staff: boolean; until: number }>();
export async function isStaffRequest(request: Request) {
  if (!REAL_AUTH) {
    const role = request.headers.get("cookie")?.match(/(?:^|; )edunest-role=([^;]*)/)?.[1];
    return role === "teacher" || role === "institute";
  }
  const session = (request.headers.get("cookie") ?? "").split("; ").filter((c) => c.startsWith("sb-")).join("; ");
  if (!session) return false;
  const hit = staffCache.get(session);
  if (hit && hit.until > Date.now()) return hit.staff;
  const roles = await rolesOf(supabaseFromRequest(request));
  const staff = roles.some((r) => r === "owner" || r === "manager" || r === "teacher");
  if (staffCache.size > 5000) staffCache.clear();
  staffCache.set(session, { staff, until: Date.now() + 60_000 });
  return staff;
}
