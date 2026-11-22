// ClassBARI platform data run by our own staff (admin panel): institutes, support tickets,
// announcements, feature switches, plan prices and an activity log. Pure functions only
// (also loaded by scripts/platform.test.mjs); saving happens in src/lib/platform-server.ts.
import { MODELS, PACKS, PROVIDERS, type AiSettings } from "./ai-chat.ts";

export type Plan = "free" | "basic" | "pro";
export type InstituteStatus = "trial" | "active" | "suspended";
export type Institute = {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone: string;
  firstBatch: string;
  plan: Plan;
  status: InstituteStatus;
  trialEnds: string; // YYYY-MM-DD
  note: string;
  createdAt: string;
};
export type Ticket = {
  id: string;
  name: string;
  contact: string; // phone or email
  role: "teacher" | "guardian" | "student" | "institute" | "other";
  message: string;
  status: "open" | "closed";
  note: string;
  createdAt: string;
};
export type Flags = { liveGame: boolean; handwriting: boolean; publicCourses: boolean; signups: boolean; sms: boolean };
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string }; role: "student" | "parent"; batches: string[]; at: string };
export type SmsEntry = { at: string; to: string; text: string; status: "sent" | "test" | "failed"; inst?: string }; // inst: the institute that sent it (real accounts)
export type Broadcast = { on: boolean; level: "info" | "warning"; en: string; bn: string };
export type Platform = {
  institutes: Institute[];
  tickets: Ticket[];
  leadStatus: Record<string, string>;
  broadcast: Broadcast;
  maintenance: boolean;
  flags: Flags;
  prices: Record<Plan, number>; // ৳ per month
  audit: { at: string; action: string; detail: string }[];
  smsDailyLimit: number;
  smsLog: SmsEntry[];
  push: PushSub[];
  pushSent: { day: string; count: number };
  /** Institutes (Supabase ids) whose changes are refused: they can still sign in and look, not save. */
  suspended: string[];
  /** Subscription of each Supabase institute (by id), set in the admin panel or by an approved plan payment. */
  subs: Record<string, { plan: Plan; paidUntil: string }>;
  ai: AiSettings;
};

export const PLANS: Plan[] = ["free", "basic", "pro"];
export const TRIAL_DAYS = 30;
const LEAD_STATUSES = ["new", "called", "won", "lost"];
const ROLES: Ticket["role"][] = ["teacher", "guardian", "student", "institute", "other"];

export const defaultPlatform = (): Platform => ({
  institutes: [],
  tickets: [],
  leadStatus: {},
  broadcast: { on: false, level: "info", en: "", bn: "" },
  maintenance: false,
  flags: { liveGame: true, handwriting: true, publicCourses: true, signups: true, sms: true },
  prices: { free: 0, basic: 0, pro: 0 },
  audit: [],
  smsDailyLimit: 200,
  smsLog: [],
  push: [],
  pushSent: { day: "", count: 0 },
  suspended: [],
  subs: {},
  ai: {},
});

/** What every visitor's app may read: no institutes, tickets or log. */
export const publicView = (p: Platform) => ({ broadcast: p.broadcast, maintenance: p.maintenance, flags: p.flags });

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** A teacher/institute signed up (from /signup). */
export function registerInstitute(p: Platform, input: Record<string, unknown>, id: string, now: Date): Institute | { error: string } {
  if (!p.flags.signups) return { error: "signups closed" };
  const name = str(input.name, 120);
  const owner = str(input.owner, 80);
  const phone = str(input.phone, 20);
  const firstBatch = str(input.firstBatch, 120) ?? "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase().slice(0, 120) : "";
  if (!name || !owner || !phone) return { error: "invalid" };
  const trial = new Date(now);
  trial.setDate(trial.getDate() + TRIAL_DAYS);
  const inst: Institute = { id, name, owner, email, phone, firstBatch, plan: "free", status: "trial", trialEnds: day(trial), note: "", createdAt: now.toISOString() };
  p.institutes.unshift(inst);
  p.institutes.length = Math.min(p.institutes.length, 20_000); // a flood of fake sign-ups must not fill the disk
  return inst;
}

