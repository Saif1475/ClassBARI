// Server only: loads and saves each institute's data in Supabase with the secret key, after
// data-access.ts has decided what the signed-in person may do. Never import this from the browser.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bestStaffRow, peopleToSync, Refused, rosterOf, runAction, staffName, teachersOf, topId, type Who } from "./data-access";
import { blankState, idBase, rollFees, type LmsState } from "./lms-actions";
import { FULL, guardedFetch, MAX_FILE_BYTES } from "./doc-limit";
import { REAL_AUTH } from "./auth-mode";
import { changeKey, ranBefore, ranNow } from "./ran-before";
import { isStaffRequest } from "./platform-server";
import { supabaseFromRequest } from "./supabase/server";

// One client for the whole server (it keeps no login of its own), instead of building a new one for every query.
let client: SupabaseClient | undefined;
export const admin = () =>
  (client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guardedFetch } }));

export type Me = { institute: string; who: Who };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The institute picked on the login screen ("Find your institute"): phone apps send a header, the website a cookie. */
export function chosenInstitute(request: Request) {
  const fromHeader = request.headers.get("x-classbari-institute");
  const fromCookie = request.headers.get("cookie")?.match(/(?:^|;\s*)classbari-institute=([0-9a-f-]{36})/)?.[1];
  const id = (fromHeader || fromCookie || "").toLowerCase();
  return UUID.test(id) ? id : null;
}

/** The guardian side was picked: the Guardian app sends a header, the website keeps its panel in the edunest-role cookie. Only chooses among the person's real roles. */
export const wantsGuardian = (request: Request) => request.headers.get("x-classbari-role") === "guardian" || /(?:^|;\s*)edunest-role=parent(?:;|$)/.test(request.headers.get("cookie") ?? "");

/**
 * Who is asking, remembered for 30 s per login: every open screen asks every 15 s, and each answer took three calls
 * to Supabase. shortcut: someone removed keeps access for up to 30 s; check the members table on writes if that matters.
 */
const whoCache = new Map<string, { me: Promise<Me | null>; until: number }>();
export function whoIs(request: Request): Promise<Me | null> {
  const login = sessionKey(request);
  if (!login) return findWho(request);
  const key = `${login}|${request.headers.get("x-classbari-institute") ?? ""}|${wantsGuardian(request)}`;
  const hit = whoCache.get(key);
  if (hit && hit.until > Date.now()) return hit.me;
  const me = findWho(request);
  if (whoCache.size > 20_000) whoCache.clear();
  whoCache.set(key, { me, until: Date.now() + 30_000 });
  me.then((m) => m || whoCache.delete(key), () => whoCache.delete(key)); // not found or failed: ask afresh next time (a new student can sign in at once)
  return me;
}

/** Who is asking (checked with Supabase, not just the cookie) and which institute they belong to. */
async function findWho(request: Request): Promise<Me | null> {
  // Phone apps send "Authorization: Bearer <token>"; the website sends its login cookie.
  const bearer = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  const { data, error: authError } = bearer ? await admin().auth.getUser(bearer) : await supabaseFromRequest(request).auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) {
    if (bearer || request.headers.get("cookie")?.includes("sb-")) console.warn("data: login cookie not accepted:", authError?.message);
    return null;
  }
  const db = admin();
  // With an institute chosen at login, only that institute counts (someone at two centres gets the one they picked).
  const pick = chosenInstitute(request);
  let staffQ = db.from("members").select("institute_id, role, name").eq("email", email).eq("active", true);
  if (pick) staffQ = staffQ.eq("institute_id", pick);
  let rosterQ = db.from("roster").select("institute_id, role, student_id").eq("email", email);
  if (pick) rosterQ = rosterQ.eq("institute_id", pick);
  // Both sign-in lists are asked at the same time: most people are students or guardians, and no longer wait for the staff list first.
  // No pick: read their few staff rows and open the highest rank (an owner of A who teaches at B gets A), not whichever row comes first.
  const [{ data: staff, error }, { data: rows }] = await Promise.all([staffQ.limit(pick ? 1 : 50), rosterQ]);
  if (error) console.error("data: members lookup failed:", error.message);
  // Picked the guardian side (Guardian app, or "Guardian" on the website) and is a guardian here: a teacher whose own child studies at their centre.
  const asGuardian = wantsGuardian(request) && !!rows?.some((r) => r.role === "guardian");
  const top = asGuardian ? undefined : bestStaffRow(staff);
  if (top) return { institute: top.institute_id, who: { role: top.role, name: top.name, studentIds: [], email } };
  if (!rows?.length) return null;
  // shortcut: someone who is both a student and a guardian, or in two institutes, gets the first; add a switcher if that happens.
  const role = !asGuardian && rows.some((r) => r.role === "student") ? "student" : "guardian";
  const first = rows.find((r) => r.role === role)!;
  const ids = rows.filter((r) => r.role === role && r.institute_id === first.institute_id).map((r) => r.student_id as number);
  return { institute: first.institute_id, who: { role, name: "", studentIds: ids, email } }; // email: notification devices and switches are kept per person
}

