// Server only: finds the devices for a notification and sends it, to browsers (web push) and to the phone apps
// (Firebase Cloud Messaging). Decides nothing itself: lib/notify.ts says who gets what.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import webpush from "web-push";
import bn from "./i18n/bn.ts";
import en from "./i18n/en.ts";
import { admin, loadDoc } from "./data-server.ts";
import type { LmsState } from "./lms-actions.ts";
import { GROUPS, notesFor, timedNotes, type Later, type Note, type Screen } from "./notify.ts";

type Device = { token: string; kind: "web" | "fcm"; sub: webpush.PushSubscription | null; email: string; role: string; student_ids: number[]; lang: string };

/** The website page for each screen and kind of person (the apps open the matching tab themselves). */
const HOME: Record<string, string> = { student: "/student", guardian: "/parent", teacher: "/teacher", owner: "/institute", manager: "/institute" };
const page = (role: string, screen: Screen) => (HOME[role] ?? "/") + (screen === "home" ? "" : `?go=${screen}`);

/** The devices of everyone in `note.to`, less those who switched its group off and the person who did the action. */
async function devicesFor(institute: string, note: Note, s: LmsState, actor?: string) {
  const db = admin();
  const [{ data: devices }, { data: prefs }] = await Promise.all([
    db.from("push_devices").select("token, kind, sub, email, role, student_ids, lang").eq("institute_id", institute),
    db.from("notify_prefs").select("email, off").eq("institute_id", institute),
  ]);
  const off = new Set((prefs ?? []).filter((p) => (p.off as string[]).includes(note.group)).map((p) => p.email as string));
  const staffEmails = new Set(s.staff.filter((x) => note.to.staff?.includes(x.name) && x.email).map((x) => x.email!.toLowerCase()));
  const hits = (ids: number[] | undefined, mine: number[]) => !!ids?.some((id) => mine.includes(id));
  return ((devices ?? []) as Device[]).filter((d) => {
    if (d.email === actor || off.has(d.email)) return false;
    if (d.role === "student") return hits(note.to.students, d.student_ids);
    if (d.role === "guardian") return hits(note.to.guardians, d.student_ids);
    if (staffEmails.has(d.email)) return true;
    return !!note.to.owners && (d.role === "owner" || d.role === "manager");
  });
}

/** Send one notification now. A `once` note already sent is skipped (the key is claimed first, so two servers can't both send it). */
export async function send(institute: string, note: Note, s: LmsState, actor?: string) {
  if (note.once) {
    const { error } = await admin().from("notify_sent").insert({ key: `${institute}:${note.once}` });
    if (error) return 0; // already sent (or the table is missing: then nothing is sent twice either)
  }
  const devices = await devicesFor(institute, note, s, actor);
  const gone: string[] = [];
  await Promise.allSettled(
    devices.map(async (d) => {
      const words = (d.lang === "bn" ? bn : en).notify as unknown as Record<string, (...v: unknown[]) => [string, string]>;
      const [key, ...vars] = note.text;
      const [title, body] = words[key]?.(...vars) ?? [key, ""];
      const ok = d.kind === "web" ? await webSend(d, title, body, page(d.role, note.screen)) : await fcmSend(d.token, title, body, note.screen);
      if (ok === "gone") gone.push(d.token);
    }),
  );
  if (gone.length) await admin().from("push_devices").delete().in("token", gone); // uninstalled, or notifications turned off on the phone
  return devices.length;
}

/** After an action is saved: send what it causes now, and file what waits for later. Never throws. */
export async function afterSaved(institute: string, name: string, args: unknown[], before: LmsState, after: LmsState, actor: { email?: string; staff: boolean }) {
  try {
    const { now, later } = notesFor(name, args, before, after, actor.staff);
    if (later.length) await fileLater(institute, later);
    for (const n of now) await send(institute, n, after, actor.email);
  } catch (e) {
    console.error("notify:", e instanceof Error ? e.message : e);
  }
}

async function fileLater(institute: string, later: Later[]) {
  const rows = later.map((l) => ({ key: `${institute}:${l.note.once}`, institute_id: institute, due_at: new Date(Date.now() + l.afterMin * 60_000).toISOString(), what: l }));
  await admin().from("notify_later").upsert(rows, { onConflict: "key", ignoreDuplicates: true }); // the first marking sets the time
}

/**
 * Every few minutes: what was waiting (an absence) if it still stands, and the timed ones (homework due tomorrow,
 * the AI pack ending, the month's fee) for every institute.
 */
