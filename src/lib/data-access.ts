// With real accounts: which actions each person may send to the server, and what they get back.
// Students and guardians act only as themselves and see only their own slice of the institute.
import { blankState, makeActions, setIdBase, type LmsState } from "./lms-actions.ts";
import { markQuiz, scoreQuiz } from "./quiz.ts";
import { averagePct, leagueRank, myRank } from "./lms-views.ts";
import { validateStudent, type StudentContact } from "./site.ts";
import { unkind } from "./word-filter.ts";
import { AUDIENCES, BIO_MAX, canRequest, canSee, COMMENT_MAX, MAX_IMAGES, POLL_OPTION_MAX, pollFor, POST_MAX, seer } from "./community.ts";

export type Who = { role: "owner" | "manager" | "teacher" | "student" | "guardian"; name: string; studentIds: number[]; email?: string };

/** A teacher's name as the institute's data has it now (they may have renamed themselves since they were added). */
const staffName = (s: LmsState, who: Who) => s.staff.find((x) => !!who.email && x.email?.toLowerCase() === who.email)?.name ?? who.name;

/** Screen-only actions (who's looking, demo sign-in, downloading a backup): never sent to the server. */
export const LOCAL_ONLY = new Set(["setViewer", "setMe", "signInWithEmail", "signInTeacher", "exportBackup"]);
/** Not shown until the server answers: a quiz is marked there, so the browser has nothing right to show first. */
export const SERVER_FIRST = new Set(["submitQuiz"]);
/** Sample data never goes into a real institute. */
const NEVER = new Set(["resetDemoData"]);
/** Money, staff and institute settings: owner (and branch managers). */
/** Money, staff, institute settings, and creating or setting up a batch (fee, teacher, days): owner (and branch managers). */
const OWNER = new Set(["importBackup", "addStaff", "updateStaff", "payStaff", "setInstituteName", "decideLeave", "signUpTeacher", "updateSite", "addCoupon", "removeCoupon", "setStudentPremium", "addBatch", "updateBatch", "addExpense", "removeExpense", "addAdmission", "updateAdmission", "decideOrder", "toggleStaffAbsent", "exportBackup"]);

