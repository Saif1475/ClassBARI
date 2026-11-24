// Every change to an institute's data, as plain functions of the state. The browser runs them for instant
// feedback; with real accounts the server runs the same code to save them (src/app/api/data/route.ts).
import { dayKey } from "./dates.ts";
import { XP } from "./xp.ts";
import { normEmail, type StudentContact } from "./site.ts";
import {
  FEE_DUE_DAY,
  seed,
  type Batch,
  type BankQuestion,
  type CalendarEvent,
  type ChatThread,
  type CourseModule,
  type ItemKind,
  type LiveClassInfo,
  type ModuleItem,
  type Payment,
  type Staff,
  type StudentRecord,
  type Submission,
} from "./mock-data.ts";
import type { QuizQuestion } from "./quiz.ts";
import type { Admission, Doubt, DoubtReply, Meeting, Order, PointKind, RubricCriterion, StaffLeave, TeacherSite } from "./mock-data.ts";
import type { Coupon, Expense, Slot } from "./centre.ts";
import { answerFriend, BIO_MAX, cleanText, COMMENT_MAX, POST_MAX, requestFriend, type Audience, type Author, type CommunityProfile } from "./community.ts";

/** Everything a teacher fills in when enrolling a student. */
export type StudentInput = StudentContact & { mode: "offline" | "online"; batch: string; dob?: string; school?: string; address?: string; gender?: "male" | "female"; pending?: boolean };
/** What a backup file says it is: written as the first, files saved before the rename still say "ClassBARI". */
const BACKUP_TAGS = ["Instanton Campus", "ClassBARI"];
const clean = (i: StudentInput) => ({
  name: i.name.trim(),
  email: normEmail(i.email),
  guardianName: i.guardianName.trim(),
  guardianEmail: normEmail(i.guardianEmail),
  phone: i.phone.trim(),
  studentPhone: i.studentPhone?.trim() || undefined,
  dob: i.dob || undefined,
  school: i.school?.trim() || undefined,
  address: i.address?.trim() || undefined,
  mode: i.mode,
  gender: i.gender === "male" || i.gender === "female" ? i.gender : undefined,
  batch: i.batch,
});

export type LmsState = ReturnType<typeof seed>;
const DAILY_XP_MAX = 1000; // a full day of real study is well under this; ticking a lesson on and off all day must not win the leaderboard

/** Who finished an item: each student ticks their own. */
const markDone = (list: number[] | undefined, id: number, on: boolean) => (on ? [...new Set([...(list ?? []), id])] : (list ?? []).filter((x) => x !== id));

let lastId = Date.now();
export const uid = () => ++lastId;
/** What a message may carry besides its text: the message it answers and a photo. */
export type ChatExtra = { reply?: number; photo?: string };
const extraOf = (x?: ChatExtra) => ({ ...(x?.reply ? { reply: x.reply } : {}), ...(x?.photo ? { photo: x.photo } : {}) });
/** The id counter: the browser sends it with each action so the server makes the same new ids. */
export const idBase = () => lastId;
export const setIdBase = (n: number) => {
  lastId = n;
};

export const monthKey = (d = new Date()) => dayKey(d).slice(0, 7);
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

/** New month: everyone owes another month's fee (unpaid fees carry over). After the due day: the late fine, once a month. */
export function rollFees(s: LmsState, now = new Date()): LmsState {
  const month = monthKey(now);
  const months = monthsBetween(s.feeMonth, month);
  // Each batch is looked up by name once (the first with that name, as a search would find), not once per student.
  const batchOf = new Map<string, Batch>();
  for (const b of s.batches) if (!batchOf.has(b.name)) batchOf.set(b.name, b);
  if (months > 0) s = { ...s, feeMonth: month, students: s.students.map((st) => ({ ...st, feeDue: st.feeDue + months * Math.max(0, (batchOf.get(st.batch)?.fee ?? 0) - (st.discount ?? 0)) })) };
  if (now.getDate() <= FEE_DUE_DAY) return s;
  // The list is copied only if somebody is actually fined (this runs on every load).
  let fined: StudentRecord[] | null = null;
  s.students.forEach((st, i) => {
    const fine = batchOf.get(st.batch)?.lateFine ?? 0;
    if (st.feeDue > 0 && fine > 0 && st.fineMonth !== month && st.joined !== month) (fined ??= [...s.students])[i] = { ...st, feeDue: st.feeDue + fine, fineMonth: month };
  });
  return fined ? { ...s, students: fined } : s;
}

/** A new real institute: the app's shape with no sample people, classes or money. */
export function blankState(): LmsState {
  // The sample data is built once to learn the app's shape; after that each call is a quick copy of the empty shape.
  // (This runs on every request, so building all the sample students and lessons each time was wasted work.)
  blank ??= emptied(seed());
  const s = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(blank)) s[k] = Array.isArray(v) ? [...v] : v && typeof v === "object" ? { ...v } : v; // fresh lists and objects every time
  const out = s as LmsState;
  out.feeMonth = monthKey();
  out.liveClass.start = new Date(Date.now() + 20 * 60000).toISOString(); // as the sample data sets it
  return out;
}
let blank: LmsState | undefined;
const emptied = (s: LmsState): LmsState => ({
  ...s,
  teacherName: "", staff: [], viewer: "all", teacherLogin: "", meId: 0, parentChildren: [], leagueRank: {}, xp: {}, points: [], story: [], routine: [],
  community: [], communityProfiles: {}, friendships: [], batches: [], students: [], payments: [], attendance: {}, modules: [], announcements: [],
  exploreVideos: [], enrolledCourses: [], calendarEvents: [], chats: [], liveClass: { ...s.liveClass, batch: "", topic: "", link: "" },
  site: { ...s.site, slug: "" },
  nextStudentId: 0, // not counted yet (a new institute, or data saved before this was kept): nextRoll works it out
});

