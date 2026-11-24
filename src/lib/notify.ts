// Who gets a notification, and saying what, after an action is saved; and the ones that wait for a time of day.
// Plain logic only (tested in scripts/notify.test.mjs); notify-server.ts finds the devices and sends.
import type { LmsState } from "./lms-actions.ts";

/** The groups a person can switch off in Settings. */
export const GROUPS = ["classwork", "results", "notices", "ai", "attendance", "fees", "messages", "work"] as const;
export type Group = (typeof GROUPS)[number];
/** The groups each kind of person can get (and so sees switches for). */
export const GROUPS_FOR: Record<string, Group[]> = {
  student: ["classwork", "results", "notices", "messages", "ai"],
  guardian: ["attendance", "fees", "results", "notices", "messages"],
  teacher: ["messages", "work"],
  owner: ["messages", "work"],
  manager: ["messages", "work"],
};

/** Where a tap leads: the app opens that tab, the website that page. */
export type Screen = "home" | "todo" | "results" | "notices" | "messages";
/** Who: students and guardians by student id, staff by name, or the institute's owners. */
export type To = { students?: number[]; guardians?: number[]; staff?: string[]; owners?: boolean };
/** `text`: a key of the `notify` wording with its blanks. `once`: sent only once for this key. */
export type Note = { to: To; group: Group; text: [string, ...(string | number)[]]; screen: Screen; once?: string };
/** Checked again just before sending (an absence the teacher took back is not sent). */
export type Later = { note: Note; afterMin: number; still: { absent: [string, number] } };

const HOMEWORK = new Set(["quiz", "task", "exam"]);
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const inBatch = (s: LmsState, batch: string) => s.students.filter((x) => !x.pending && (!batch || batch === "all" || x.batch === batch)).map((x) => x.id);
const teacherOf = (s: LmsState, batch: string) => s.batches.find((b) => b.name === batch)?.teacher;
const nameOf = (s: LmsState, id: number) => s.students.find((x) => x.id === id)?.name ?? "";
const both = (ids: number[]): To => ({ students: ids, guardians: ids });

/**
 * What to send after `name(args)` turned `before` into `after`. `byStaff`: a teacher or the owner did it.
 * Nothing that names another student's marks or rank is ever sent.
 */