export async function runTimed(now = new Date()) {
  const db = admin();
  let sent = 0;
  const docs = new Map<string, LmsState>();
  const state = async (inst: string) => docs.get(inst) ?? docs.set(inst, (await loadDoc(inst)).state).get(inst)!;
  const { data: due } = await db.from("notify_later").select("key, institute_id, what").lte("due_at", now.toISOString()).limit(500);
  for (const row of due ?? []) {
    await db.from("notify_later").delete().eq("key", row.key);
    const l = row.what as Later;
    const s = await state(row.institute_id);
    const [day, id] = l.still.absent;
    if (s.attendance[day]?.includes(id)) sent += await send(row.institute_id, l.note, s);
  }
  // shortcut: reads every institute with a device each run; fine for hundreds, move to a per-institute queue for thousands.
  const { data: insts } = await db.from("push_devices").select("institute_id");
  for (const inst of new Set((insts ?? []).map((r) => r.institute_id as string)))
    for (const n of timedNotes(await state(inst), now)) sent += await send(inst, n, await state(inst));
  await db.from("notify_sent").delete().lt("at", new Date(now.getTime() - 60 * 86400_000).toISOString()); // old marks
  return sent;
}

/** Add or refresh this device for this person. */
export async function saveDevice(institute: string, who: { email?: string; role: string; studentIds: number[] }, d: { kind: "web" | "fcm"; token: string; sub?: unknown; lang?: unknown }) {
  if (!who.email) return;
  await admin().from("push_devices").upsert({ token: d.token, kind: d.kind, sub: d.sub ?? null, institute_id: institute, email: who.email, role: who.role, student_ids: who.studentIds, lang: d.lang === "bn" ? "bn" : "en", updated_at: new Date().toISOString() });
}
export const forgetDevice = (token: string, email: string) => admin().from("push_devices").delete().eq("token", token).eq("email", email);

/** A person's switches: the groups they turned off. */
export async function getOff(institute: string, email: string) {
  const { data } = await admin().from("notify_prefs").select("off").eq("institute_id", institute).eq("email", email).maybeSingle();
  return (data?.off as string[] | undefined) ?? [];
}
export const setOff = (institute: string, email: string, off: unknown) =>
  admin().from("notify_prefs").upsert({ institute_id: institute, email, off: Array.isArray(off) ? off.filter((g): g is string => (GROUPS as readonly string[]).includes(g)) : [] });

// ---- sending ------------------------------------------------------------------------------------------------------
async function webSend(d: Device, title: string, body: string, url: string): Promise<"ok" | "gone" | "failed"> {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  if (!pub || !priv || !d.sub) return "failed";
  webpush.setVapidDetails(process.env.NEXT_PUBLIC_SITE_URL || "mailto:support@classbari.app", pub, priv);
  try {
    await webpush.sendNotification(d.sub, JSON.stringify({ title, body, url }), { TTL: 86400 });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "failed";
  }
}

/** The Firebase service account (a JSON file saved next to .env.local; its path in FIREBASE_SERVICE_ACCOUNT). */
let account: { project_id: string; client_email: string; private_key: string; token_uri: string } | null | undefined;
let access: { token: string; until: number } | null = null;
function firebase() {
  if (account !== undefined) return account;
  try {
    account = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, "utf8")) : null;
  } catch {
    console.error("notify: FIREBASE_SERVICE_ACCOUNT can't be read");
    account = null;
  }
  return account;
}
/** A short-lived Google access token, from a signed request (the standard service-account flow, no extra library). */
async function googleToken() {
  const a = firebase();
  if (!a) return null;
  if (access && access.until > Date.now() + 60_000) return access.token;
  const b64 = (x: object | string) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
  const t = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: a.token_uri, iat: t, exp: t + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(head).sign(a.private_key, "base64url");
  const res = await fetch(a.token_uri, { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${sig}` }), signal: AbortSignal.timeout(15_000) });
  const d = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!d.access_token) return console.error("notify: Google refused the Firebase sign-in", res.status), null;
  access = { token: d.access_token, until: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return access.token;
}
async function fcmSend(token: string, title: string, body: string, screen: Screen): Promise<"ok" | "gone" | "failed"> {
  const bearer = await googleToken();
  if (!bearer) return "failed";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${firebase()!.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { token, notification: { title, body }, data: { screen }, android: { priority: "HIGH" } } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (res?.ok) return "ok";
  return res && (res.status === 404 || (await res.text()).includes("UNREGISTERED")) ? "gone" : "failed";
}