export const STAFF_ROLES = ["owner", "manager", "teacher"];

/**
 * Live screens (class, polls, the quiz game) ask every second or two, so who is asking is remembered for 30 s.
 * Real accounts: a session belongs to one institute's batch ("<institute>:<batch>") and only its staff, students and
 * their guardians may touch it. Demo: the batch name and the role cookie.
 */
/** What identifies a login in a request (its token or login cookies, and the institute picked): the key for short-lived memory. */
export const sessionKey = (request: Request) =>
  request.headers.get("authorization")?.concat(wantsGuardian(request) ? "|guardian" : "") || (request.headers.get("cookie") ?? "").split("; ").filter((c) => c.startsWith("sb-") || c.startsWith("classbari-institute=") || c.startsWith("edunest-role=")).join("; ");
const liveCache = new Map<string, { who: { institute: string; staff: boolean; batches: Set<string> | null; person: string; own: { id: number; name: string; batch: string }[] } | null; until: number }>();
/** `person` (real accounts only): the signed-in email, so one person gets one vote whatever voter id their device sends. */
/** `own` (real accounts, non-staff): the students this login is in this batch (none for guardians), so a live class never takes a name or student id from the device. */
export async function liveScope(request: Request, batch: string): Promise<{ key: string; staff: boolean; person?: string; own?: { id: number; name: string }[] } | null> {
  if (!REAL_AUTH) return { key: batch, staff: await isStaffRequest(request) };
  const session = sessionKey(request);
  if (!session) return null;
  let hit = liveCache.get(session);
  if (!hit || hit.until <= Date.now()) {
    const me = await whoIs(request);
    const staff = !!me && STAFF_ROLES.includes(me.who.role);
    // Students and guardians: only their own batches. Teachers: the batches they teach (as /api/data allows). Owner and manager: every batch (null).
    const mine = !me || staff ? [] : (await loadPart(me.institute, "students")).students.filter((s) => me.who.studentIds.includes(s.id));
    const taught = me?.who.role === "teacher" ? await loadPart(me.institute, "batches", "staff") : null;
    const batches = taught ? new Set(taught.batches.filter((b) => b.teacher === staffName(taught, me!.who)).map((b) => b.name)) : !me || staff ? null : new Set(mine.map((s) => s.batch));
    const own = me?.who.role === "student" ? mine.map((s) => ({ id: s.id, name: s.name, batch: s.batch })) : [];
    hit = { who: me && { institute: me.institute, staff, batches, person: me.who.email ?? "", own }, until: Date.now() + 30_000 };
    if (liveCache.size > 5000) liveCache.clear();
    liveCache.set(session, hit);
  }
  const who = hit.who;
  return who && (!who.batches || who.batches.has(batch)) ? { key: `${who.institute}:${batch}`, staff: who.staff, person: who.person || undefined, own: who.staff ? undefined : who.own.filter((s) => s.batch === batch).map(({ id, name }) => ({ id, name })) } : null;
}

/** What "Ask AI" and PDF highlighting cost since a date (US$), added up in the database so no row limit can hide spending. */
export async function aiSpent(since: string) {
  const { data, error } = await admin().rpc("ai_spent", { since });
  if (error) throw new Error(`ai budget check failed: ${error.message}`);
  return Number(data ?? 0);
}

type Doc = { state: LmsState; version: number; stamp: string };
/** Names one exact saved copy: its version and the moment it was saved. */
const stampOf = (version: number, savedAt: string | null | undefined) => `${version}|${savedAt ? Date.parse(savedAt) : 0}`;
type Row = { state?: Partial<LmsState>; version: number; updated_at?: string } | null;
// New fields of the app start empty; the month's fees and fines are worked out on every load.
const asDoc = (data: Row): Doc => ({ state: rollFees({ ...blankState(), ...(data?.state ?? {}) }), version: data ? Number(data.version) : 0, stamp: data ? stampOf(Number(data.version), data.updated_at) : "" });