/** "Help & support" form. */
export function addTicket(p: Platform, input: Record<string, unknown>, id: string, now: Date): Ticket | { error: string } {
  const name = str(input.name, 80);
  const contact = str(input.contact, 120);
  const message = str(input.message, 2000);
  const role = ROLES.includes(input.role as Ticket["role"]) ? (input.role as Ticket["role"]) : "other";
  if (!name || !contact || !message) return { error: "invalid" };
  const t: Ticket = { id, name, contact, role, message, status: "open", note: "", createdAt: now.toISOString() };
  p.tickets.unshift(t);
  p.tickets.length = Math.min(p.tickets.length, 5000); // keeps the newest
  return t;
}

/** A suspended institute may read its data but not change it (checked by /api/data before every save). */
export const isSuspended = (p: Platform, institute: string) => p.suspended.includes(institute);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown, max: number, whole = false) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max && (!whole || Number.isInteger(v));
/** One AI setting from the admin panel: { key, value } (value null: back to the default in the code / .env.local). */
function setAi(ai: AiSettings, a: Record<string, unknown>): string | { error: string } {
  const v = a.value;
  const toggle = (list: string[] | undefined, id: string) => (v ? (list ?? []).filter((x) => x !== id) : [...new Set([...(list ?? []), id])]);
  switch (a.key) {
    case "provider":
      if (!PROVIDERS.includes(a.id as (typeof PROVIDERS)[number]) || typeof v !== "boolean") return { error: "bad provider" };
      ai.offProviders = toggle(ai.offProviders, a.id as string);
      return `provider ${a.id}=${v ? "on" : "off"}`;
    case "model":
      if (typeof a.id !== "string" || !Object.hasOwn(MODELS, a.id) || typeof v !== "boolean") return { error: "bad model" };
      ai.offModels = toggle(ai.offModels, a.id);
      return `model ${a.id}=${v ? "on" : "off"}`;
    case "packDaily": {
      if (!(PACKS as readonly number[]).includes(Number(a.pack)) || (v !== null && !num(v, 10_000_000, true))) return { error: "bad tokens" };
      const daily = { ...ai.packDaily };
      if (v === null) delete daily[String(a.pack)];
      else daily[String(a.pack)] = v as number;
      ai.packDaily = daily;
      return `pack ৳${a.pack} tokens/day=${v ?? "default"}`;
    }
  }
  const ok: Record<string, (x: unknown) => boolean> = {
    budgetUsd: (x) => num(x, 100_000),
    freeOn: (x) => typeof x === "boolean",
    freeDaily: (x) => num(x, 10_000_000, true),
    freeWindowUsd: (x) => num(x, 10),
    costShare: (x) => num(x, 1) && (x as number) > 0,
  };
  const key = a.key as "budgetUsd" | "freeOn" | "freeDaily" | "freeWindowUsd" | "costShare";
  if (typeof a.key !== "string" || !Object.hasOwn(ok, key) || (v !== null && !ok[key](v))) return { error: "bad AI setting" };
  if (v === null) delete ai[key];
  else Object.assign(ai, { [key]: v });
  return `${key}=${v ?? "default"}`;
}