/** The highest student id the data still mentions: a removed student's fees, marks, chats and posts stay behind under their number. */
function topStudentId(s: LmsState) {
  let top = 0;
  const see = (ids: unknown) => {
    for (const x of Array.isArray(ids) ? ids : []) if (Number.isSafeInteger(Number(x)) && Number(x) > top) top = Number(x);
  };
  const keys = (...recs: unknown[]) => recs.forEach((r) => r && typeof r === "object" && see(Object.keys(r)));
  see(s.students.map((x) => x.id));
  see([...s.payments, ...s.points, ...s.portfolio, ...s.doubts].map((x) => x.studentId));
  see(s.notes.map((n) => n.by));
  see(s.meetings.map((m) => m.bookedBy));
  see(s.friendships.flatMap((f) => [f.from, f.to]));
  see(s.chats.map((c) => /^(?:parent|student)-(\d+)$/.exec(String(c.id))?.[1]));
  Object.values(s.attendance).forEach(see);
  for (const m of s.modules) for (const it of m.items) (see(it.doneBy), keys(it.scores, it.answers, it.submissions, it.tabSwitches, it.started, it.took));
  for (const p of s.community) (see([p.author, ...(p.comments ?? []).map((c) => c.author)]), see(p.likes), see(p.reports), keys(p.poll?.votes));
  keys(s.xp, s.reportComments, s.communityProfiles, ...Object.values(s.watch));
  return top;
}
/** The next new student's roll number. Never one used before: whoever got a removed student's number would see that student's chats, fees and marks. */
export const nextRoll = (s: LmsState) =>
  Math.max(Number.isSafeInteger(s.nextStudentId) && s.nextStudentId > 0 ? s.nextStudentId : topStudentId(s) + 1, s.students.reduce((top, x) => Math.max(top, x.id), 0) + 1); // no "too many arguments" with a huge list

export type AddItemInput = {
  kind: ItemKind;
  title: string;
  meta: string;
  points?: number;
  dueDate?: string;
  url?: string;
  questions?: QuizQuestion[];
  paper?: string;
  paperName?: string;
  answerKey?: string;
  answerKeyName?: string;
  negative?: number;
  shuffle?: boolean;
  rubric?: RubricCriterion[];
  publishToExplore?: boolean;
  subject?: string;
  level?: string;
  free?: boolean;
};

/** Where actions read and write the state: React state in the browser, a plain variable on the server. */
export type Store = {
  set: (fn: (s: LmsState) => Partial<LmsState>) => void;
  get: () => LmsState;
  replace: (s: LmsState) => void;
  fresh: () => LmsState; // what a restored backup is filled in with: sample data in the demo, empty with real accounts
  lastRoll: { current: number }; // several students added before a re-render must still get different roll numbers
};