/**
 * The last copy of each institute this server read or saved, by version. Screens ask again after every change, so
 * without it each of hundreds of open screens downloaded the whole institute for the same new version.
 * Safe: a version names one exact saved copy, and saves only go through when the version is still the newest.
 */
const latest = new Map<string, { version: number; doc: Promise<Doc> }>();
const remember = (institute: string, version: number, doc: Promise<Doc>) => {
  latest.delete(institute); // the newest last, so the oldest goes first when the memory is full
  latest.set(institute, { version, doc });
  if (latest.size > 300) latest.delete(latest.keys().next().value!);
  doc.catch(() => latest.get(institute)?.doc === doc && latest.delete(institute));
};
async function fetchDoc(institute: string): Promise<Doc> {
  const { data, error } = await admin().from("institute_data").select("state, version, updated_at").eq("institute_id", institute).maybeSingle();
  if (error) throw new Error(`load failed: ${error.message}`);
  return asDoc(data as Row);
}
/** Version `v` of an institute: from memory when this server already has it, else fetched once for everyone asking. */
async function docAt(institute: string, v: number): Promise<Doc> {
  const hit = latest.get(institute);
  if (hit?.version === v) {
    const d = await hit.doc;
    return { ...d, state: rollFees(d.state) }; // a new month may have started since it was kept
  }
  const doc = fetchDoc(institute);
  remember(institute, v, doc);
  const d = await doc;
  if (d.version !== v) remember(institute, d.version, doc); // saved again in between: it is the newer copy
  return d;
}
const versionOf = async (institute: string) => {
  const { data, error } = await admin().from("institute_data").select("version").eq("institute_id", institute).maybeSingle();
  if (error) throw new Error(`load failed: ${error.message}`);
  return data ? Number(data.version) : 0;
};

export async function loadDoc(institute: string): Promise<Doc> {
  const v = await versionOf(institute);
  return v ? docAt(institute, v) : asDoc(null);
}

/**
 * The same, but only if it changed since version `seen`: null means "still what you have". Screens ask every few
 * seconds, and almost always nothing changed, so the whole institute is no longer fetched just to compare a number.
 */
export async function loadChanged(institute: string, seen: number): Promise<Doc | null> {
  const v = await versionOf(institute);
  return v && v !== seen ? docAt(institute, v) : null;
}

/**
 * Only some parts of an institute's data, for checks that need (say) the student list and not everything else.
 * Not for saving: the month's fees are not worked out here.
 */
export async function loadPart<K extends keyof LmsState>(institute: string, ...keys: K[]): Promise<Pick<LmsState, K>> {
  const { data, error } = await admin().from("institute_data").select(keys.map((k) => `${String(k)}:state->${String(k)}`).join(", ")).eq("institute_id", institute).maybeSingle();
  if (error) throw new Error(`load failed: ${error.message}`);
  const empty = blankState();
  const got = (data ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, got[k as string] ?? empty[k]])) as Pick<LmsState, K>;
}

/** Saves only if nobody else saved since `version` was read. Returns the new version and its stamp, or null to retry. */
async function saveDoc(institute: string, state: LmsState, version: number) {
  const db = admin();
  const savedAt = new Date().toISOString();
  const tooBig = (error: { message?: string } | null) => {
    if (error?.message?.includes(FULL)) throw new Refused(FULL); // refused by guardedFetch before it was sent
  };
  if (version === 0) {
    const { error } = await db.from("institute_data").insert({ institute_id: institute, state, version: 1, updated_at: savedAt });
    tooBig(error);
    if (error && error.code !== "23505") throw new Error(`save failed: ${error.message}`); // 23505: someone else saved first, retry
    return error ? null : { version: 1, stamp: stampOf(1, savedAt) };
  }
  const { data, error } = await db
    .from("institute_data")
    .update({ state, version: version + 1, updated_at: savedAt })
    .eq("institute_id", institute)
    .eq("version", version)
    .select("version");
  tooBig(error);
  if (error) throw new Error(`save failed: ${error.message}`);
  return data?.length ? { version: version + 1, stamp: stampOf(version + 1, savedAt) } : null;
}

/**
 * The highest id in each institute's data as this server last saved it. Finding it means reading the whole institute
 * as text, so it is remembered: the next save of that exact copy (same stamp) starts from it. Any other copy (saved by
 * another server, restored, or after a restart) is simply searched again.
 */