/** Every admin change goes through here and is written to the activity log. */
export function adminAction(p: Platform, a: Record<string, unknown>, now: Date): { ok: true } | { error: string } {
  const log = (action: string, detail: string) => {
    p.audit.unshift({ at: now.toISOString(), action, detail });
    p.audit.length = Math.min(p.audit.length, 500);
  };
  switch (a.type) {
    case "institute": {
      const inst = p.institutes.find((x) => x.id === a.id);
      if (!inst) return { error: "not found" };
      const changes: string[] = [];
      if (a.plan !== undefined) {
        if (!PLANS.includes(a.plan as Plan)) return { error: "bad plan" };
        inst.plan = a.plan as Plan;
        changes.push(`plan=${inst.plan}`);
      }
      if (a.status !== undefined) {
        if (!["trial", "active", "suspended"].includes(a.status as string)) return { error: "bad status" };
        inst.status = a.status as InstituteStatus;
        changes.push(`status=${inst.status}`);
      }
      if (a.trialEnds !== undefined) {
        if (typeof a.trialEnds !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a.trialEnds)) return { error: "bad date" };
        inst.trialEnds = a.trialEnds;
        changes.push(`trialEnds=${inst.trialEnds}`);
      }
      if (a.note !== undefined) {
        inst.note = String(a.note).slice(0, 2000);
        changes.push("note");
      }
      log("institute", `${inst.name}: ${changes.join(", ")}`);
      return { ok: true };
    }
    case "ticket": {
      const t = p.tickets.find((x) => x.id === a.id);
      if (!t) return { error: "not found" };
      if (a.status === "open" || a.status === "closed") t.status = a.status;
      if (a.note !== undefined) t.note = String(a.note).slice(0, 2000);
      log("ticket", `${t.name}: ${t.status}${a.note !== undefined ? ", note" : ""}`);
      return { ok: true };
    }
    case "lead": {
      if (typeof a.key !== "string" || !LEAD_STATUSES.includes(a.status as string)) return { error: "bad lead" };
      p.leadStatus[a.key] = a.status as string;
      log("lead", `${a.key.split("|")[1] ?? a.key}: ${a.status}`);
      return { ok: true };
    }
    case "broadcast": {
      const level = a.level === "warning" ? "warning" : "info";
      p.broadcast = { on: !!a.on, level, en: String(a.en ?? "").slice(0, 300), bn: String(a.bn ?? "").slice(0, 300) };
      log("broadcast", p.broadcast.on ? `on (${level}): ${p.broadcast.en}` : "off");
      return { ok: true };
    }
    case "maintenance":
      p.maintenance = !!a.on;
      log("maintenance", p.maintenance ? "on" : "off");
      return { ok: true };
    case "flag": {
      if (typeof a.key !== "string" || !(a.key in p.flags)) return { error: "bad flag" };
      p.flags[a.key as keyof Flags] = !!a.on;
      log("feature", `${a.key}=${a.on ? "on" : "off"}`);
      return { ok: true };
    }
    case "smsLimit": {
      const n = Number(a.amount);
      if (!Number.isInteger(n) || n < 0 || n > SMS_LOG_KEEP) return { error: "bad limit" }; // today's count comes from the log
      p.smsDailyLimit = n;
      log("sms", `daily limit=${n}`);
      return { ok: true };
    }
    case "ai": {
      const res = setAi(p.ai, a);
      if (typeof res !== "string") return res;
      log("ai", res);
      return { ok: true };
    }
    case "suspend": {
      if (typeof a.id !== "string" || !UUID.test(a.id) || typeof a.on !== "boolean") return { error: "bad institute" };
      p.suspended = a.on ? [...new Set([...p.suspended, a.id])] : p.suspended.filter((x) => x !== a.id);
      log("institute", `${String(a.name ?? a.id).slice(0, 120)}: ${a.on ? "suspended" : "unsuspended"}`);
      return { ok: true };
    }
    case "sub": {
      if (typeof a.id !== "string" || !UUID.test(a.id)) return { error: "bad institute" };
      const sub = p.subs[a.id] ? { ...p.subs[a.id] } : { plan: "free" as Plan, paidUntil: "" };
      if (a.plan !== undefined) {
        if (!PLANS.includes(a.plan as Plan)) return { error: "bad plan" };
        sub.plan = a.plan as Plan;
      }
      if (a.paidUntil !== undefined) {
        if (a.paidUntil !== "" && (typeof a.paidUntil !== "string" || !DAY.test(a.paidUntil))) return { error: "bad date" };
        sub.paidUntil = a.paidUntil as string;
      }
      p.subs = { ...p.subs, [a.id]: sub };
      log("subscription", `${String(a.name ?? a.id).slice(0, 120)}: plan=${sub.plan}, paid until ${sub.paidUntil || "-"}`);
      return { ok: true };
    }
    case "price": {
      const n = Number(a.amount);
      if (!PLANS.includes(a.plan as Plan) || !Number.isInteger(n) || n < 0 || n > 1_000_000) return { error: "bad price" };
      p.prices[a.plan as Plan] = n;
      log("price", `${a.plan}=৳${n}`);
      return { ok: true };
    }
  }
  return { error: "unknown action" };
}

/** Overview numbers. Monthly income counts active (paying) institutes at their plan's price. */
export function overview(p: Platform, now = new Date()) {
  const by = <K extends string>(f: (i: Institute) => K) =>
    p.institutes.reduce((acc, i) => ({ ...acc, [f(i)]: (acc[f(i)] ?? 0) + 1 }), {} as Record<K, number>);
  const month = now.toISOString().slice(0, 7);
  return {
    institutes: p.institutes.length,
    byStatus: by((i) => i.status),
    byPlan: by((i) => i.plan),
    newThisMonth: p.institutes.filter((i) => i.createdAt.startsWith(month)).length,
    trialsEndingSoon: p.institutes.filter((i) => i.status === "trial" && (Date.parse(i.trialEnds) - now.getTime()) / 86400000 <= 7).length,
    monthlyIncome: p.institutes.filter((i) => i.status === "active").reduce((s, i) => s + p.prices[i.plan], 0),
    openTickets: p.tickets.filter((t) => t.status === "open").length,
  };
}