export function notesFor(name: string, args: unknown[], before: LmsState, after: LmsState, byStaff: boolean): { now: Note[]; later: Later[] } {
  const now: Note[] = [];
  const later: Later[] = [];
  const a = args as never[];
  switch (name) {
    case "addModuleItem": {
      const mod = after.modules.find((m) => m.id === a[0]);
      const old = new Set(before.modules.find((m) => m.id === a[0])?.items.map((i) => i.id));
      const item = mod?.items.find((i) => !old.has(i.id));
      if (mod?.published && item && HOMEWORK.has(item.kind))
        now.push({ to: { students: inBatch(after, mod.batch) }, group: "classwork", text: [`new_${item.kind}`, item.title, item.dueDate ?? ""], screen: "todo" });
      break;
    }
    case "gradeSubmission": {
      const item = after.modules.find((m) => m.id === a[0])?.items.find((i) => i.id === a[1]);
      const sub = item?.submissions?.[a[2] as number];
      if (item && sub?.grade !== undefined) now.push({ to: both([a[2]]), group: "results", text: ["graded", item.title, `${sub.grade}${item.points ? `/${item.points}` : ""}`], screen: "results" });
      break;
    }
    case "setMeritPublished": {
      const mod = after.modules.find((m) => m.id === a[0]);
      const item = mod?.items.find((i) => i.id === a[1]);
      const was = before.modules.find((m) => m.id === a[0])?.items.find((i) => i.id === a[1])?.meritPublished;
      if (mod && item?.meritPublished && !was) now.push({ to: both(inBatch(after, mod.batch)), group: "results", text: ["merit", item.title], screen: "results" });
      break;
    }
    case "addAnnouncement": {
      const n = after.announcements.find((x) => !before.announcements.some((y) => y.id === x.id));
      if (n) now.push({ to: both(inBatch(after, n.batch)), group: "notices", text: ["notice", short(n.title, 60), short(n.body)], screen: "notices" });
      break;
    }
    case "updateLiveClass": {
      const l = after.liveClass;
      const b = before.liveClass;
      if (l.batch && l.link && (l.link !== b.link || l.start !== b.start || l.batch !== b.batch))
        now.push({ to: { students: inBatch(after, l.batch) }, group: "notices", text: ["live", short(l.topic, 60), l.start], screen: "home" });
      break;
    }
    case "askDoubt": {
      const d = after.doubts.find((x) => !before.doubts.some((y) => y.id === x.id));
      const t = d && teacherOf(after, d.batch);
      if (d && t) now.push({ to: { staff: [t] }, group: "work", text: ["doubt", d.batch], screen: "messages" });
      break;
    }
    case "replyDoubt": {
      const d = after.doubts.find((x) => x.id === a[0]);
      if (d && byStaff) now.push({ to: { students: [d.studentId] }, group: "classwork", text: ["answered", short(d.text, 60)], screen: "messages" });
      break;
    }
    case "toggleAttendance":
    case "markAllAbsent": {
      // Sent 15 minutes later, and only if still absent then: a mis-tap put right at once never reaches a parent.
      for (const [date, ids] of Object.entries(after.attendance)) {
        const was = new Set(before.attendance[date] ?? []);
        for (const id of ids.filter((x) => !was.has(x)))
          later.push({ note: { to: { guardians: [id] }, group: "attendance", text: ["absent", nameOf(after, id), date], screen: "home", once: `absent:${date}:${id}` }, afterMin: 15, still: { absent: [date, id] } });
      }
      break;
    }
    case "payFee": {
      const old = new Set(before.payments.map((y) => y.id)); // a year of payments: one look-up each, not a search of the list
      for (const p of after.payments.filter((x) => !old.has(x.id)))
        now.push({ to: { guardians: [p.studentId] }, group: "fees", text: ["paid", p.amount, nameOf(after, p.studentId)], screen: "home" });
      break;
    }
    case "sendChatMessage": {
      const [, kind, id] = /^(parent|student)-(\d+)$/.exec(String(a[0])) ?? [];
      if (id && byStaff) now.push({ to: kind === "parent" ? { guardians: [Number(id)] } : { students: [Number(id)] }, group: "messages", text: ["message", String(a[1])], screen: "messages" });
      break;
    }
    case "sendStudentMessage": {
      const st = after.students.find((x) => x.id === a[0]);
      const t = st && teacherOf(after, st.batch);
      if (st && t && !byStaff) now.push({ to: { staff: [t] }, group: "messages", text: ["fromStudent", st.name], screen: "messages" });
      break;
    }
    case "sendParentMessage": {
      const st = after.students.find((x) => x.id === a[0]);
      const t = st && teacherOf(after, st.batch);
      if (st && t && !byStaff) now.push({ to: { staff: [t] }, group: "messages", text: ["fromGuardian", st.name], screen: "messages" });
      break;
    }
    case "bookMeeting":
    case "cancelMeeting": {
      const m = (name === "bookMeeting" ? after : before).meetings.find((x) => x.id === a[0]);
      if (m?.bookedBy !== undefined && !byStaff) now.push({ to: { staff: [m.teacher] }, group: "work", text: [name === "bookMeeting" ? "booked" : "cancelled", nameOf(after, m.bookedBy), m.start], screen: "home" });
      break;
    }
    case "reportPost": {
      const p = after.community.find((x) => x.id === a[0]);
      const t = p?.batch && teacherOf(after, p.batch);
      if (p) now.push({ to: t ? { staff: [t] } : { owners: true }, group: "work", text: ["reported"], screen: "home" });
      break;
    }
    case "requestLeave": {
      const l = after.staffLeave.find((x) => !before.staffLeave.some((y) => y.id === x.id));
      if (l) now.push({ to: { owners: true }, group: "work", text: ["leaveAsked", l.name, l.from], screen: "home" });
      break;
    }
    case "decideLeave": {
      const l = after.staffLeave.find((x) => x.id === a[0]);
      if (l && l.status !== "pending") now.push({ to: { staff: [l.name] }, group: "work", text: [l.status === "approved" ? "leaveYes" : "leaveNo", l.from], screen: "home" });
      break;
    }
    case "addAdmission": {
      const x = after.admissions.find((y) => !before.admissions.some((z) => z.id === y.id));
      if (x) now.push({ to: { owners: true }, group: "work", text: ["admission", x.name, x.wants], screen: "home" });
      break;
    }
    case "placeOrder": {
      const o = after.orders.find((y) => !before.orders.some((z) => z.id === y.id));
      const batch = o && after.batches.find((b) => b.id === o.batchId);
      if (o) now.push({ to: { owners: true, staff: batch ? [batch.teacher] : [] }, group: "work", text: ["order", o.student.name, batch?.name ?? ""], screen: "home" });
      break;
    }
  }
  return { now: now.filter((n) => Object.values(n.to).some((v) => (Array.isArray(v) ? v.length : v))), later };
}

/** A day "YYYY-MM-DD" and hour in Bangladesh (UTC+6), and the day n days on. */
export function dhaka(now: Date, plusDays = 0) {
  const d = new Date(now.getTime() + 6 * 3600_000 + plusDays * 86400_000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), date: d.getUTCDate() };
}
/** Fee reminders go out from this day of the month (the fee is due on FEE_DUE_DAY, the 10th). */
export const FEE_REMIND_DAY = 7;

/**
 * The notifications that wait for a time: homework due tomorrow (from 6 pm), the AI pack ending in 3 days and the
 * month's fee (from 10 am). Each has a `once` key, so running this every few minutes sends each one once.
 */
export function timedNotes(s: LmsState, now: Date): Note[] {
  const out: Note[] = [];
  const today = dhaka(now);
  if (today.hour >= 18) {
    const tomorrow = dhaka(now, 1).day;
    for (const m of s.modules.filter((x) => x.published))
      for (const it of m.items.filter((i) => HOMEWORK.has(i.kind) && i.dueDate === tomorrow))
        for (const id of inBatch(s, m.batch).filter((x) => !it.submissions?.[x] && !(Array.isArray(it.doneBy) && it.doneBy.includes(x)) && it.scores?.[x] === undefined))
          out.push({ to: { students: [id] }, group: "classwork", text: ["dueTomorrow", it.title], screen: "todo", once: `due:${it.id}:${id}` });
  }
  if (today.hour >= 10) {
    const in3 = dhaka(now, 3).day;
    for (const st of s.students.filter((x) => x.premiumUntil === in3))
      out.push({ to: { students: [st.id] }, group: "ai", text: ["aiEnding", st.premiumUntil!], screen: "home", once: `ai:${st.id}:${st.premiumUntil}` });
    if (today.date >= FEE_REMIND_DAY)
      for (const st of s.students.filter((x) => !x.pending && x.feeDue > 0))
        out.push({ to: { guardians: [st.id] }, group: "fees", text: ["feeDue", st.feeDue, st.name], screen: "home", once: `fee:${today.day.slice(0, 7)}:${st.id}` });
  }
  return out;
}