const tops = new Map<string, { stamp: string; top: number }>();
const maxStudentId = (s: LmsState) => s.students.reduce((top, x) => (typeof x.id === "number" && x.id > top ? x.id : top), 0);

/** Saves of one institute on this server, one after another: at the same moment they only made each other retry. */
const queues = new Map<string, Promise<unknown>>();

/** Load, check, apply, save — retried when two people save at the same moment. */
export function act(me: Me, name: string, args: unknown[], base: number, check: (s: LmsState) => unknown[] | null) {
  const run = (queues.get(me.institute) ?? Promise.resolve()).then(() => actNow(me, name, args, base, check));
  const tail = run.catch(() => {});
  queues.set(me.institute, tail);
  tail.then(() => queues.get(me.institute) === tail && queues.delete(me.institute));
  return run;
}

/** Checking or applying a change gives the same result every time it is sent: if it crashes, it is refused (and logged), or the sender's queue would wait on it forever. */
function same<T>(name: string, run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (e instanceof Refused) throw e;
    console.error("data: this change can't be applied:", name, e instanceof Error ? e.message : e);
    throw new Refused("can't be applied");
  }
}

async function actNow(me: Me, name: string, args: unknown[], base: number, check: (s: LmsState) => unknown[] | null) {
  // Sent again because its answer never arrived: it is already in the data, so the answer is the data as it is now (see ran-before.ts).
  const change = changeKey(me.who, name, args, base);
  if (ranBefore(me.institute, change)) return loadDoc(me.institute);
  let stored: unknown[] | null = null;
  let storedFor = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    // The copy this server saved last, if it still has it (no download); a save from elsewhere makes it fail and reload.
    const kept = attempt === 0 ? latest.get(me.institute) : undefined;
    const doc = kept ? await kept.doc.then((d) => ({ ...d, state: rollFees(d.state) }), () => loadDoc(me.institute)) : await loadDoc(me.institute);
    const ok = same(name, () => check(doc.state));
    if (ok === null) return doc;
    // Photos and files go to file storage once (not again on a retry); the data keeps a short link.
    const key = JSON.stringify(ok);
    if (key !== storedFor) [stored, storedFor] = [(await storeInlineFiles(me.institute, ok)) as unknown[], key];
    const known = tops.get(me.institute);
    const top = known?.stamp === doc.stamp && doc.stamp ? known.top : topId(doc.state);
    const next = same(name, () => runAction(doc.state, name, stored!, base, top));
    const used = idBase(); // read straight away: the last id this action handed out
    const saved = await saveDoc(me.institute, next, doc.version);
    if (saved === null) {
      latest.delete(me.institute); // someone else saved: read their copy
      continue;
    }
    ranNow(me.institute, change);
    const version = saved.version;
    remember(me.institute, version, Promise.resolve({ state: next, version, stamp: saved.stamp }));
    // Ids in the new copy: the old ones, the ones just made, any that came in with the action, and new roll numbers.
    // A restored backup brings its own ids (inside a text), so that copy is searched afresh next time.
    if (name === "importBackup") tops.delete(me.institute);
    else tops.set(me.institute, { stamp: saved.stamp, top: Math.max(top, used, topId(stored), next.students === doc.state.students ? 0 : maxStudentId(next)) });
    if (tops.size > 10_000) tops.clear();
    // The change is saved: a problem from here on is logged, never answered as an error (the sender would send the change again).
    // Each step on its own: a failed sign-in list write must not skip the name.
    for (const step of [syncPeople, syncName]) {
      try {
        await step(me.institute, doc.state, next);
      } catch (e) {
        console.error("data: saved, but a step after the save failed:", name, e instanceof Error ? e.message : e);
      }
    }
    return { state: next, version, before: doc.state };
  }
  throw new Error("busy");
}

/**
 * Institutes whose sign-in lists may be out of step because a write failed after the save went through: their next
 * save writes both lists whatever changed. shortcut: kept in memory, so a restart or another server forgets it; keep a flag in the database if that matters.
 */
const peopleBehind = new Set<string>();

/** Institutes whose name in the institutes table could not be written: their next save writes it again. shortcut: in memory, like peopleBehind. */
const nameBehind = new Set<string>();