type A = unknown[];
const viaModule = ([m]: A, s: LmsState) => [s.modules.find((x) => x.id === m)?.batch];
const viaStudent = ([id]: A, s: LmsState) => [s.students.find((x) => x.id === id)?.batch];
const viaStudents = ([ids]: A, s: LmsState) => {
  const batch = new Map<number, string>();
  for (const x of s.students) if (!batch.has(x.id)) batch.set(x.id, x.batch); // a whole batch is marked at once: one table, not a search per student
  return (ids as number[]).map((id) => batch.get(id));
};
const inInput = ([x]: A) => [(x as { batch?: string }).batch];
/** The student a chat thread is about: "parent-12" (guardian ↔ teacher) or "student-12" (the student's private chat with their teacher). */
export const chatStudent = (thread: unknown) => Number(/^(?:parent|student)-(\d+)$/.exec(String(thread))?.[1] ?? NaN);
const viaThread = ([id]: A, s: LmsState) => [s.students.find((x) => x.id === chatStudent(id))?.batch];
/** A student's private chat is for them and their batch teacher only, not the owner or a manager. */
const privateChatOf = (s: LmsState, thread: unknown, me: string) => {
  if (!String(thread).startsWith("student-")) return true;
  const batch = s.students.find((x) => x.id === chatStudent(thread))?.batch;
  return !!batch && s.batches.some((b) => b.name === batch && b.teacher === me);
};
/** The batches each teacher action touches: a teacher works only in the batches the institute gave them. */
const TEACHER_BATCH: Record<string, (a: A, s: LmsState) => (string | undefined)[]> = {
  addAnnouncement: inInput, addCalendarEvent: inInput, addStudent: inInput,
  deleteAnnouncement: ([id], s) => [s.announcements.find((x) => x.id === id)?.batch],
  addModule: ([, b]) => [b as string], addStoryPost: ([b]) => [b as string], ensureLiveRoom: ([b]) => [b as string],
  deleteStoryPost: ([id], s) => [s.story.find((x) => x.id === id)?.batch],
  copyModule: (a, s) => [...viaModule(a, s), a[1] as string],
  toggleModulePublish: viaModule, deleteModule: viaModule, addModuleItem: viaModule, deleteModuleItem: viaModule, setMeritPublished: viaModule, toggleItemPreview: viaModule, gradeSubmission: viaModule,
  addPoint: viaStudent, toggleAttendance: viaStudent, markPresent: viaStudent, payFee: viaStudent, setDiscount: viaStudent, updateStudentScore: viaStudent, setStudentPhoto: viaStudent,
  removeStudent: viaStudent, toggleStudentMode: viaStudent, setReportComment: viaStudent, approveStudent: viaStudent,
  updateStudent: (a, s) => [...viaStudent(a, s), (a[1] as { batch?: string }).batch], // not moved into someone else's batch either
  markAllPresent: viaStudents, markAllAbsent: viaStudents,
  sendChatMessage: viaThread, markChatRead: viaThread, // a teacher writes only in their own batches' threads
  submitQuiz: viaModule, // marks from OMR sheets
  addExploreVideo: ([v], s) => ((v as { moduleId?: unknown })?.moduleId === undefined ? [] : viaModule([(v as { moduleId: unknown }).moduleId], s)),
  removePoint: ([id], s) => [s.students.find((x) => x.id === s.points.find((p) => p.id === id)?.studentId)?.batch],
  addMeetingSlots: ([slots], s) => (Array.isArray(slots) ? slots.map((m) => (m as { batch?: string })?.batch) : [undefined]),
  removeMeeting: ([id], s) => [s.meetings.find((m) => m.id === id)?.batch],
  addSlot: inInput, removeSlot: ([id], s) => [s.routine.find((x) => x.id === id)?.batch],
  // The institute has one live class at a time: a teacher may replace only their own (or none).
  updateLiveClass: ([x], s) => [(x as { batch?: string })?.batch, ...(s.liveClass.batch ? [s.liveClass.batch] : [])],
  replyDoubt: ([id], s) => [s.doubts.find((d) => d.id === id)?.batch], setDoubtSolved: ([id], s) => [s.doubts.find((d) => d.id === id)?.batch],
};
function ownBatches(name: string, args: A, who: Who, s: LmsState) {
  const mine = new Set(s.batches.filter((b) => b.teacher === staffName(s, who)).map((b) => b.name));
  let touched: (string | undefined)[];
  try {
    touched = TEACHER_BATCH[name](args, s);
  } catch {
    return false; // not even the right shape
  }
  return touched.every((b) => b !== undefined && mine.has(b));
}

export class Refused extends Error {}
const refuse = (why: string): never => {
  throw new Refused(why);
};
const str = (x: unknown, max: number) => (typeof x === "string" && x.length <= max ? x : refuse("bad text"));
const optStr = (x: unknown, max: number) => (x === undefined || x === null ? undefined : str(x, max));
const num = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : refuse("bad number"));
const int = (x: unknown) => (Number.isInteger(x) ? (x as number) : refuse("bad id"));

const STAFF_TEXT_MAX = 300_000; // one change by staff, not counting attached files (a long lesson with 200 questions is ~60,000)
const FILE_MAX = 8_000_000; // a photo or PDF as a data URL; shortcut: files live in the saved data until video/file storage is added
const batchOf = (s: LmsState, id: number) => s.students.find((x) => x.id === id)?.batch;
/** An item the student may work on: in a published chapter of their own batch. */
function myItem(s: LmsState, me: number, moduleId: unknown, itemId: unknown) {
  const m = s.modules.find((x) => x.id === moduleId);
  const it = m?.items.find((x) => x.id === itemId);
  return m && it && m.published && m.batch === batchOf(s, me) ? it : refuse("not your class");
}

const badStudent = (input: unknown, s: LmsState, exceptId?: unknown) => {
  try {
    return Object.keys(validateStudent(input as StudentContact, s.students, exceptId as number | undefined)).length > 0;
  } catch {
    return true; // not even the right shape
  }
};

/** A photo or PDF the student uploads with a post: only as a file (data URL) of that kind, never a link to elsewhere. */
const upload = (x: unknown, kind: "image" | "pdf") =>
  typeof x === "string" && x.length <= FILE_MAX && (kind === "image" ? /^data:image\/(png|jpeg|webp|gif);base64,/ : /^data:application\/pdf;base64,/).test(x) ? x : refuse("bad file");