export const SMS_MAX_TEXT = 480; // about 3 Bangla SMS parts or 3 English ones
export const SMS_MAX_PER_REQUEST = 100;
export const SMS_PER_INSTITUTE_DAILY = 150; // shortcut: one number for every institute until SMS credits are sold per institute
const SMS_LOG_KEEP = 5000;

/** Normalise to 01XXXXXXXXX; null if not a Bangladeshi mobile number. */
export const bdMobile = (phone: string) => {
  const m = phone.replace(/[\s-]/g, "").match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : null;
};

/** Checks an SMS request against the switch and the daily limit. Returns the numbers to send to. */
export function checkSms(p: Platform, to: unknown, text: unknown, now: Date, inst?: string): { numbers: string[]; text: string } | { error: string } {
  if (!p.flags.sms) return { error: "switched off" };
  if (typeof text !== "string" || !text.trim() || text.length > SMS_MAX_TEXT) return { error: "bad text" };
  if (!Array.isArray(to) || to.length === 0 || to.length > SMS_MAX_PER_REQUEST) return { error: "bad recipients" };
  const numbers = [...new Set(to.map((x) => (typeof x === "string" ? bdMobile(x) : null)))];
  if (numbers.includes(null)) return { error: "bad number" };
  const today = now.toISOString().slice(0, 10);
  const used = p.smsLog.filter((e) => e.at.startsWith(today) && e.status !== "failed").length;
  if (used + numbers.length > p.smsDailyLimit) return { error: "daily limit reached" };
  // One institute can't use up the whole site's SMS for the day.
  const mine = inst ? p.smsLog.filter((e) => e.inst === inst && e.at.startsWith(today) && e.status !== "failed").length : 0;
  if (inst && mine + numbers.length > SMS_PER_INSTITUTE_DAILY) return { error: "daily limit reached" };
  return { numbers: numbers as string[], text: text.trim() };
}

export function logSms(p: Platform, entries: SmsEntry[]) {
  p.smsLog.unshift(...entries);
  p.smsLog.length = Math.min(p.smsLog.length, SMS_LOG_KEEP);
}

export const PUSH_DAILY_LIMIT = 2000; // notifications per day for the whole site (teachers aren't real logins yet)

// Only the real push services of browsers: our server sends to this address, so it must not be anything else.
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

/** Save (or refresh) a browser's push subscription. */
export function addPushSub(p: Platform, input: Record<string, unknown>, now: Date): { ok: true } | { error: string } {
  const sub = input.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = sub?.endpoint, p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || !PUSH_HOST.test(endpoint) || endpoint.length > 1000) return { error: "bad subscription" };
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return { error: "bad subscription" };
  if (input.role !== "student" && input.role !== "parent") return { error: "bad role" };
  const batches = Array.isArray(input.batches) ? input.batches.filter((b): b is string => typeof b === "string" && b.length <= 120).slice(0, 10) : [];
  if (!batches.length) return { error: "no batch" };
  if (p.push.length >= 50_000 && !p.push.some((x) => x.endpoint === endpoint)) return { error: "full" };
  p.push = [...p.push.filter((x) => x.endpoint !== endpoint), { endpoint, keys: { p256dh, auth }, role: input.role, batches, at: now.toISOString() }];
  return { ok: true };
}

/** Who gets a batch notification, within the daily limit. Counts them as sent. */
export function pushTargets(p: Platform, batch: unknown, now: Date): PushSub[] | { error: string } {
  if (typeof batch !== "string") return { error: "bad batch" };
  const day = now.toISOString().slice(0, 10);
  if (p.pushSent.day !== day) p.pushSent = { day, count: 0 };
  const targets = p.push.filter((x) => x.batches.includes(batch));
  if (p.pushSent.count + targets.length > PUSH_DAILY_LIMIT) return { error: "daily limit reached" };
  p.pushSent.count += targets.length;
  return targets;
}