/** "Find your institute" searches the institutes table: keep its name the same as the one the owner set. Throws on a failed write. */
async function syncName(institute: string, before: LmsState, after: LmsState) {
  if (!after.instituteName || (after.instituteName === before.instituteName && !nameBehind.has(institute))) return;
  nameBehind.add(institute); // until the write goes through
  const { error } = await admin().from("institutes").update({ name: after.instituteName }).eq("id", institute);
  if (error) throw new Error(`institute name update failed: ${error.message}`);
  nameBehind.delete(institute);
}

/** Keep sign-in lists in step: student/guardian Gmails (roster) and teachers added with an email (members). Throws on any failed write. */
async function syncPeople(institute: string, before: LmsState, after: LmsState) {
  const need = peopleToSync(before, after, peopleBehind.has(institute));
  if (!need.roster && !need.teachers) return;
  peopleBehind.add(institute); // until both lists are written; a throw below leaves it set so the next save tries again
  const db = admin();
  if (need.roster) {
    const roster = rosterOf(after);
    const key = (r: { email: string; role: string; student_id: number }) => `${r.email}|${r.role}|${r.student_id}`;
    const keep = new Set(roster.map(key));
    if (roster.length) {
      const { error } = await db.from("roster").upsert(roster.map((r) => ({ institute_id: institute, ...r })), { ignoreDuplicates: true });
      if (error) throw new Error(`roster update failed: ${error.message}`); // a new student could not sign in
    }
    // Remove sign-ins of students who left. The API returns at most 1000 rows at a time, so read every page.
    const old: { email: string; role: string; student_id: number }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("roster").select("email, role, student_id").eq("institute_id", institute).order("email").order("role").order("student_id").range(from, from + 999);
      if (error) throw new Error(`roster read failed: ${error.message}`);
      old.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    for (const r of old.filter((r) => !keep.has(key(r)))) {
      const { error } = await db.from("roster").delete().match({ institute_id: institute, email: r.email, role: r.role, student_id: r.student_id });
      if (error) throw new Error(`roster removal failed: ${error.message}`); // someone removed must not keep their sign-in silently
    }
  }
  if (need.teachers) {
    const now = teachersOf(after);
    if (now.length) {
      const { error } = await db.from("members").upsert(now.map((x) => ({ institute_id: institute, role: "teacher", ...x })), { onConflict: "institute_id,email", ignoreDuplicates: true });
      if (error) throw new Error(`members update failed: ${error.message}`);
    }
    const { data: old, error } = await db.from("members").select("id, email").eq("institute_id", institute).eq("role", "teacher");
    if (error) throw new Error(`members read failed: ${error.message}`); // a removed teacher must not keep signing in
    const emails = new Set(now.map((x) => x.email));
    for (const m of (old ?? []).filter((m) => !emails.has(m.email))) {
      const { error } = await db.from("members").delete().eq("id", m.id);
      if (error) throw new Error(`members removal failed: ${error.message}`);
    }
  }
  peopleBehind.delete(institute);
}

/** Institutes for the public pages: by website address, by a batch id (join links), or all with public batches. */
export async function publicDocs(by: { slug?: string; batch?: string }) {
  const one = !!(by.slug || by.batch);
  // The list of all public courses needs only the batches, and only of institutes that have a public one
  // (before, it fetched the lessons and students of the first 200 institutes, public or not).
  let q = admin()
    .from("institute_data")
    .select(one ? "institute_id, teacherName:state->teacherName, instituteName:state->instituteName, site:state->site, batches:state->batches, modules:state->modules, students:state->students" : "institute_id, batches:state->batches");
  if (by.slug) q = q.eq("state->site->>slug", by.slug).eq("state->site->>published", "true");
  if (by.batch) q = q.filter("state->batches", "cs", JSON.stringify([{ id: by.batch }]));
  if (!one) q = q.filter("state->batches", "cs", JSON.stringify([{ public: true }]));
  // shortcut: at most 200 institutes with public courses; add paging when there are more.
  // By slug: two, so a check can see another institute's page beside this one's; always in the same order, so an address is never shared at random.
  const { data, error } = await q.order("institute_id").limit(by.slug ? 2 : one ? 1 : 200);
  if (error) throw new Error("load failed");
  return ((data ?? []) as unknown as ({ institute_id: string } & Partial<LmsState>)[]).map(({ institute_id, ...part }) => ({ institute: institute_id, state: { ...blankState(), ...part } }));
}