/** A homework hand-in: a photo or a PDF, as a file (data URL), never a link or other text. */
const handIn = (x: unknown) =>
  typeof x === "string" && x.length <= FILE_MAX && /^data:(image\/(png|jpeg|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=]*$/.test(x) ? x : refuse("bad file");
/** A community post this student may see (and so like, reply to, vote on or bookmark). */
const seenPost = (s: LmsState, me: number, id: unknown) => {
  const p = s.community.find((x) => x.id === id);
  return p && canSee(p, { student: me, batch: batchOf(s, me) }, s.friendships, s.communityProfiles) ? p : refuse("no such post");
};
const ids = (x: unknown, s: LmsState) =>
  x === undefined ? undefined : Array.isArray(x) && x.length <= 300 && x.every((v) => s.students.some((st) => st.id === v)) ? (x as number[]) : refuse("bad list");

/** How many of these were made today (a flood from one account must not fill the institute's data). */
const today = (list: { at: string }[]) => list.filter((x) => x.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

type Rule = (a: unknown[], me: number, s: LmsState, who: Who) => unknown[] | null; // null: nothing to save
/** Things only a student or guardian does for themselves (taking a quiz, liking, chatting as the student…). */
const FAMILY_ONLY = new Set(["startQuiz", "submitAssignment", "toggleItemDone", "earnXp", "recordWatch", "sendStudentMessage", "sendParentMessage", "askDoubt", "toggleLike", "toggleSave", "votePoll", "reportPost", "requestFriend", "answerFriend", "setCommunityProfile", "bookMeeting", "cancelMeeting", "addPortfolio", "deletePortfolio"]);
/** Attendance changes take a date second: not more than a day ahead (time zones), so no absence alerts for the future. */
const DATED = new Set(["toggleAttendance", "markPresent", "markAllPresent", "markAllAbsent"]);
const dayKeyAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const STUDENT: Record<string, Rule> = {
  toggleItemDone: ([m, i], me, s) => (myItem(s, me, m, i), [m, i, me]),
  earnXp: ([, amount], me) => [me, Math.round(num(amount, 0, 50))],
  // The server marks the quiz from the options the student picked; a score sent by the browser is ignored.
  submitQuiz: ([m, i, , , , tabs, picks], me, s) => {
    const it = myItem(s, me, m, i);
    const qs = it.questions ?? [];
    if (it.kind !== "quiz" || !qs.length) refuse("not a quiz");
    if (it.scores?.[me] !== undefined) return null; // the first attempt counts
    const ok = Array.isArray(picks) && picks.length === qs.length && picks.every((p, k) => p === null || (Number.isInteger(p) && p >= 0 && p < qs[k].options.length));
    const list = ok ? (picks as (number | null)[]) : refuse("bad answers");
    // How long it really took, by the server's clock (the countdown on screen can be tampered with).
    const start = it.started?.[me];
    const took = start ? Math.max(0, Math.round((Date.now() - Date.parse(start)) / 1000)) : -1;
    return [m, i, me, scoreQuiz(qs, list, it.points ?? qs.length, it.negative), markQuiz(qs, list), Math.round(num(tabs ?? 0, 0, 1000)), undefined, took];
  },
  startQuiz: ([m, i], me, s) => (myItem(s, me, m, i).kind === "quiz" ? [m, i, me] : refuse("not a quiz")),
  submitAssignment: ([m, i, , sub], me, s) => {
    const it = myItem(s, me, m, i);
    if (it.submissions?.[me]?.grade !== undefined) refuse("already marked");
    const x = (sub ?? {}) as Record<string, unknown>;
    return [m, i, me, { fileName: str(x.fileName, 200), file: x.file === undefined || x.file === null ? undefined : handIn(x.file) }]; // never the student's own grade or comment
  },
  recordWatch: ([itemId, , sec, dur], me, s) => {
    const m = s.modules.find((x) => x.items.some((it) => it.id === itemId));
    myItem(s, me, m?.id, itemId);
    return [itemId, me, num(sec, 0, 86_400), num(dur, 0, 86_400)];
  },
  addNote: ([title, text], me, s) => (s.notes.filter((n) => n.by === me).length < 300 ? [str(title, 200), str(text, 20_000), me] : refuse("too many notes")),
  deleteNote: ([id], me, s) => (s.notes.find((n) => n.id === id)?.by === me ? [id] : refuse("not your note")),
  askDoubt: ([, , text, image], me, s) => (today(s.doubts.filter((d) => d.studentId === me)) < 20 ? [me, batchOf(s, me), str(text, 2000), image === undefined || image === null ? undefined : upload(image, "image")] : refuse("too many today")),
  addCommunityPost: ([, text, image, extra], me, s) => {
    if (today(s.community.filter((p) => p.author === me)) >= 20) refuse("too many today");
    const x = (extra ?? {}) as Record<string, unknown>;
    const images = x.images === undefined ? undefined : Array.isArray(x.images) && x.images.length <= MAX_IMAGES ? x.images.map((i) => upload(i, "image")) : refuse("bad photos");
    const f = x.file as { name?: unknown; url?: unknown } | undefined;
    const file = f === undefined ? undefined : { name: str(f?.name, 200), url: upload(f?.url, "pdf") };
    const poll = x.poll === undefined ? undefined : Array.isArray(x.poll) && x.poll.length >= 2 && x.poll.length <= 4 ? x.poll.map((o) => str(o, POLL_OPTION_MAX)) : refuse("bad poll");
    const audience = x.audience === undefined ? undefined : AUDIENCES.includes(x.audience as never) ? x.audience : refuse("bad audience");
    return [me, str(text, POST_MAX), image === undefined || image === null ? undefined : upload(image, "image"), { images, file, poll, audience }];
  },
  editPost: ([post, text], me, s) => (s.community.find((p) => p.id === post && !p.hidden)?.author === me && !unkind(String(text)) ? [post, str(text, POST_MAX)] : refuse("not your post")),
  toggleLike: ([post], me, s) => [seenPost(s, me, post).id, me],
  addComment: ([post, , text], me, s) => (today(s.community.flatMap((p) => p.comments.filter((c) => c.author === me))) < 100 && !unkind(String(text)) ? [seenPost(s, me, post).id, me, str(text, COMMENT_MAX)] : refuse("not accepted")),
  deleteComment: ([post, comment], me, s) => (seenPost(s, me, post).comments.find((c) => c.id === comment)?.author === me ? [post, comment] : refuse("not your comment")),
  votePoll: ([post, , option], me, s) => {
    const p = seenPost(s, me, post);
    if (!p.poll || !Number.isInteger(option) || (option as number) < 0 || (option as number) >= p.poll.options.length) refuse("bad vote");
    return p.poll!.votes[me] === undefined ? [p.id, me, option] : null; // one vote each
  },
  toggleSave: ([, post], me, s) => [me, seenPost(s, me, post).id],
  setCommunityProfile: ([, patch], me, s) => {
    const x = (patch ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (x.bio !== undefined) out.bio = unkind(String(x.bio)) ? refuse("unkind words") : str(x.bio, BIO_MAX * 2);
    if (x.audience !== undefined) out.audience = AUDIENCES.includes(x.audience as never) ? x.audience : refuse("bad audience");
    if (x.requests !== undefined) out.requests = ["all", "batch", "none"].includes(x.requests as string) ? x.requests : refuse("bad setting");
    if (x.hidden !== undefined) out.hidden = x.hidden === true;
    if (x.muted !== undefined) out.muted = ids(x.muted, s);
    if (x.blocked !== undefined) out.blocked = ids(x.blocked, s);
    return [me, out];
  },
  deletePost: ([post], me, s) => (s.community.find((p) => p.id === post)?.author === me ? [post] : refuse("not your post")),
  reportPost: ([post], me, s) => [seenPost(s, me, post).id, me],
  requestFriend: ([, other], me, s) =>
    s.students.some((x) => x.id === other) && canRequest(s.communityProfiles, { me: batchOf(s, me), other: batchOf(s, other as number) }, me, other as number) ? [me, other] : refuse("not allowed"),
  answerFriend: ([, other, accept], me) => [me, int(other), accept === true],
  ensureLiveRoom: ([batch], me, s) => (batch === batchOf(s, me) ? [batch] : refuse("not your class")),
  sendStudentMessage: ([, text], me) => [me, str(text, 2000)],
};
const FAMILY: Record<string, Rule> = {
  addPortfolio: ([id, title, image], _me, s, who) =>
    who.studentIds.includes(id as number) && s.portfolio.filter((p) => p.studentId === id).length < 100 ? [id, str(title, 200), upload(image, "image")] : refuse("not your child"),
  markChatRead: () => null, // the unread count is the teacher's
};
const GUARDIAN: Record<string, Rule> = {
  bookMeeting: ([id, child], _me, s, who) =>
    who.studentIds.includes(child as number) && s.meetings.find((m) => m.id === id)?.batch === batchOf(s, child as number) ? [int(id), child] : refuse("not your child's teacher"),
  cancelMeeting: ([id], _me, s, who) => (who.studentIds.includes(s.meetings.find((m) => m.id === id)?.bookedBy ?? -1) ? [id] : refuse("not your booking")),
  sendParentMessage: ([child, text], _me, _s, who) => (who.studentIds.includes(child as number) ? [child, str(text, 2000)] : refuse("not your child")),
};

/** The arguments to run `name` with on the server for this person, null to skip quietly; throws Refused. */
export function checkAction(name: string, args: unknown[], who: Who, s: LmsState): unknown[] | null {
  if (LOCAL_ONLY.has(name) || NEVER.has(name)) refuse("not allowed");
  if (who.role === "owner" || who.role === "manager" || who.role === "teacher") {
    if (who.role === "teacher" && OWNER.has(name)) refuse("owner only");
    // A student's or guardian's own actions: staff may not do them in someone's name.
    if (FAMILY_ONLY.has(name)) refuse("students and guardians only");
    if ((name === "addCommunityPost" && args[0] !== "teacher") || (name === "addComment" && args[1] !== "teacher")) refuse("staff post as the teacher");
    if (name === "addNote" && args[2] !== undefined) refuse("not your note");
    if (name === "deleteNote" && s.notes.find((n) => n.id === args[0])?.by !== undefined) refuse("not your note");
    if (who.role === "teacher" && name === "requestLeave" && (args[0] as { name?: unknown })?.name !== staffName(s, who)) refuse("only your own leave");
    if (name === "payFee" && args[2] !== undefined && !(typeof args[2] === "number" && Number.isFinite(args[2]) && args[2] > 0)) refuse("bad amount");
    if (DATED.has(name) && typeof args[1] === "string" && args[1] > dayKeyAfter(1)) refuse("future date");
    if ((name === "sendChatMessage" || name === "markChatRead") && !privateChatOf(s, args[0], staffName(s, who))) refuse("private chat");
    if (who.role === "teacher" && name === "updateStaffProfile" && args[0] !== staffName(s, who)) refuse("only your own profile");
    // Batches belong to a teacher by name: taking a colleague's name would take their batches.
    const newName = String(args[1]).trim().slice(0, 60);
    if (name === "updateStaffProfile" && newName !== args[0] && (s.staff.some((x) => x.name === newName) || s.batches.some((b) => b.teacher === newName))) refuse("name taken");
    if (who.role === "teacher" && Object.hasOwn(TEACHER_BATCH, name) && !ownBatches(name, args, who, s)) refuse("not your batch");
    // Sign-in follows the student list, so its Gmail rules (valid, one role each) are checked here too, not only in the browser.
    // Typed text is small; only uploads (which go to file storage) are big. Stops one account filling the institute's space.
    if (name !== "importBackup" && JSON.stringify(args).replace(/"data:[a-z]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]*"/g, '""').length > STAFF_TEXT_MAX) refuse("too large");
    if (name === "addStudent" && badStudent(args[0], s)) refuse("bad student");
    if (name === "updateStudent" && badStudent(args[1], s, args[0])) refuse("bad student");
    return args;
  }
  // Own keys only: a name like "constructor" must not find something on every object.
  const rules = who.role === "student" ? STUDENT : GUARDIAN;
  const rule = Object.hasOwn(rules, name) ? rules[name] : Object.hasOwn(FAMILY, name) ? FAMILY[name] : refuse("not allowed");
  return rule(args, who.studentIds[0] ?? 0, s, who);
}

/**
 * A teacher gets their own batches only: those students, their fees, attendance, lessons, marks and chats.
 * Nothing about other batches' families, the institute's money, or what colleagues are paid.
 */
function teacherView(s: LmsState, me: string): LmsState {
  const batches = s.batches.filter((b) => b.teacher === me);
  const names = new Set(batches.map((b) => b.name));
  const mine = new Set(s.students.filter((x) => names.has(x.batch)).map((x) => x.id));
  const own = <T,>(rec: Record<number, T> | undefined) => Object.fromEntries(Object.entries(rec ?? {}).filter(([k]) => mine.has(Number(k)))) as Record<number, T>;
  return {
    ...s,
    teacherLogin: me,
    viewer: me,
    batches,
    // Other batches' students: name, batch and photo only (the community shows who wrote a post), as classmates see them.
    students: s.students.map((x) => (mine.has(x.id) ? x : { id: x.id, name: x.name, batch: x.batch, photo: x.photo, mode: x.mode, email: "", guardianName: "", guardianEmail: "", phone: "", feeDue: 0, ch4Score: 0, ch3Score: 0 })),
    payments: s.payments.filter((p) => mine.has(p.studentId)),
    attendance: Object.fromEntries(Object.entries(s.attendance).map(([d, absent]) => [d, absent.filter((id) => mine.has(id))])),
    modules: s.modules.filter((m) => names.has(m.batch)),
    announcements: s.announcements.filter((a) => !a.batch || a.batch === "all" || names.has(a.batch)),
    calendarEvents: s.calendarEvents.filter((e) => !e.batch || names.has(e.batch)),
    liveClass: names.has(s.liveClass.batch) ? s.liveClass : { ...s.liveClass, batch: "", topic: "", link: "" },
    liveRooms: Object.fromEntries(Object.entries(s.liveRooms).filter(([b]) => names.has(b))),
    // Colleagues by name; pay and contact details only their own.
    staff: s.staff.map((x) => (x.name === me ? x : { name: x.name, phone: "", salary: 0, share: 0 })),
    staffPayments: s.staffPayments.filter((x) => x.name === me),
    staffLeave: s.staffLeave.filter((x) => x.name === me),
    staffAbsent: Object.fromEntries(Object.entries(s.staffAbsent).map(([d, list]) => [d, list.filter((n) => n === me)])),
    expenses: [],
    admissions: [],
    orders: [],
    coupons: [],
    chats: s.chats.filter((c) => mine.has(chatStudent(c.id))), // guardians' threads and the students' own chats, for their own batches
    doubts: s.doubts.filter((d) => names.has(d.batch)),
    meetings: s.meetings.filter((m) => m.teacher === me || names.has(m.batch)),
    story: s.story.filter((p) => names.has(p.batch)),
    points: s.points.filter((p) => mine.has(p.studentId)),
    portfolio: s.portfolio.filter((p) => mine.has(p.studentId)),
    notes: s.notes.filter((n) => n.by === undefined), // students' own key points are private to them
    reportComments: own(s.reportComments),
    watch: Object.fromEntries(Object.entries(s.watch).map(([item, by]) => [item, own(by)])),
    xp: own(s.xp),
    // Community (teachers moderate it): every post, but not who voted for what, and nobody's mute or block lists.
    community: s.community.map((p) => (p.poll ? { ...p, poll: pollFor(p.poll, undefined) } : p)),
    communityProfiles: Object.fromEntries(Object.entries(s.communityProfiles ?? {}).map(([id, pr]) => [id, { bio: pr.bio }])),
    friendships: [],
  };
}

/** What this person gets to see. Students and guardians: built up from empty, so new kinds of data stay private until added here. */
export function viewFor(s: LmsState, who: Who): LmsState {
  if (who.role === "owner" || who.role === "manager")
    return {
      ...s,
      teacherLogin: s.teacherName,
      viewer: "all",
      notes: s.notes.filter((n) => n.by === undefined), // students' own notes are private to them, as for teachers
      chats: s.chats.filter((c) => privateChatOf(s, c.id, staffName(s, who))), // students' private chats only if they teach that batch
      // Even the owner isn't sent who voted for what, or whom each student muted or blocked.
      community: s.community.map((p) => (p.poll ? { ...p, poll: pollFor(p.poll, undefined) } : p)),
      communityProfiles: Object.fromEntries(Object.entries(s.communityProfiles ?? {}).map(([id, pr]) => [id, { bio: pr.bio }])),
    };
  if (who.role === "teacher") return teacherView(s, staffName(s, who));

  const ids = who.studentIds;
  const mine = (id: number | undefined) => id !== undefined && ids.includes(id);
  // Their own entries of a per-student record: looked up by their ids (one or two), not by walking every student's entry.
  const own = <T,>(rec: Record<number, T> | undefined) => rec && (Object.fromEntries(ids.flatMap((id) => (Object.hasOwn(rec, id) ? [[id, rec[id]]] : []))) as Record<number, T>);
  const batches = new Set(s.students.filter((x) => mine(x.id)).map((x) => x.batch));
  const me = who.role === "student" ? ids[0] : undefined;
  const visible = me === undefined ? null : seer({ student: me, batch: batchOf(s, me) }, s.friendships, s.communityProfiles); // friends and batch found once
  return {
    ...blankState(),
    teacherName: s.teacherName,
    instituteName: s.instituteName,
    feeMonth: s.feeMonth,
    // Names only, plus the phone of the teachers of this family's own batches (guardians call them).
    staff: s.staff.map((x) => ({ name: x.name, phone: who.role === "guardian" && s.batches.some((b) => b.teacher === x.name && batches.has(b.name)) ? x.phone : "", salary: 0, share: 0 })),
    meId: ids[0] ?? 0,
    parentChildren: ids,
    // Classmates: name and batch only (community, leaderboards).
    students: s.students.filter((x) => mine(x.id) || !x.pending).map((x) => (mine(x.id) ? x : { id: x.id, name: x.name, batch: x.batch, photo: x.photo, mode: x.mode, email: "", guardianName: "", guardianEmail: "", phone: "", feeDue: 0, ch4Score: 0, ch3Score: 0 })),
    batches: s.batches,
    payments: s.payments.filter((p) => mine(p.studentId)),
    attendance: Object.fromEntries(Object.entries(s.attendance).map(([d, absent]) => [d, absent.filter(mine)])),
    modules: s.modules
      .filter((m) => m.published && batches.has(m.batch))
      .map((m) => ({
        ...m,
        items: m.items.map(({ doneBy, answerKey, answerKeyName, ...it }) => ({
          ...it,
          // The right answers arrive only after the quiz is taken (the server marks it); the answer key only after the exam is marked.
          questions: ids.some((id) => it.scores?.[id] !== undefined) ? it.questions : it.questions?.map((q) => ({ ...q, answer: -1 })),
          ...(ids.some((id) => it.submissions?.[id]?.grade !== undefined) ? { answerKey, answerKeyName } : {}),
          done: ids.some((id) => doneBy?.includes(id) || it.scores?.[id] !== undefined || it.submissions?.[id] !== undefined),
          // Only their own marks, and their position among classmates; never anyone else's marks.
          scores: own(it.scores),
          ranks: Object.fromEntries(
            ids.flatMap((id) => {
              const r = myRank(it.ranks ? { ...it, ranks: undefined } : it, id); // counted from everyone's marks, in one pass
              return r ? [[id, { rank: r.rank, of: r.of }]] : [];
            }),
          ),
          answers: own(it.answers),
          submissions: own(it.submissions),
          tabSwitches: own(it.tabSwitches),
          started: own(it.started),
          took: own(it.took),
        })),
      })),
    announcements: s.announcements.filter((a) => !a.batch || a.batch === "all" || batches.has(a.batch)), // not other (paid) batches' notices
    exploreVideos: s.exploreVideos,
    enrolledCourses: s.enrolledCourses,
    calendarEvents: s.calendarEvents.filter((e) => !e.batch || batches.has(e.batch)), // older events have no batch: everyone's
    liveClass: batches.has(s.liveClass.batch) ? s.liveClass : { ...s.liveClass, batch: "", topic: "", link: "" }, // the class link is for its own batch only
    routine: s.routine,
    site: s.site,
    xp: own(s.xp) ?? {},
    leagueRank: Object.fromEntries(ids.flatMap((id) => { const r = leagueRank(s.students, s.xp, id); return r ? [[id, r]] : []; })),
    reportComments: own(s.reportComments) ?? {},
    points: s.points.filter((p) => mine(p.studentId)),
    portfolio: s.portfolio.filter((p) => mine(p.studentId)),
    notes: s.notes.filter((n) => me !== undefined && n.by === me),
    story: s.story.filter((p) => batches.has(p.batch)),
    meetings: s.meetings.filter((m) => batches.has(m.batch)).map((m) => (m.bookedBy === undefined || mine(m.bookedBy) ? m : { ...m, bookedBy: -1 })), // -1: taken by someone else
    doubts: s.doubts.filter((d) => mine(d.studentId)),
    watch: Object.fromEntries(Object.entries(s.watch).map(([item, by]) => [item, own(by) ?? {}])),
    liveRooms: Object.fromEntries(Object.entries(s.liveRooms).filter(([b]) => batches.has(b))),
    // Guardians: their children's threads with the teacher. A student: only their own private chat with their teacher.
    chats: who.role === "guardian" ? s.chats.filter((c) => ids.some((id) => c.id === `parent-${id}`)) : s.chats.filter((c) => c.id === `student-${me}`),
    // Only posts this student may see (audience, blocks); polls without who voted what.
    community:
      me === undefined
        ? []
        : s.community
            .filter(visible!)
            .map((p) => ({ ...p, reports: p.reports.filter(mine), ...(p.poll ? { poll: pollFor(p.poll, me) } : {}) })),
    // My own settings in full; of everyone else only what the People list needs (bio, findable, who may ask).
    communityProfiles: Object.fromEntries(
      Object.entries(s.communityProfiles ?? {}).map(([id, pr]) => [id, mine(Number(id)) ? pr : { bio: pr.bio, hidden: pr.hidden, requests: pr.requests }]),
    ),
    friendships: s.friendships.filter((f) => mine(f.from) || mine(f.to)),
  };
}

/** Gmail addresses that may sign in, from the institute's student list (kept in the roster table). */
export function rosterOf(s: LmsState) {
  const rows: { email: string; role: "student" | "guardian"; student_id: number }[] = [];
  const ok = (e: unknown): e is string => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200; // one bad address must not block everyone else's sign-in
  for (const st of s.students) {
    if (!Number.isInteger(st.id) || st.pending) continue; // waiting for approval: no sign-in yet
    if (ok(st.email)) rows.push({ email: st.email.toLowerCase(), role: "student", student_id: st.id });
    if (ok(st.guardianEmail)) rows.push({ email: st.guardianEmail.toLowerCase(), role: "guardian", student_id: st.id });
  }
  return rows;
}

/** The highest numeric id anywhere in some data. Reads it as text, so for a whole institute this is the slow way. */
export function topId(data: unknown) {
  let top = 0;
  for (const m of (JSON.stringify(data) ?? "").matchAll(/"id":(\d+)/g)) top = Math.max(top, Number(m[1]));
  return top;
}

/**
 * Repeat a browser action on the saved data. New ids start above every id already in it, so they never clash.
 * `top`: that highest id, when the caller already knows it (the server remembers it between saves); otherwise it is searched for.
 */
export function runAction(state: LmsState, name: string, args: unknown[], base: number, top = topId(state)) {
  let s = state;
  // The browser's counter is its clock; one set far in the future would push every later id out of the safe number range.
  setIdBase(Math.min(Math.max(Math.min(base, Date.now() + 86_400_000), top), Number.MAX_SAFE_INTEGER - 1_000_000));
  const acts = makeActions({ set: (fn) => void (s = { ...s, ...fn(s) }), get: () => s, replace: (x) => void (s = x), fresh: blankState, lastRoll: { current: 0 } });
  const fn = Object.hasOwn(acts, name) ? (acts as unknown as Record<string, unknown>)[name] : undefined;
  if (typeof fn !== "function") throw new Refused("unknown action");
  fn(...args);
  return s;
}

/** What anyone on the internet may see of an institute: its website, batches and published course outline. */
export function publicView(s: LmsState, onlyPublic: boolean): Partial<LmsState> {
  const batches = s.batches.filter((b) => b.public || !onlyPublic);
  const open = new Set(s.batches.filter((b) => b.public).map((b) => b.name));
  const shown = s.modules.filter((m) => m.published && open.has(m.batch));
  const enrolled = s.students.filter((x) => !x.pending);
  return {
    teacherName: s.teacherName,
    instituteName: s.instituteName,
    site: s.site,
    batches,
    // "N students" and the average score are counted here; no student list and nobody's marks go to a public page.
    publicStats: { students: enrolled.length, average: averagePct(shown, enrolled.map((x) => x.id)) },
    students: [],
    modules: shown.map((m) => ({
      ...m,
      items: m.items.map((it) => ({
        id: it.id, kind: it.kind, title: it.title, meta: it.meta, done: false, points: it.points, dueDate: it.dueDate, preview: it.preview,
        url: it.preview ? it.url : undefined, // only free previews are watchable before joining
      })),
    })),
  };
}