export function makeActions({ set, get, replace, fresh, lastRoll }: Store) {
  const mapItem = (s: LmsState, moduleId: number, itemId: number, fn: (it: ModuleItem) => ModuleItem) =>
    s.modules.map((m) => (m.id === moduleId ? { ...m, items: m.items.map((it) => (it.id === itemId ? fn(it) : it)) } : m));
  const mapItems = (s: LmsState, moduleId: number, fn: (items: ModuleItem[]) => ModuleItem[]) =>
    s.modules.map((m) => (m.id === moduleId ? { ...m, items: fn(m.items) } : m));
  const today = dayKey();
  const addXp = (s: LmsState, studentId: number, amount: number) =>
    amount > 0 ? { ...s.xp, [studentId]: { ...s.xp[studentId], [today]: Math.min(DAILY_XP_MAX, (s.xp[studentId]?.[today] ?? 0) + amount) } } : s.xp;
  const batchOf = (s: LmsState, name: string) => s.batches.find((b) => b.name === name);
  const setChatMessage = (threadId: string, msgId: number, fn: (m: ChatThread["messages"][number]) => ChatThread["messages"][number]) =>
    set((s) => ({ chats: s.chats.map((c) => (c.id === threadId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) } : c)) }));
  const batchFee = (s: LmsState, name: string) => batchOf(s, name)?.fee ?? 0;
  const payment = (st: StudentRecord, method: Payment["method"], amount = st.feeDue): Payment => ({ id: uid(), studentId: st.id, batch: st.batch, amount, at: new Date().toISOString(), method });

  return {
    addAnnouncement: (input: { title: string; body: string; batch: string; pinned?: boolean }) =>
      set((s) => ({ announcements: [{ ...input, id: uid(), author: s.teacherName, at: new Date().toISOString() }, ...s.announcements] })),
    deleteAnnouncement: (id: number) => set((s) => ({ announcements: s.announcements.filter((a) => a.id !== id) })),

    /** Returns the new module's id. */
    addModule: (title: string, batch: string) => {
      const id = uid();
      set((s) => ({ modules: [{ id, batch, title, tag: "new", published: true, items: [] } satisfies CourseModule, ...s.modules] }));
      return id;
    },
    /** Copy a module (with fresh ids, no student work) into another batch. */
    copyModule: (moduleId: number, batch: string) =>
      set((s) => {
        const m = s.modules.find((x) => x.id === moduleId);
        if (!m) return {};
        const items = m.items.map(({ scores: _scores, submissions: _subs, ...it }) => ({ ...it, id: uid(), done: false }));
        return { modules: [{ ...m, id: uid(), batch, tag: "new", items }, ...s.modules] };
      }),
    toggleModulePublish: (moduleId: number) =>
      set((s) => ({ modules: s.modules.map((m) => (m.id === moduleId ? { ...m, published: !m.published } : m)) })),
    deleteModule: (moduleId: number) => set((s) => ({ modules: s.modules.filter((m) => m.id !== moduleId) })),

    addModuleItem: (moduleId: number, input: AddItemInput) =>
      set((s) => {
        const { publishToExplore, subject, level, free, ...item } = input;
        const modules = mapItems(s, moduleId, (items) => [...items, { ...item, id: uid(), done: false }]);
        if (input.kind !== "video" || !publishToExplore) return { modules };
        return {
          modules,
          exploreVideos: [
            { id: uid(), title: input.title, thumb: input.title.slice(0, 26), subject: subject || "Physics", level: level || "HSC", teacher: s.teacherName, views: 0, postedAt: new Date().toISOString(), length: input.meta, free: free ?? true, url: input.url },
            ...s.exploreVideos,
          ],
        };
      }),
    /** Student ticks an item; finishing it (not un-ticking) earns XP. */
    toggleItemDone: (moduleId: number, itemId: number, studentId?: number) =>
      set((s) => {
        const it = s.modules.find((m) => m.id === moduleId)?.items.find((x) => x.id === itemId);
        const was = it && (studentId && it.doneBy ? it.doneBy.includes(studentId) : it.done);
        return {
          modules: mapItem(s, moduleId, itemId, (x) => ({ ...x, done: !was, doneBy: studentId ? markDone(x.doneBy, studentId, !was) : x.doneBy })),
          ...(studentId && it && !was ? { xp: addXp(s, studentId, XP.itemDone) } : {}),
        };
      }),
    earnXp: (studentId: number, amount: number) => set((s) => ({ xp: addXp(s, studentId, amount) })),
    setMeritPublished: (moduleId: number, itemId: number, on: boolean) => set((s) => ({ modules: mapItem(s, moduleId, itemId, (it) => ({ ...it, meritPublished: on })) })),
    toggleItemPreview: (moduleId: number, itemId: number) => set((s) => ({ modules: mapItem(s, moduleId, itemId, (it) => ({ ...it, preview: !it.preview })) })),
    /** `_picks` (the options chosen) is for the server: with real accounts it marks the quiz itself from them. */
    submitQuiz: (moduleId: number, itemId: number, studentId: number, score: number, marks: boolean[], tabSwitches = 0, _picks?: (number | null)[], took?: number) =>
      set((s) => ({
        modules: mapItem(s, moduleId, itemId, (it) => ({
          ...it,
          done: true,
          doneBy: markDone(it.doneBy, studentId, true),
          scores: { ...it.scores, [studentId]: score },
          answers: { ...it.answers, [studentId]: marks },
          ...(tabSwitches ? { tabSwitches: { ...it.tabSwitches, [studentId]: tabSwitches } } : {}),
          ...(took !== undefined ? { took: { ...it.took, [studentId]: took } } : {}),
        })),
        xp: addXp(s, studentId, XP.quizPerCorrect * marks.filter(Boolean).length),
      })),
    /** The student pressed Start: the first time is kept, so the server can tell how long the quiz really took. */
    startQuiz: (moduleId: number, itemId: number, studentId: number) =>
      set((s) => ({ modules: mapItem(s, moduleId, itemId, (it) => (it.started?.[studentId] ? it : { ...it, started: { ...it.started, [studentId]: new Date().toISOString() } })) })),
    submitAssignment: (moduleId: number, itemId: number, studentId: number, sub: Omit<Submission, "at">) =>
      set((s) => ({
        modules: mapItem(s, moduleId, itemId, (it) => ({ ...it, done: true, doneBy: markDone(it.doneBy, studentId, true), submissions: { ...it.submissions, [studentId]: { ...sub, at: new Date().toISOString() } } })),
        xp: addXp(s, studentId, XP.submit),
      })),
    gradeSubmission: (moduleId: number, itemId: number, studentId: number, grade: number, comment: string, rubricScores?: number[]) =>
      set((s) => ({
        modules: mapItem(s, moduleId, itemId, (it) => {
          const sub = it.submissions?.[studentId];
          return sub ? { ...it, submissions: { ...it.submissions, [studentId]: { ...sub, grade, comment, ...(rubricScores ? { rubricScores } : {}) } } } : it;
        }),
      })),

    // ClassDojo-style points, class story and portfolios.
    addPoint: (studentId: number, kind: PointKind) => set((s) => ({ points: [{ id: uid(), studentId, kind, at: new Date().toISOString() }, ...s.points] })),
    removePoint: (id: number) => set((s) => ({ points: s.points.filter((p) => p.id !== id) })),
    addStoryPost: (batch: string, text: string, image?: string) =>
      set((s) => ({ story: [{ id: uid(), batch, author: s.teacherName, text, image, at: new Date().toISOString() }, ...s.story] })),
    deleteStoryPost: (id: number) => set((s) => ({ story: s.story.filter((p) => p.id !== id) })),
    addPortfolio: (studentId: number, title: string, image: string) =>
      set((s) => ({ portfolio: [{ id: uid(), studentId, title, image, at: new Date().toISOString() }, ...s.portfolio], xp: addXp(s, studentId, XP.submit) })),
    deletePortfolio: (id: number) => set((s) => ({ portfolio: s.portfolio.filter((p) => p.id !== id) })),
    deleteModuleItem: (moduleId: number, itemId: number) => set((s) => ({ modules: mapItems(s, moduleId, (items) => items.filter((it) => it.id !== itemId)) })),

    addExploreVideo: (input: { title: string; subject: string; level: string; length: string; free: boolean; url?: string; moduleId?: number }) =>
      set((s) => ({
        exploreVideos: [
          { id: uid(), title: input.title, thumb: input.title.slice(0, 24), subject: input.subject, level: input.level, teacher: s.teacherName, views: 0, postedAt: new Date().toISOString(), length: input.length, free: input.free, url: input.url },
          ...s.exploreVideos,
        ],
        modules: input.moduleId
          ? mapItems(s, input.moduleId, (items) => [...items, { id: uid(), kind: "video", title: input.title, meta: input.length, done: false, url: input.url }])
          : s.modules,
      })),

    updateLiveClass: (info: LiveClassInfo) => set(() => ({ liveClass: info })),
    addCalendarEvent: (input: Omit<CalendarEvent, "id">) => set((s) => ({ calendarEvents: [...s.calendarEvents, { ...input, id: uid() }] })),

    addBatch: (input: { name: string; days: string; classDays: number[]; subject: string; fee: number; lateFine: number; teacher: string }) =>
      set((s) => {
        const id = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uid()}`;
        const batch: Batch = { id, name: input.name, short: input.name.slice(0, 2).toUpperCase(), days: input.days, classDays: input.classDays, fee: input.fee, lateFine: input.lateFine, teacher: input.teacher, subject: input.subject || undefined };
        return {
          batches: [batch, ...s.batches],
          enrolledCourses: [{ id, title: input.name, teacher: input.teacher, schedule: input.days, progress: 0, nextTopic: `${input.subject} · Introduction` }, ...s.enrolledCourses],
        };
      }),
    updateBatch: (batchId: string, patch: Partial<Pick<Batch, "fee" | "lateFine" | "classDays" | "teacher" | "public" | "about" | "hideLeague">>) =>
      set((s) => {
        const batch = s.batches.find((b) => b.id === batchId);
        return {
          batches: s.batches.map((b) => (b.id === batchId ? { ...b, ...patch } : b)),
          // A new fee applies to students who still owe exactly this month's own fee (fee minus their discount); the difference is added.
          students:
            patch.fee !== undefined && batch
              ? s.students.map((st) => {
                  const own = (fee: number) => Math.max(0, fee - (st.discount ?? 0));
                  return st.batch === batch.name && st.feeDue > 0 && st.feeDue === own(batch.fee) ? { ...st, feeDue: st.feeDue + own(patch.fee!) - own(batch.fee) } : st;
                })
              : s.students,
        };
      }),

    // Attendance is stored per date as the list of absent roll numbers.
    toggleAttendance: (studentId: number, date = today) =>
      set((s) => {
        const absent = s.attendance[date] ?? [];
        return { attendance: { ...s.attendance, [date]: absent.includes(studentId) ? absent.filter((id) => id !== studentId) : [...absent, studentId] } };
      }),
    markAllPresent: (studentIds: number[], date = today) =>
      set((s) => {
        const present = new Set(studentIds);
        return { attendance: { ...s.attendance, [date]: (s.attendance[date] ?? []).filter((id) => !present.has(id)) } };
      }),
    /** QR attendance: everyone starts absent, each scan marks one student present. */
    markAllAbsent: (studentIds: number[], date = today) =>
      set((s) => ({ attendance: { ...s.attendance, [date]: [...new Set([...(s.attendance[date] ?? []), ...studentIds])] } })),
    markPresent: (studentId: number, date = today) =>
      set((s) => ({ attendance: { ...s.attendance, [date]: (s.attendance[date] ?? []).filter((id) => id !== studentId) } })),

    /** Record a payment; a smaller amount is an installment and leaves the rest due. */
    payFee: (studentId: number, method: Payment["method"], amount?: number) =>
      set((s) => {
        const st = s.students.find((x) => x.id === studentId);
        if (!st || st.feeDue <= 0) return {};
        const paid = Math.min(st.feeDue, Math.max(1, Math.round(amount ?? st.feeDue)));
        return { payments: [payment(st, method, paid), ...s.payments], students: s.students.map((x) => (x.id === studentId ? { ...x, feeDue: x.feeDue - paid } : x)) };
      }),
    /** Monthly discount / scholarship; takes effect from next month's charge. */
    setDiscount: (studentId: number, discount: number) =>
      set((s) => ({ students: s.students.map((x) => (x.id === studentId ? { ...x, discount: Math.max(0, discount) || undefined } : x)) })),
    updateStudentScore: (studentId: number, field: "ch4Score" | "ch3Score", score: number) =>
      set((s) => ({ students: s.students.map((x) => (x.id === studentId ? { ...x, [field]: Math.max(0, Math.min(30, score || 0)) } : x)) })),
    /** Returns the new student's roll number. */
    addStudent: (input: StudentInput & { feePaid: boolean }) => {
      const id = Math.max(nextRoll(get()), lastRoll.current + 1);
      lastRoll.current = id;
      set((s) => {
        const fee = batchFee(s, input.batch);
        const st: StudentRecord = { id, ...clean(input), feeDue: fee, ch4Score: 0, ch3Score: 0, joined: monthKey(), ...(input.pending ? { pending: true } : {}) };
        return input.feePaid && fee > 0
          ? { students: [{ ...st, feeDue: 0 }, ...s.students], payments: [payment(st, "cash"), ...s.payments], nextStudentId: id + 1 }
          : { students: [st, ...s.students], nextStudentId: id + 1 };
      });
      return id;
    },
    /** Accept someone who joined from a link: from now on they can log in. (Refusing them is removeStudent.) */
    approveStudent: (studentId: number) => set((s) => ({ students: s.students.map((x) => (x.id === studentId ? { ...x, pending: undefined } : x)) })),
    /** Edit a student's details (a batch change keeps their fees as they are). */
    updateStudent: (studentId: number, input: StudentInput) =>
      set((s) => ({ students: s.students.map((x) => (x.id === studentId ? { ...x, ...clean(input) } : x)) })),
    /**
     * Demo sign-in with Google: a registered student Gmail opens that student's panel; a guardian Gmail
     * opens the parent panel with all their children. Anything else is refused.
     * shortcut: checked in the browser; with the backend, Google sign-in + this check run on the server.
     */
    signInWithEmail: (email: string): "student" | "parent" | null => {
      const e = normEmail(email);
      const st = get().students;
      const me = st.find((x) => normEmail(x.email) === e);
      if (me) {
        set(() => ({ meId: me.id }));
        return "student";
      }
      const kids = st.filter((x) => normEmail(x.guardianEmail) === e).map((x) => x.id);
      if (kids.length) {
        set(() => ({ parentChildren: kids }));
        return "parent";
      }
      return null;
    },
    /** Premium for a student until a date (YYYY-MM-DD), or off. The institute sells it (cash/bKash) and switches it on. */
    setStudentPremium: (studentId: number, until: string | null, pack?: number) =>
      set((s) => ({
        students: s.students.map((x) =>
          x.id === studentId ? { ...x, premiumUntil: until && /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : undefined, aiPack: [150, 400, 800, 1500].includes(pack as number) ? pack : x.aiPack } : x,
        ),
      })),
    setStudentPhoto: (studentId: number, photo: string | undefined) => set((s) => ({ students: s.students.map((x) => (x.id === studentId ? { ...x, photo } : x)) })),
    // Their number stays used: what was kept under it (chats, fees, marks) must never become a newcomer's.
    removeStudent: (studentId: number) => set((s) => ({ students: s.students.filter((x) => x.id !== studentId), nextStudentId: nextRoll(s) })),
    toggleStudentMode: (studentId: number) =>
      set((s) => ({ students: s.students.map((x) => (x.id === studentId ? { ...x, mode: x.mode === "offline" ? "online" : "offline" } : x)) })),
    /** A student's saved key points (`by` = the student, so each sees only their own with real accounts). */
    addNote: (title: string, text: string, by?: number) => set((s) => ({ notes: [{ id: uid(), title, text, at: new Date().toISOString(), ...(by ? { by } : {}) }, ...s.notes] })),
    // Timetable, money, admissions, staff, meetings
    addSlot: (slot: Omit<Slot, "id">) => set((s) => ({ routine: [...s.routine, { ...slot, id: uid() }] })),
    removeSlot: (id: number) => set((s) => ({ routine: s.routine.filter((x) => x.id !== id) })),
    addExpense: (e: Omit<Expense, "id">) => set((s) => ({ expenses: [{ ...e, id: uid() }, ...s.expenses] })),
    removeExpense: (id: number) => set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) })),
    addAdmission: (a: Omit<Admission, "id" | "at" | "stage">) => set((s) => ({ admissions: [{ ...a, id: uid(), at: new Date().toISOString(), stage: "enquiry" }, ...s.admissions] })),
    updateAdmission: (id: number, patch: Partial<Admission>) => set((s) => ({ admissions: s.admissions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    requestLeave: (l: Omit<StaffLeave, "id" | "status">) => set((s) => ({ staffLeave: [{ ...l, id: uid(), status: "pending" }, ...s.staffLeave] })),
    decideLeave: (id: number, status: "approved" | "rejected") => set((s) => ({ staffLeave: s.staffLeave.map((x) => (x.id === id ? { ...x, status } : x)) })),
    toggleStaffAbsent: (name: string, date = today) =>
      set((s) => {
        const a = s.staffAbsent[date] ?? [];
        return { staffAbsent: { ...s.staffAbsent, [date]: a.includes(name) ? a.filter((n) => n !== name) : [...a, name] } };
      }),
    addMeetingSlots: (slots: Omit<Meeting, "id">[]) => set((s) => ({ meetings: [...s.meetings, ...slots.map((m) => ({ ...m, id: uid() }))].sort((a, b) => a.start.localeCompare(b.start)) })),
    removeMeeting: (id: number) => set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) })),
    /** A guardian books a free slot for one child (one booking per child per teacher). */
    bookMeeting: (id: number, studentId: number) =>
      set((s) => ({ meetings: s.meetings.map((m) => (m.id === id && m.bookedBy === undefined ? { ...m, bookedBy: studentId } : m.bookedBy === studentId && m.id !== id ? { ...m, bookedBy: undefined } : m)) })),
    cancelMeeting: (id: number) => set((s) => ({ meetings: s.meetings.map((m) => (m.id === id ? { ...m, bookedBy: undefined } : m)) })),

    // Doubts and video watch time
    askDoubt: (studentId: number, batch: string, text: string, image?: string) =>
      set((s) => ({ doubts: [{ id: uid(), studentId, batch, text, image, at: new Date().toISOString(), solved: false, replies: [] } satisfies Doubt, ...s.doubts] })),
    replyDoubt: (id: number, reply: Omit<DoubtReply, "at">, solved: boolean) =>
      set((s) => ({ doubts: s.doubts.map((d) => (d.id === id ? { ...d, solved: solved || d.solved, replies: [...d.replies, { ...reply, at: new Date().toISOString() }] } : d)) })),
    setDoubtSolved: (id: number, solved: boolean) => set((s) => ({ doubts: s.doubts.map((d) => (d.id === id ? { ...d, solved } : d)) })),
    /** Seconds of a video a student actually played (best viewing kept; seeking ahead isn't counted by the player). */
    recordWatch: (itemId: number, studentId: number, sec: number, dur: number) =>
      set((s) => {
        const prev = s.watch[itemId]?.[studentId];
        if (prev && prev.sec >= sec) return {};
        return { watch: { ...s.watch, [itemId]: { ...s.watch[itemId], [studentId]: { sec: Math.round(sec), dur: Math.round(dur) } } } };
      }),

    // Teacher website, coupons and course orders (bKash TrxID that the teacher confirms)
    // Student community (posts, likes, comments, friends) and its moderation
    /** extra: more photos (up to 4), a PDF, a poll (2–4 options) and who may see it. */
    addCommunityPost: (author: Author, text: string, image?: string, extra: { images?: string[]; file?: { name: string; url: string }; poll?: string[]; audience?: Audience; held?: boolean } = {}) =>
      set((s) => {
        const clean = cleanText(text, POST_MAX);
        const images = [...(image ? [image] : []), ...(extra.images ?? [])].slice(0, 4);
        const options = (extra.poll ?? []).map((o) => o.trim().slice(0, 80)).filter(Boolean);
        const poll = options.length >= 2 ? { options: options.slice(0, 4), votes: {} } : undefined;
        if (!clean && !images.length && !extra.file && !poll) return {};
        const batch = typeof author === "number" ? s.students.find((x) => x.id === author)?.batch : undefined;
        const audience = typeof author === "number" ? (extra.audience ?? s.communityProfiles[author]?.audience ?? "all") : "all";
        const post = { id: uid(), author, text: clean ?? "", ...(images.length ? { images } : {}), ...(extra.file ? { file: extra.file } : {}), ...(poll ? { poll } : {}), ...(extra.held ? { held: true } : {}), audience, batch, at: new Date().toISOString(), likes: [], comments: [], reports: [] };
        return { community: [post, ...s.community] };
      }),
    editPost: (postId: number, text: string) =>
      set((s) => {
        const clean = cleanText(text, POST_MAX);
        return { community: s.community.map((p) => (p.id === postId && (clean || p.images?.length || p.image || p.file || p.poll) ? { ...p, text: clean ?? "", edited: new Date().toISOString() } : p)) };
      }),
    votePoll: (postId: number, studentId: number, option: number) =>
      set((s) => ({ community: s.community.map((p) => (p.id === postId && p.poll && p.poll.votes[studentId] === undefined && option >= 0 && option < p.poll.options.length ? { ...p, poll: { ...p.poll, votes: { ...p.poll.votes, [studentId]: option } } } : p)) })),
    deleteComment: (postId: number, commentId: number) =>
      set((s) => ({ community: s.community.map((p) => (p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p)) })),
    toggleSave: (studentId: number, postId: number) =>
      set((s) => {
        const saved = s.communityProfiles[studentId]?.saved ?? [];
        return { communityProfiles: { ...s.communityProfiles, [studentId]: { ...s.communityProfiles[studentId], saved: saved.includes(postId) ? saved.filter((x) => x !== postId) : [postId, ...saved].slice(0, 500) } } };
      }),
    /** Bio and privacy choices. Blocking someone also ends any friendship or request between you. */
    setCommunityProfile: (studentId: number, patch: Omit<CommunityProfile, "saved">) =>
      set((s) => {
        const next = { ...s.communityProfiles[studentId], ...patch, ...(patch.bio !== undefined ? { bio: patch.bio.trim().slice(0, BIO_MAX) } : {}) };
        const blocked = new Set(next.blocked ?? []);
        return {
          communityProfiles: { ...s.communityProfiles, [studentId]: next },
          friendships: s.friendships.filter((f) => !((f.from === studentId && blocked.has(f.to)) || (f.to === studentId && blocked.has(f.from)))),
        };
      }),
    toggleLike: (postId: number, studentId: number) =>
      set((s) => ({ community: s.community.map((p) => (p.id === postId ? { ...p, likes: p.likes.includes(studentId) ? p.likes.filter((x) => x !== studentId) : [...p.likes, studentId] } : p)) })),
    addComment: (postId: number, author: Author, text: string) =>
      set((s) => {
        const clean = cleanText(text, COMMENT_MAX);
        if (!clean) return {};
        return { community: s.community.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, { id: uid(), author, text: clean, at: new Date().toISOString() }] } : p)) };
      }),
    deletePost: (postId: number) => set((s) => ({ community: s.community.filter((p) => p.id !== postId) })),
    reportPost: (postId: number, studentId: number) =>
      set((s) => ({ community: s.community.map((p) => (p.id === postId && !p.reports.includes(studentId) ? { ...p, reports: [...p.reports, studentId] } : p)) })),
    moderatePost: (postId: number, patch: { hidden?: boolean; pinned?: boolean; clearReports?: boolean; approve?: boolean }) =>
      set((s) => ({
        community: s.community.map((p) => (p.id === postId ? { ...p, ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}), ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}), ...(patch.approve ? { held: undefined } : {}), ...(patch.clearReports ? { reports: [] } : {}) } : p)),
      })),
    requestFriend: (me: number, other: number) => set((s) => ({ friendships: requestFriend(s.friendships, me, other) })),
    answerFriend: (me: number, other: number, accept: boolean) => set((s) => ({ friendships: answerFriend(s.friendships, me, other, accept) })),

    /** Make sure a batch has its secret live-room name. */
    ensureLiveRoom: (batch: string) =>
      set((s) => (s.liveRooms[batch] ? {} : { liveRooms: { ...s.liveRooms, [batch]: `Instanton-${crypto.randomUUID().replace(/-/g, "")}` } })),
    updateSite: (patch: Partial<TeacherSite>) => set((s) => ({ site: { ...s.site, ...patch } })),
    addCoupon: (c: Omit<Coupon, "used">) => set((s) => ({ coupons: [...s.coupons.filter((x) => x.code.toUpperCase() !== c.code.toUpperCase()), { ...c, code: c.code.toUpperCase(), used: 0 }] })),
    removeCoupon: (code: string) => set((s) => ({ coupons: s.coupons.filter((x) => x.code !== code) })),
    placeOrder: (o: Omit<Order, "id" | "at" | "status">) => set((s) => ({ orders: [{ ...o, id: uid(), at: new Date().toISOString(), status: "pending" }, ...s.orders] })),
    /** Teacher checked the TrxID in their bKash app: enrol the student, record the payment, count the coupon. */
    decideOrder: (id: number, ok: boolean) => {
      const o = get().orders.find((x) => x.id === id);
      if (!o || o.status !== "pending") return;
      const batch = get().batches.find((b) => b.id === o.batchId);
      let roll = 0;
      if (ok && batch) {
        roll = Math.max(nextRoll(get()), lastRoll.current + 1);
        lastRoll.current = roll;
      }
      set((s) => {
        const orders = s.orders.map((x) => (x.id === id ? { ...x, status: ok ? ("confirmed" as const) : ("rejected" as const) } : x));
        if (!ok || !batch) return { orders };
        const st: StudentRecord = { id: roll, ...clean({ ...o.student, mode: "online", batch: batch.name }), feeDue: 0, ch4Score: 0, ch3Score: 0 };
        return {
          orders,
          students: [st, ...s.students],
          nextStudentId: roll + 1,
          payments: o.price > 0 ? [{ id: uid(), studentId: roll, batch: batch.name, amount: o.price, at: new Date().toISOString(), method: "bkash" as const }, ...s.payments] : s.payments,
          coupons: o.coupon ? s.coupons.map((c) => (c.code === o.coupon ? { ...c, used: c.used + 1 } : c)) : s.coupons,
        };
      });
    },

    addBankQuestions: (qs: Omit<BankQuestion, "id">[]) => set((s) => ({ bank: [...qs.map((q) => ({ ...q, id: uid() })), ...s.bank] })),
    deleteBankQuestion: (id: number) => set((s) => ({ bank: s.bank.filter((q) => q.id !== id) })),
    deleteNote: (id: number) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
    setReportComment: (studentId: number, comment: string) => set((s) => ({ reportComments: { ...s.reportComments, [studentId]: comment } })),

    sendChatMessage: (threadId: string, sender: string, text: string, mine: boolean, extra?: ChatExtra) =>
      set((s) => ({
        chats: s.chats.map((c): ChatThread => (c.id === threadId ? { ...c, messages: [...c.messages, { id: uid(), sender, text, at: new Date().toISOString(), mine, ...extraOf(extra), ...(!mine && threadId.startsWith("student-") ? { teacher: sender } : {}) }] } : c)),
      })),
    /** Student ↔ teacher thread (private: only the student and their batch teacher see it), created on first message. */
    sendStudentMessage: (studentId: number, text: string, extra?: ChatExtra) =>
      set((s) => {
        const st = s.students.find((x) => x.id === studentId);
        const id = `student-${studentId}`;
        // Who it is with now: a teacher assigned later (or the owner) doesn't get it.
        const teacher = s.batches.find((b) => b.name === st?.batch)?.teacher ?? "";
        const msg = { id: uid(), sender: st?.name ?? "", text, at: new Date().toISOString(), mine: true, ...extraOf(extra), teacher };
        const exists = s.chats.some((c) => c.id === id);
        return {
          chats: exists
            ? s.chats.map((c) => (c.id === id ? { ...c, unread: c.unread + 1, messages: [...c.messages, msg] } : c))
            : [...s.chats, { id, name: st?.name ?? "", role: st?.batch ?? "", unread: 1, online: false, messages: [msg] }],
        };
      }),
    /** Parent ↔ teacher thread for one child, created on first message. */
    sendParentMessage: (childId: number, text: string, extra?: ChatExtra) =>
      set((s) => {
        const child = s.students.find((x) => x.id === childId);
        const id = `parent-${childId}`;
        const sender = `${child?.name ?? ""} — guardian`;
        const msg = { id: uid(), sender, text, at: new Date().toISOString(), mine: true, ...extraOf(extra) };
        const exists = s.chats.some((c) => c.id === id);
        return {
          chats: exists
            ? s.chats.map((c) => (c.id === id ? { ...c, unread: c.unread + 1, messages: [...c.messages, msg] } : c))
            : [...s.chats, { id, name: sender, role: child?.batch ?? "", unread: 1, online: false, messages: [msg] }],
        };
      }),
    /** Opened the chat: the teacher's unread count goes to 0, and (with read receipts on) the other side's ticks turn blue. */
    markChatRead: (threadId: string, side: "family" | "staff" = "staff", receipt = true) =>
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id !== threadId ? c : { ...c, ...(side === "staff" ? { unread: 0 } : {}), ...(receipt ? { [side === "staff" ? "readStaff" : "readFamily"]: new Date().toISOString() } : {}) },
        ),
      })),
    editChatMessage: (threadId: string, msgId: number, text: string) => setChatMessage(threadId, msgId, (m) => (m.deleted ? m : { ...m, text, edited: true })),
    /** "Delete for everyone": the message stays as "This message was deleted". */
    deleteChatMessage: (threadId: string, msgId: number) => setChatMessage(threadId, msgId, (m) => ({ id: m.id, sender: m.sender, at: m.at, mine: m.mine, text: "", deleted: true, ...(m.teacher === undefined ? {} : { teacher: m.teacher }) })),
    reactChatMessage: (threadId: string, msgId: number, side: "family" | "staff", emoji: string | null) =>
      setChatMessage(threadId, msgId, (m) => {
        const react = { ...m.react, [side]: emoji ?? undefined };
        if (!emoji) delete react[side];
        return { ...m, react: Object.keys(react).length ? react : undefined };
      }),

    // Centre (coaching-centre mode) and accounts.
    addStaff: (name: string, phone: string, email?: string) =>
      set((s) => ({ staff: [...s.staff, { name, phone, salary: 0, share: 0, ...(email ? { email: normEmail(email) } : {}) }] })),
    updateStaff: (name: string, patch: Partial<Pick<Staff, "salary" | "share">>) => set((s) => ({ staff: s.staff.map((x) => (x.name === name ? { ...x, ...patch } : x)) })),
    payStaff: (name: string, amount: number) =>
      set((s) => ({ staffPayments: [{ id: uid(), name, month: monthKey(), amount, at: new Date().toISOString() }, ...s.staffPayments] })),
    setViewer: (viewer: string) => set(() => ({ viewer })),
    /**
     * Teacher login by mobile number: the owner gets the whole institute; an assigned teacher only their own batches.
     * Returns null for a number that isn't on the staff list. shortcut: no real OTP yet (Supabase phone auth later).
     */
    signInTeacher: (phone: string): "owner" | "staff" | null => {
      const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);
      const s = get();
      const st = s.staff.find((x) => last10(x.phone) === last10(phone));
      if (!st) return null;
      const owner = st.name === s.teacherName;
      set(() => ({ teacherLogin: st.name, viewer: owner ? "all" : st.name }));
      return owner ? "owner" : "staff";
    },
    /** Teacher sign-up: profile + first batch. */
    signUpTeacher: (input: { name: string; phone: string; batch: string; days: string; classDays: number[]; subject: string; fee: number; institute?: string }) =>
      set((s) => {
        const id = `${input.batch.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uid()}`;
        return {
          teacherName: input.name,
          instituteName: (input.institute ?? "").trim().slice(0, 80) || s.instituteName,
          viewer: input.name,
          teacherLogin: input.name,
          staff: s.staff.some((x) => x.name === input.name) ? s.staff : [...s.staff, { name: input.name, phone: input.phone, salary: 0, share: 0 }],
          batches: [{ id, name: input.batch, short: input.batch.slice(0, 2).toUpperCase(), days: input.days, classDays: input.classDays, fee: input.fee, lateFine: 0, teacher: input.name, subject: input.subject || undefined }, ...s.batches],
        };
      }),
    setMe: (studentId: number) => set((s) => ({ meId: studentId, parentChildren: s.parentChildren.includes(studentId) ? s.parentChildren : [studentId, ...s.parentChildren] })),

    setInstituteName: (name: string) => set(() => ({ instituteName: name.trim().slice(0, 80) })),
    /** Change a teacher's name or phone. Names link batches, routine, payroll, leave and meetings, so update them all. */
    updateStaffProfile: (oldName: string, name: string, phone: string) =>
      set((s) => {
        const n = name.trim().slice(0, 60) || oldName;
        const r = (x: string) => (x === oldName ? n : x);
        return {
          staff: s.staff.map((x) => (x.name === oldName ? { ...x, name: n, phone: phone.trim() || x.phone } : x)),
          teacherName: r(s.teacherName),
          viewer: r(s.viewer),
          teacherLogin: r(s.teacherLogin),
          batches: s.batches.map((b) => ({ ...b, teacher: r(b.teacher) })),
          routine: s.routine.map((x) => ({ ...x, teacher: r(x.teacher) })),
          meetings: s.meetings.map((x) => ({ ...x, teacher: r(x.teacher) })),
          staffPayments: s.staffPayments.map((x) => ({ ...x, name: r(x.name) })),
          staffLeave: s.staffLeave.map((x) => ({ ...x, name: r(x.name) })),
          staffAbsent: Object.fromEntries(Object.entries(s.staffAbsent).map(([d, names]) => [d, names.map(r)])),
        };
      }),
    /** Everything in this browser, as a backup file the teacher can keep (until data lives on the server). */
    exportBackup: () => JSON.stringify({ app: BACKUP_TAGS[0], version: 1, savedAt: new Date().toISOString(), data: get() }),
    /** Restore a backup file. Returns false (and changes nothing) if the file isn't an Instanton Campus backup. */
    importBackup: (text: string) => {
      try {
        const b = JSON.parse(text);
        if (!BACKUP_TAGS.includes(b?.app) || !b.data || !Array.isArray(b.data.students) || !Array.isArray(b.data.batches)) return false;
        // Students' private chats with their teachers are never in a backup (the owner can't see them): keep them as they are.
        const own = get().chats.filter((c) => c.id.startsWith("student-"));
        const next: LmsState = { ...fresh(), ...b.data, chats: [...(Array.isArray(b.data.chats) ? b.data.chats : []).filter((c: { id?: unknown }) => !String(c?.id).startsWith("student-")), ...own] };
        // Roll numbers given out since the backup was made stay used (those students' private chats are still here), so the counter never goes back.
        replace({ ...next, nextStudentId: Math.max(nextRoll(get()), nextRoll(next)) });
        return true;
      } catch {
        return false;
      }
    },

    resetDemoData: () => replace(seed()),
  };
}