// ---- Files (videos, PDFs, photos): a private Supabase Storage bucket, one folder per institute.
// The app links to /api/files/<institute>/<id>, which checks who is asking and hands out a short-lived link.
const BUCKET = "files";
let bucket: Promise<void> | null = null;
/** Pictures, PDFs, video and sound only: nothing that a browser would run as a page. */
const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif", "application/pdf", "video/*", "audio/*"];
const typeAllowed = (type: string) => FILE_TYPES.some((t) => (t.endsWith("/*") ? type.startsWith(t.slice(0, -1)) : t === type));
const ensureBucket = () =>
  (bucket ??= admin()
    .storage.createBucket(BUCKET, { public: false, allowedMimeTypes: FILE_TYPES, fileSizeLimit: MAX_FILE_BYTES }) // "already exists" is fine
    .then(() => admin().storage.updateBucket(BUCKET, { public: false, allowedMimeTypes: FILE_TYPES, fileSizeLimit: MAX_FILE_BYTES })) // a bucket made before these rules gets them too
    .then(() => undefined)
    .catch(() => void (bucket = null))); // network trouble: try again on the next upload
export const FILE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

/** A one-time upload slot, so big videos go straight from the browser to storage. */
export async function uploadSlot(institute: string) {
  await ensureBucket();
  const path = `${institute}/${randomUUID()}`;
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`upload slot failed: ${error.message}`);
  return { path, token: data.token, url: `/api/files/${path}` };
}

export async function signedFileUrl(path: string) {
  const { data } = await admin().storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Free course previews may be watched without signing in. */
export async function isPublicFile(institute: string, url: string) {
  const state = await loadPart(institute, "batches", "modules").catch(() => blankState());
  const open = new Set(state.batches.filter((b) => b.public).map((b) => b.name));
  return state.modules.some((m) => m.published && open.has(m.batch) && m.items.some((it) => it.preview && it.url === url));
}

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+)?(?:;[\w=.+-]+)*;base64,/;
/** Replace data: URLs (uploaded photos/files) anywhere in an action's arguments with stored-file links. */
export async function storeInlineFiles(institute: string, value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    const m = DATA_URL.exec(value);
    if (!m) return value;
    const type = (m[1] || "").toLowerCase();
    if (!typeAllowed(type)) throw new Refused("file type"); // also the tiny ones: a web page fits in a few bytes
    if (value.length < 4096) return value; // tiny icons stay inline
    await ensureBucket();
    const path = `${institute}/${randomUUID()}`;
    const { error } = await admin().storage.from(BUCKET).upload(path, Buffer.from(value.slice(m[0].length), "base64"), { contentType: type });
    if (error) throw new Error(`upload failed: ${error.message}`);
    return `/api/files/${path}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => storeInlineFiles(institute, v)));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await storeInlineFiles(institute, v)])));
  return value;
}

// ---- Institute directory ("Find your institute" before logging in) ----
export type InstituteCard = { id: string; name: string; code: string; listed?: boolean };

/** Up to 10 listed institutes whose name contains `q`, or the one with exactly that code (listed or not). */
export async function findInstitutes(q: string): Promise<InstituteCard[]> {
  const term = q.trim().slice(0, 60);
  const db = admin();
  // Nothing typed yet: the list to scroll through (institutes that chose to be listed), A to Z.
  // shortcut: the first 100 only; with more institutes than that, people type a few letters or the code.
  if (term.length < 2) return ((await db.from("institutes").select("id, name, code").eq("listed", true).order("name").limit(100)).data ?? []) as InstituteCard[];
  const code = term.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [byCode, byName] = await Promise.all([
    code.length >= 4 ? db.from("institutes").select("id, name, code").eq("code", code).limit(1) : Promise.resolve({ data: [] }),
    db.from("institutes").select("id, name, code").eq("listed", true).ilike("name", `%${term.replace(/[%_\\*]/g, "")}%`).order("name").limit(10),
  ]);
  const all = [...(byCode.data ?? []), ...(byName.data ?? [])] as InstituteCard[];
  return all.filter((x, i) => all.findIndex((y) => y.id === x.id) === i);
}

export async function instituteCard(id: string): Promise<InstituteCard | null> {
  if (!UUID.test(id)) return null;
  const { data } = await admin().from("institutes").select("id, name, code, listed").eq("id", id).maybeSingle();
  return (data as InstituteCard | null) ?? null;
}

/** Owner's choice: show the institute in "Find your institute" search, or only to people who type its code. */
export async function setListed(id: string, listed: boolean) {
  const { error } = await admin().from("institutes").update({ listed }).eq("id", id);
  if (error) throw new Error(`update failed: ${error.message}`);
}
