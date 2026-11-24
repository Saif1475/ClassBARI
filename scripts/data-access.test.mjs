// Run: npm test — who may do what with real accounts, and what students/guardians get to see.
import assert from "node:assert/strict";
import { test } from "node:test";
import { afterAnswer, bestStaffRow, checkAction, peopleToSync, Refused, rosterOf, runAction, viewFor } from "../src/lib/data-access.ts";
import { seed } from "../src/lib/mock-data.ts";

const s = seed();
const student = { role: "student", name: "", studentIds: [3] };
const guardian = { role: "guardian", name: "", studentIds: [1, 8] };
const teacher = { role: "teacher", name: "Rumana Ma'am", studentIds: [] };
const refused = (fn) => assert.throws(fn, Refused);

test("a student's view has only their own private data", () => {
  const v = viewFor(s, student);
  assert.equal(v.meId, 3);
  const other = v.students.find((x) => x.id === 2);
  assert.equal(other.phone, "");
  assert.equal(other.guardianEmail, "");
  assert.equal(other.feeDue, 0);
  assert.ok(v.payments.every((p) => p.studentId === 3));
  assert.ok(Object.values(v.attendance).every((absent) => absent.every((id) => id === 3)));
  assert.deepEqual(v.staffPayments, []);
  assert.deepEqual(v.expenses, []);
  assert.deepEqual(v.coupons, []);
  assert.ok(v.staff.every((x) => x.phone === "" && x.salary === 0));
  const quiz = v.modules.flatMap((m) => m.items).find((it) => it.id === 104);
  assert.deepEqual(Object.keys(quiz.answers), ["3"]);
  assert.equal(quiz.done, true); // student 3 took it
  assert.ok(v.modules.every((m) => m.batch === s.students.find((x) => x.id === 3).batch && m.published));
});

test("'done' is per student", () => {
  const next = runAction(s, "toggleItemDone", checkAction("toggleItemDone", [1, 105, 99], student, s), Date.now());
  assert.equal(viewFor(next, student).modules[0].items.find((it) => it.id === 105).done, true);
  assert.equal(viewFor(next, { ...student, studentIds: [4] }).modules[0].items.find((it) => it.id === 105).done, false);
});

test("students act only as themselves", () => {
  assert.deepEqual(checkAction("earnXp", [7, 9999], student, s), [3, 50]);
  const sub = checkAction("submitAssignment", [1, 105, 7, { fileName: "a.jpg", grade: 20, comment: "great" }], student, s);
  assert.deepEqual(sub, [1, 105, 3, { fileName: "a.jpg", file: undefined }]);
  assert.equal(checkAction("submitQuiz", [1, 104, 3, 30, [true], 0], student, s), null); // already took it
  refused(() => checkAction("payFee", [3, "bkash"], student, s));
  refused(() => checkAction("gradeSubmission", [1, 105, 3, 20, ""], student, s));
  refused(() => checkAction("addStudent", [{}], student, s));
  refused(() => checkAction("resetDemoData", [], { role: "owner", name: "", studentIds: [] }, s));
});

test("guardians act only for their own children", () => {
  assert.deepEqual(checkAction("sendParentMessage", [8, "hi"], guardian, s), [8, "hi", undefined]);
  refused(() => checkAction("sendParentMessage", [2, "hi"], guardian, s));
  refused(() => checkAction("payFee", [8, "bkash"], guardian, s));
  refused(() => checkAction("submitQuiz", [1, 104, 1, 30, [], 0], guardian, s));
});

test("teachers can't touch money or staff settings", () => {
  refused(() => checkAction("payStaff", ["Rumana Ma'am", 5000], teacher, s));
  refused(() => checkAction("updateStaffProfile", ["Tanvir Sir", "X", ""], teacher, s));
  assert.ok(checkAction("addAnnouncement", [{ title: "t", body: "b", batch: s.batches.find((b) => b.teacher === teacher.name).name }], teacher, s));
});

test("server ids never clash with existing ones", () => {
  const next = runAction(s, "addNote", ["t", "x", 3], 5); // a tiny base from a tampered browser
  const top = Math.max(...Array.from(JSON.stringify(s).matchAll(/"id":(\d+)/g), (m) => Number(m[1])));
  assert.ok(next.notes[0].id > top);
});

test("the roster lists student and guardian Gmails", () => {
  const r = rosterOf(s);
  assert.ok(r.some((x) => x.role === "guardian" && x.student_id === 8));
  assert.equal(r.filter((x) => x.role === "student").length, s.students.length);
});

test("the public page has no names, contacts, coupons or paid videos", async () => {
  const { publicView } = await import("../src/lib/data-access.ts");
  const v = publicView({ ...s, coupons: [{ code: "SECRET", off: 100, used: 0 }] }, true);
  const text = JSON.stringify(v);
  for (const st of s.students) {
    assert.ok(!text.includes(st.email));
    assert.ok(!text.includes(st.phone));
  }
  assert.ok(!text.includes("SECRET"));
  assert.ok(v.modules.flatMap((m) => m.items).every((it) => it.preview || it.url === undefined));
  assert.ok(v.batches.every((b) => b.public));
  // Nobody's marks or roll number either: only the two totals the page shows.
  assert.deepEqual(v.students, []);
  assert.ok(v.modules.flatMap((m) => m.items).every((it) => it.scores === undefined && it.submissions === undefined));
  assert.equal(v.publicStats.students, s.students.filter((x) => !x.pending).length);
  const { gradedResults } = await import("../src/lib/lms-views.ts");
  const open = new Set(s.batches.filter((b) => b.public).map((b) => b.name));
  const pcts = s.students.flatMap((x) => gradedResults(s.modules.filter((m) => m.published && open.has(m.batch)), x.id).map((r) => r.pct));
  assert.equal(v.publicStats.average, pcts.length ? Math.round(pcts.reduce((a, c) => a + c, 0) / pcts.length) : null);
});

test("quiz answers stay hidden until the student has taken it, and the server does the marking", () => {
  const fresh = { role: "student", name: "", studentIds: [1] }; // student 1 hasn't taken quiz 104
  const quiz = (who) => viewFor(s, who).modules.flatMap((m) => m.items).find((it) => it.id === 104);
  assert.ok(quiz(fresh).questions.every((q) => q.answer === -1));
  assert.ok(quiz(student).questions.some((q) => q.answer >= 0)); // student 3 took it: answers shown for review
  const real = s.modules.flatMap((m) => m.items).find((it) => it.id === 104);
  const right = real.questions.map((q) => q.answer);
  // A made-up score of 999 is ignored: the marks come from the options picked.
  const all = checkAction("submitQuiz", [1, 104, 1, 999, [], 0, right], fresh, s);
  assert.equal(all[3], real.points);
  assert.deepEqual(all[4], right.map(() => true));
  const none = checkAction("submitQuiz", [1, 104, 1, 999, [], 0, right.map(() => null)], fresh, s);
  assert.equal(none[3], 0);
  refused(() => checkAction("submitQuiz", [1, 104, 1, 30, right.map(() => true), 0], fresh, s)); // no picks: nothing to mark
  refused(() => checkAction("submitQuiz", [1, 104, 1, 30, [], 0, [99]], fresh, s));
});

test("names that exist on every object are not actions", () => {
  for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    refused(() => checkAction(name, [], student, s));
    refused(() => checkAction(name, [], guardian, s));
    refused(() => runAction(s, name, [], Date.now()));
  }
});

test("a browser clock set far in the future can't push ids out of range", () => {
  const next = runAction(s, "addNote", ["t", "x", 3], Number.MAX_SAFE_INTEGER - 5);
  assert.ok(next.notes[0].id < Date.now() + 2 * 86_400_000);
});

test("staff changes to the student list are checked on the server too", () => {
  const owner = { role: "owner", name: "", studentIds: [] };
  const ok = { name: "New One", email: "new.one@gmail.com", guardianName: "G One", guardianEmail: "g.one@gmail.com", phone: "01711000001", mode: "offline", batch: s.batches[0].name, feePaid: false };
  assert.ok(checkAction("addStudent", [ok], owner, s));
  refused(() => checkAction("addStudent", [{ ...ok, email: "not-a-gmail@yahoo.com" }], owner, s));
  refused(() => checkAction("addStudent", [{ ...ok, email: s.students[0].email }], owner, s)); // already someone's Gmail
  refused(() => checkAction("addStudent", [null], owner, s));
});

test("a teacher is found by their email, even after renaming themselves", () => {
  const withEmail = { ...s, staff: s.staff.map((x) => (x.name === "Rumana Ma'am" ? { ...x, name: "Rumana Akter", email: "rumana@example.com" } : x)) };
  const t = { role: "teacher", name: "Rumana Ma'am", studentIds: [], email: "rumana@example.com" }; // the sign-in list still has the old name
  assert.equal(viewFor(withEmail, t).teacherLogin, "Rumana Akter");
  assert.ok(checkAction("updateStaffProfile", ["Rumana Akter", "Rumana A.", ""], t, withEmail));
  refused(() => checkAction("updateStaffProfile", ["Tanvir Sir", "X", ""], t, withEmail));
});

test("one student can't flood the community or the leaderboard", () => {
  const now = new Date().toISOString();
  const flooded = { ...s, community: Array.from({ length: 20 }, (_, i) => ({ id: 9000 + i, author: 3, text: "x", at: now, likes: [], comments: [], reports: [] })) };
  refused(() => checkAction("addCommunityPost", [3, "one more"], student, flooded));
  let x = s;
  for (let i = 0; i < 40; i++) x = runAction(x, "earnXp", [3, 50], Date.now());
  assert.equal(x.xp[3][new Date().toISOString().slice(0, 10)] <= 1000, true);
});

test("sign-in rows skip broken email addresses instead of blocking everyone", () => {
  const r = rosterOf({ ...s, students: [{ ...s.students[0], email: "broken", guardianEmail: "ok.parent@gmail.com" }] });
  assert.deepEqual(r.map((x) => x.role), ["guardian"]);
});

test("a student who joins after the due day is not fined that month, but is from the next", async () => {
  const { rollFees, monthKey } = await import("../src/lib/lms-actions.ts");
  const batch = { ...s.batches[0], fee: 1000, lateFine: 100 };
  const input = { name: "Late Joiner", email: "late.joiner@gmail.com", guardianName: "G", guardianEmail: "g.joiner@gmail.com", phone: "01711000002", mode: "offline", batch: batch.name, feePaid: false };
  const added = runAction({ ...s, batches: [batch], students: [], feeMonth: monthKey() }, "addStudent", [input], Date.now());
  assert.equal(added.students[0].joined, monthKey());
  const d = new Date();
  const day20 = new Date(d.getFullYear(), d.getMonth(), 20);
  assert.equal(rollFees(added, day20).students[0].feeDue, 1000); // joined this month: no fine
  const nextMonth20 = new Date(d.getFullYear(), d.getMonth() + 1, 20);
  assert.equal(rollFees(added, nextMonth20).students[0].feeDue, 2100); // next month: the new fee and the fine
});

test("a student gets only their own batch's notices and live-class link", () => {
  const other = "Some Other Batch";
  const x = { ...s, liveClass: { ...s.liveClass, batch: other, link: "https://meet.example/secret" }, announcements: [{ id: 1, title: "theirs", body: "", author: "", batch: other, at: "" }, { id: 2, title: "everyone", body: "", author: "", batch: "all", at: "" }] };
  const v = viewFor(x, student);
  assert.deepEqual(v.announcements.map((a) => a.title), ["everyone"]);
  assert.equal(v.liveClass.link, "");
});

test("a teacher works only in their own batches; the institute sets batches up", () => {
  const mine = s.batches.find((b) => b.teacher === teacher.name);
  const other = s.batches.find((b) => b.teacher !== teacher.name);
  const owner = { role: "owner", name: "", studentIds: [] };
  assert.ok(checkAction("addAnnouncement", [{ title: "t", body: "b", batch: mine.name }], teacher, s));
  refused(() => checkAction("addAnnouncement", [{ title: "t", body: "b", batch: other.name }], teacher, s));
  refused(() => checkAction("addCalendarEvent", [{ title: "t", start: "", meta: "", kind: "exam" }], teacher, s)); // no batch
  const theirStudent = s.students.find((x) => x.batch === other.name);
  refused(() => checkAction("removeStudent", [theirStudent.id], teacher, s));
  refused(() => checkAction("markAllAbsent", [[theirStudent.id]], teacher, s));
  const theirModule = s.modules.find((m) => m.batch === other.name);
  if (theirModule) refused(() => checkAction("deleteModule", [theirModule.id], teacher, s));
  refused(() => checkAction("updateBatch", [mine.id, { teacher: teacher.name, fee: 1 }], teacher, s));
  refused(() => checkAction("addBatch", [{ name: "X" }], teacher, s));
  refused(() => checkAction("updateStaffProfile", [teacher.name, other.teacher, ""], teacher, s)); // a colleague's name
  assert.ok(checkAction("updateBatch", [other.id, { fee: 1 }], owner, s));
  assert.ok(checkAction("addAnnouncement", [{ title: "t", body: "b", batch: other.name }], owner, s));
});

test("calendar events reach only their own batch", () => {
  const x = { ...s, calendarEvents: [{ id: 1, title: "theirs", start: "", meta: "", kind: "exam", batch: "Some Other Batch" }, { id: 2, title: "old", start: "", meta: "", kind: "exam" }] };
  assert.deepEqual(viewFor(x, student).calendarEvents.map((e) => e.title), ["old"]);
});

test("a guardian gets the phone of their child's teacher only", () => {
  const g = viewFor(s, guardian);
  const kidBatches = new Set(s.students.filter((x) => guardian.studentIds.includes(x.id)).map((x) => x.batch));
  const theirs = new Set(s.batches.filter((b) => kidBatches.has(b.name)).map((b) => b.teacher));
  for (const x of g.staff) assert.equal(!!x.phone, theirs.has(x.name) && !!s.staff.find((y) => y.name === x.name).phone);
  assert.ok(viewFor(s, student).staff.every((x) => !x.phone));
});

test("sign-up keeps the institute's name and the batch's subject", () => {
  const next = runAction({ ...s, instituteName: "" }, "signUpTeacher", [{ institute: " Ideal Coaching ", name: "New Owner", phone: "01711000009", batch: "B1", days: "Sat", classDays: [6], subject: "Physics", fee: 500 }], Date.now());
  assert.equal(next.instituteName, "Ideal Coaching");
  assert.equal(next.batches[0].subject, "Physics");
});

test("community privacy: friends-only and batch posts, blocks and request settings hold on the server", () => {
  const me = 3, other = 2;
  const myBatch = s.students.find((x) => x.id === me).batch;
  const x = {
    ...s,
    community: [
      { id: 900, author: other, text: "friends only", at: new Date().toISOString(), likes: [], comments: [], reports: [], audience: "friends" },
      { id: 901, author: other, text: "my batch", at: new Date().toISOString(), likes: [], comments: [], reports: [], audience: "batch", batch: "Some Other Batch" },
      { id: 902, author: other, text: "for all", at: new Date().toISOString(), likes: [], comments: [], reports: [], audience: "all", poll: { options: ["a", "b"], votes: { 1: 0, 5: 1 } } },
    ],
    friendships: [],
    communityProfiles: { [other]: { requests: "none", muted: [7], bio: "hi" } },
  };
  const v = viewFor(x, { role: "student", name: "", studentIds: [me] });
  assert.deepEqual(v.community.map((p) => p.text), ["for all"]); // not a friend, not their batch
  assert.deepEqual(v.community[0].poll.votes, {}); // who voted what stays private
  assert.deepEqual(v.community[0].poll.counts, [1, 1]);
  assert.deepEqual(v.communityProfiles[other], { bio: "hi", hidden: undefined, requests: "none" }); // not their mute list
  refused(() => checkAction("toggleLike", [900, me], { role: "student", name: "", studentIds: [me] }, x)); // can't act on a post they can't see
  refused(() => checkAction("requestFriend", [me, other], { role: "student", name: "", studentIds: [me] }, x)); // they take no requests
  assert.ok(checkAction("votePoll", [902, me, 1], { role: "student", name: "", studentIds: [me] }, x));
  refused(() => checkAction("votePoll", [902, me, 5], { role: "student", name: "", studentIds: [me] }, x));
  // Blocking: the blocked student no longer sees the blocker's posts, and friendship ends.
  const friends = { ...x, friendships: [{ from: me, to: other, status: "friends" }] };
  const blocked = runAction(friends, "setCommunityProfile", [other, { blocked: [me] }], Date.now());
  assert.equal(blocked.friendships.length, 0);
  assert.equal(viewFor(blocked, { role: "student", name: "", studentIds: [me] }).community.length, 0);
  assert.ok(myBatch);
});

test("community uploads are photos or PDFs only, never links to other sites", () => {
  const me = { role: "student", name: "", studentIds: [3] };
  const png = "data:image/png;base64,AAAA";
  assert.ok(checkAction("addCommunityPost", [3, "hi", undefined, { images: [png, png], file: { name: "n.pdf", url: "data:application/pdf;base64,AAAA" }, poll: ["a", "b"], audience: "batch" }], me, s));
  refused(() => checkAction("addCommunityPost", [3, "hi", "https://tracker.example/pixel.png"], me, s));
  refused(() => checkAction("addCommunityPost", [3, "hi", undefined, { file: { name: "x", url: "data:text/html;base64,AAAA" } }], me, s));
  refused(() => checkAction("addCommunityPost", [3, "hi", undefined, { images: [png, png, png, png, png] }], me, s));
  refused(() => checkAction("addCommunityPost", [3, "hi", undefined, { poll: ["only one"] }], me, s));
  refused(() => checkAction("addCommunityPost", [3, "hi", undefined, { audience: "public internet" }], me, s));
});

test("a teacher gets only their own batches: no other families, no institute money, no colleague's pay", () => {
  const me = "Rumana Ma'am";
  const mineB = new Set(s.batches.filter((b) => b.teacher === me).map((b) => b.name));
  assert.ok(mineB.size > 0 && mineB.size < s.batches.length);
  const x = { ...s, expenses: [{ id: 1, date: "2026-11-01", category: "rent", amount: 5000, note: "" }], staff: s.staff.map((st) => ({ ...st, salary: 9000 })), notes: [{ id: 1, title: "t", text: "private", at: "", by: 3 }] };
  const v = viewFor(x, teacher);
  assert.deepEqual(v.batches.map((b) => b.name).sort(), [...mineB].sort());
  const other = v.students.find((st) => !mineB.has(st.batch));
  assert.deepEqual([other.phone, other.email, other.guardianEmail, other.feeDue], ["", "", "", 0]);
  const own = v.students.find((st) => mineB.has(st.batch));
  assert.ok(own.phone && own.guardianEmail);
  const ownIds = new Set(v.students.filter((st) => mineB.has(st.batch)).map((st) => st.id));
  assert.ok(v.payments.every((p) => ownIds.has(p.studentId)));
  assert.ok(v.modules.every((m) => mineB.has(m.batch)));
  assert.deepEqual(v.expenses, []);
  assert.ok(v.staff.every((st) => st.name === me ? st.salary === 9000 : st.salary === 0 && st.phone === ""));
  assert.deepEqual(v.notes, []); // a student's private notes
  assert.ok(v.community.filter((p) => p.poll).every((p) => Object.keys(p.poll.votes).length === 0));
  refused(() => checkAction("addExpense", [{ date: "", category: "", amount: 1, note: "" }], teacher, s));
  refused(() => checkAction("decideOrder", [1, true], teacher, s));
});

test("students and guardians get only their own marks and XP, plus their rank", () => {
  const mod = s.modules.find((m) => m.published && m.batch === s.students.find((x) => x.id === 3).batch);
  const quiz = { id: 7001, kind: "quiz", title: "Rank quiz", meta: "", done: false, points: 10, questions: [{ q: "q", options: ["a", "b"], answer: 0 }], scores: { 1: 9, 3: 7, 5: 7, 6: 2 } };
  const x = { ...s, modules: s.modules.map((m) => (m.id === mod.id ? { ...m, items: [...m.items, quiz] } : m)), xp: { 1: { [new Date().toISOString().slice(0, 10)]: 50 }, 3: { [new Date().toISOString().slice(0, 10)]: 20 } } };
  const v = viewFor(x, student);
  const it = v.modules.flatMap((m) => m.items).find((i) => i.id === 7001);
  assert.deepEqual(it.scores, { 3: 7 }); // nobody else's marks
  assert.deepEqual(it.ranks, { 3: { rank: 2, of: 4 } }); // joint second of four
  assert.deepEqual(Object.keys(v.xp), ["3"]);
  assert.ok(v.leagueRank[3].rank >= 1 && v.leagueRank[3].of >= 1);
  assert.ok(!JSON.stringify(v.modules).includes('"1":9')); // the top scorer's mark is nowhere in what they receive
  const g = viewFor(x, guardian);
  assert.deepEqual(Object.keys(g.xp).sort(), guardian.studentIds.filter((id) => x.xp[id]).map(String).sort());
});

test("someone who joined from a link waits: no sign-in, not shown to classmates, until staff accept them", () => {
  const owner = { role: "owner", name: "", studentIds: [] };
  const input = { name: "Link Joiner", email: "link.joiner@gmail.com", guardianName: "G", guardianEmail: "g.link@gmail.com", phone: "01711000033", mode: "online", batch: s.batches[0].name, feePaid: false, pending: true };
  const added = runAction(s, "addStudent", [input], Date.now());
  const st = added.students.find((x) => x.name === "Link Joiner");
  assert.equal(st.pending, true);
  assert.ok(!rosterOf(added).some((r) => r.email === "link.joiner@gmail.com" || r.email === "g.link@gmail.com"));
  assert.ok(!viewFor(added, student).students.some((x) => x.name === "Link Joiner"));
  assert.ok(viewFor(added, owner).students.some((x) => x.name === "Link Joiner"));
  const ok = runAction(added, "approveStudent", [st.id], Date.now());
  assert.ok(rosterOf(ok).some((r) => r.email === "link.joiner@gmail.com"));
});

test("staff can't push huge text into the institute's data; owners aren't sent poll votes or block lists", () => {
  const owner = { role: "owner", name: "", studentIds: [] };
  refused(() => checkAction("addAnnouncement", [{ title: "t", body: "x".repeat(400_000), batch: s.batches[0].name }], owner, s));
  assert.ok(checkAction("addAnnouncement", [{ title: "t", body: "x".repeat(5_000), batch: s.batches[0].name }], owner, s));
  assert.ok(checkAction("setStudentPhoto", [1, `data:image/jpeg;base64,${"A".repeat(900_000)}`], owner, s)); // an upload is not text
  const x = { ...s, community: [{ id: 1, author: 2, text: "p", at: "", likes: [], comments: [], reports: [], poll: { options: ["a", "b"], votes: { 2: 0, 3: 1 } } }], communityProfiles: { 2: { bio: "hi", blocked: [3], muted: [4] } } };
  const v = viewFor(x, owner);
  assert.deepEqual(v.community[0].poll.votes, {});
  assert.deepEqual(v.community[0].poll.counts, [1, 1]);
  assert.deepEqual(v.communityProfiles[2], { bio: "hi" });
});

test("unkind words: a reply, an edit or a bio with them is refused by the server", () => {
  const me = { role: "student", name: "", studentIds: [3] };
  const post = s.community.find((p) => p.author === 3);
  refused(() => checkAction("addComment", [post.id, 3, "you are a bitch"], me, s));
  assert.ok(checkAction("addComment", [post.id, 3, "Page 142, exercise 3"], me, s));
  refused(() => checkAction("editPost", [post.id, "তুই একটা হারামি"], me, s));
  assert.ok(checkAction("editPost", [post.id, "Found it, thanks!"], me, s));
  refused(() => checkAction("setCommunityProfile", [3, { bio: "f*ck school" }], me, s));
  assert.ok(checkAction("setCommunityProfile", [3, { bio: "HSC 2027, science" }], me, s));
  // A student can't mark their own post as "not held": the server decides.
  const sent = checkAction("addCommunityPost", [3, "hello", undefined, { held: false, audience: "all" }], me, s);
  assert.equal("held" in sent[3], false);
});

test("the server measures how long a quiz really took", async () => {
  const { overTime, quizMinutes } = await import("../src/lib/quiz.ts");
  const mod = s.modules.find((m) => m.published && m.batch === s.students.find((x) => x.id === 3).batch);
  const quiz = { id: 7100, kind: "quiz", title: "Timed", meta: "", done: false, points: 2, timeLimitMin: 5, questions: [{ q: "a", options: ["x", "y"], answer: 0 }, { q: "b", options: ["x", "y"], answer: 1 }] };
  const base = { ...s, modules: s.modules.map((m) => (m.id === mod.id ? { ...m, items: [...m.items, quiz] } : m)) };
  // No Start recorded: flagged as unknown.
  assert.equal(checkAction("submitQuiz", [mod.id, 7100, 3, 99, [], 0, [0, 1]], student, base)[7], -1);
  // Started 20 minutes ago on the server's record: the real time is kept whatever the browser says.
  const started = { ...base, modules: base.modules.map((m) => ({ ...m, items: m.items.map((it) => (it.id === 7100 ? { ...it, started: { 3: new Date(Date.now() - 20 * 60_000).toISOString() } } : it)) })) };
  const args = checkAction("submitQuiz", [mod.id, 7100, 3, 99, [], 0, [0, 1]], student, started);
  assert.ok(args[7] >= 1199 && args[7] <= 1205);
  const done = runAction(started, "submitQuiz", args, Date.now());
  const it = done.modules.flatMap((m) => m.items).find((i) => i.id === 7100);
  assert.equal(overTime(it, it.took[3]), 20); // 20 minutes against a 5-minute limit
  assert.equal(overTime(it, 5 * 60 + 30), null); // inside the minute of grace
  assert.equal(overTime(it, -1), "unknown");
  assert.equal(quizMinutes({ questions: [1, 2, 3] }), 3);
  // Pressing Start twice doesn't reset the clock; a student can't start someone else's.
  const again = runAction(started, "startQuiz", checkAction("startQuiz", [mod.id, 7100, 99], student, started), Date.now());
  assert.equal(again.modules.flatMap((m) => m.items).find((i) => i.id === 7100).started[3], started.modules.flatMap((m) => m.items).find((i) => i.id === 7100).started[3]);
  assert.deepEqual(Object.keys(viewFor(done, student).modules.flatMap((m) => m.items).find((i) => i.id === 7100).took), ["3"]);
});

test("a student's chat with their teacher is private: not the owner, not guardians, not other teachers", () => {
  const owner = { role: "owner", name: "Owner", studentIds: [] };
  const mineBatch = s.students.find((x) => x.id === 3).batch;
  const myTeacher = { role: "teacher", name: s.batches.find((b) => b.name === mineBatch).teacher, studentIds: [] };
  const other = s.batches.find((b) => b.teacher !== myTeacher.name && b.teacher !== owner.name);
  const otherTeacher = { role: "teacher", name: other.teacher, studentIds: [] };
  assert.deepEqual(checkAction("sendStudentMessage", [99, "Sir, a question"], student, s), [3, "Sir, a question", undefined]); // always as themselves
  const next = runAction(s, "sendStudentMessage", [3, "Sir, a question"], Date.now());
  assert.ok(viewFor(next, student).chats.some((c) => c.id === "student-3"));
  assert.ok(viewFor(next, myTeacher).chats.some((c) => c.id === "student-3"));
  assert.ok(!viewFor(next, otherTeacher).chats.some((c) => c.id === "student-3"));
  assert.ok(!viewFor(next, owner).chats.some((c) => c.id === "student-3"));
  assert.ok(!viewFor(next, { ...guardian, studentIds: [3] }).chats.some((c) => c.id === "student-3"));
  assert.ok(checkAction("sendChatMessage", ["student-3", myTeacher.name, "Yes?", false], myTeacher, next));
  refused(() => checkAction("sendChatMessage", ["student-3", otherTeacher.name, "hi", false], otherTeacher, next));
  refused(() => checkAction("sendChatMessage", ["student-3", "Owner", "hi", false], owner, next));
  refused(() => checkAction("sendChatMessage", ["parent-3", otherTeacher.name, "hi", false], otherTeacher, next)); // nor another batch's guardians
  // The owner making themselves the batch's teacher gets the thread from then on, not the messages with the teacher before.
  const batchId = s.batches.find((b) => b.name === mineBatch).id;
  const taken = runAction(next, "updateBatch", [batchId, { teacher: owner.name }], Date.now());
  const old = taken.chats.find((c) => c.id === "student-3").messages.at(-1);
  assert.equal(viewFor(taken, owner).chats.find((c) => c.id === "student-3")?.messages.length ?? 0, 0);
  assert.equal(viewFor(taken, owner).chats.find((c) => c.id === "student-3")?.unread ?? 0, 0);
  refused(() => checkAction("reactChatMessage", ["student-3", old.id, "staff", "👍"], owner, taken));
  const later = runAction(taken, "sendStudentMessage", [3, "Sir, another"], Date.now());
  assert.deepEqual(viewFor(later, owner).chats.find((c) => c.id === "student-3").messages.map((m) => m.text), ["Sir, another"]);
  assert.equal(viewFor(later, student).chats.find((c) => c.id === "student-3").messages.length, 2); // the student keeps the whole thread
  const reply = runAction(later, "sendChatMessage", checkAction("sendChatMessage", ["student-3", "", "Yes?", false], owner, later), Date.now());
  assert.equal(viewFor(reply, owner).chats.find((c) => c.id === "student-3").messages.length, 2);
});

test("edge cases found in the audit stay closed", async () => {
  const { checkPayment, packUntil } = await import("../src/lib/pay.ts");
  const owner = { role: "owner", name: "Owner", studentIds: [] };
  const other = s.batches.find((b) => b.teacher !== teacher.name);
  const otherStudent = s.students.find((x) => x.batch === other.name);
  const otherModule = s.modules.find((m) => m.batch === other.name);
  // Files must be real photos/PDFs, not text that stays in the institute's record.
  refused(() => checkAction("askDoubt", [0, 0, "q", "x".repeat(1000)], student, s));
  refused(() => checkAction("submitAssignment", [1, 105, 3, { fileName: "a", file: "https://evil.example/a.png" }], student, s));
  assert.ok(checkAction("askDoubt", [0, 0, "q", "data:image/png;base64,AAAA"], student, s));
  // Staff can't act as a student or guardian, or outside their batches.
  for (const [n, a] of [["sendStudentMessage", [otherStudent.id, "hi"]], ["earnXp", [otherStudent.id, 50]], ["toggleLike", [1, otherStudent.id]], ["setCommunityProfile", [otherStudent.id, {}]], ["requestFriend", [1, 2]]])
    refused(() => checkAction(n, a, teacher, s)), refused(() => checkAction(n, a, owner, s));
  refused(() => checkAction("submitQuiz", [otherModule.id, otherModule.items[0]?.id, otherStudent.id, 999, [], 0], teacher, s));
  refused(() => checkAction("addCommunityPost", [otherStudent.id, "hi"], teacher, s));
  assert.ok(checkAction("addCommunityPost", ["teacher", "hi"], teacher, s));
  // Staff can't rewrite or delete a student's post (hiding it stays allowed), only the teacher's own.
  const posts = { ...s, community: [{ id: 901, author: otherStudent.id, text: "mine", at: "", likes: [], comments: [], reports: [] }, { id: 902, author: "teacher", text: "notice", at: "", likes: [], comments: [], reports: [] }] };
  for (const who of [teacher, owner]) refused(() => checkAction("editPost", [901, "new words"], who, posts)), refused(() => checkAction("deletePost", [901], who, posts));
  assert.ok(checkAction("editPost", [902, "updated notice"], teacher, posts));
  assert.ok(checkAction("deletePost", [902], owner, posts));
  assert.ok(checkAction("moderatePost", [901, { hidden: true }], owner, posts));
  refused(() => checkAction("requestLeave", [{ name: other.teacher, from: "2026-01-01", to: "2026-01-02", reason: "x" }], teacher, s));
  // Money and dates.
  refused(() => checkAction("payFee", [3, "cash", "abc"], owner, s));
  refused(() => checkAction("toggleAttendance", [3, "2099-01-01"], owner, s));
  assert.equal(checkPayment({ kind: "plan", item: "constructor", months: 1, method: "bkash", sender: "01711000000", trxId: "ABCD1234" }, {}).error, "bad item");
  assert.equal(checkPayment({ kind: "ai_pack", item: "0x96", months: 1, method: "bkash", sender: "01711000000", trxId: "ABCD1234" }).error, "bad item");
  assert.equal(packUntil(undefined, "2026-01-31", 1), "2026-02-28");
  // Owners don't see students' private notes.
  const withNote = runAction(s, "addNote", ["t", "secret", 3], Date.now());
  assert.ok(!viewFor(withNote, owner).notes.some((n) => n.by === 3));
});

test("website bug hunt: batch names, event times, discounts and poll options are checked on the server", async () => {
  const { validateStudent, isGmail } = await import("../src/lib/site.ts");
  const owner = { role: "owner", name: "Owner", studentIds: [] };
  refused(() => checkAction("addBatch", [{ name: ` ${s.batches[0].name.toUpperCase()} `, fee: 100 }], owner, s));
  assert.ok(checkAction("addBatch", [{ name: "A brand new batch", fee: 100 }], owner, s));
  refused(() => checkAction("addCalendarEvent", [{ title: "x", start: "2026-12-01T15:00:00.000Z", end: "2026-12-01T10:00:00.000Z", batch: s.batches[0].name }], owner, s));
  const st = s.students[0], fee = s.batches.find((b) => b.name === st.batch).fee;
  refused(() => checkAction("setDiscount", [st.id, fee + 1], owner, s));
  assert.ok(checkAction("setDiscount", [st.id, fee], owner, s));
  refused(() => checkAction("addCommunityPost", [0, "q", undefined, { poll: ["Same", " same "] }], student, s));
  // Gmail: dots and +tags reach the same inbox; ".." is not a Gmail address.
  const roll = [{ id: 1, email: "nusrat.jahan@gmail.com", guardianEmail: "g@gmail.com" }];
  const p = { name: "N", email: "nusratjahan+x@gmail.com", guardianName: "G", guardianEmail: "h@gmail.com", phone: "01712345678" };
  assert.equal(validateStudent(p, roll).email, "emailTaken");
  assert.equal(isGmail("a..b@gmail.com"), false);
});

test("messages: replies, photos, edits, delete for everyone, reactions and read ticks, each side only its own", async () => {
  const { seen, unreadFor, canEdit } = await import("../src/lib/chat.ts");
  const mineBatch = s.students.find((x) => x.id === 3).batch;
  const myTeacher = { role: "teacher", name: s.batches.find((b) => b.name === mineBatch).teacher, studentIds: [] };
  const run = (st, who, name, args) => runAction(st, name, checkAction(name, args, who, st), Date.now());
  let st = run(s, student, "sendStudentMessage", [3, "Sir, question 5?"]);
  const q = st.chats.find((c) => c.id === "student-3").messages.at(-1);
  // The teacher answers it, quoting it; the name is always the teacher's own, whatever the app sends.
  st = run(st, myTeacher, "sendChatMessage", ["student-3", "Someone Else", "Use F = -kx", true, { reply: q.id }]);
  let t = st.chats.find((c) => c.id === "student-3");
  const a = t.messages.at(-1);
  assert.equal(a.sender, myTeacher.name);
  assert.equal(a.mine, false);
  assert.equal(a.reply, q.id);
  refused(() => checkAction("sendChatMessage", ["student-3", "", "hi", false, { reply: 424242 }], myTeacher, st)); // no such message
  refused(() => checkAction("sendStudentMessage", [3, "   "], student, st)); // empty
  refused(() => checkAction("sendStudentMessage", [3, "", { photo: "data:text/html;base64,AAAA" }], student, st)); // not a photo
  assert.ok(checkAction("sendStudentMessage", [3, "", { photo: "data:image/png;base64,AAAA" }], student, st)); // a photo alone is fine

  // Ticks: grey until the student opens the chat, then blue; the teacher's unread count is untouched by the student.
  assert.equal(seen(t, a), false);
  assert.equal(unreadFor(t, "family"), 1);
  st = run(st, student, "markChatRead", ["student-3", "staff", true]); // the side is always the student's own
  t = st.chats.find((c) => c.id === "student-3");
  assert.equal(seen(t, a), true);
  assert.equal(unreadFor(t, "family"), 0);
  assert.equal(t.unread, 1);
  assert.equal(checkAction("markChatRead", ["student-3", "family", false], student, st), null); // read receipts off: nothing sent
  refused(() => checkAction("markChatRead", ["student-4", "family", true], student, st));

  // Edit and delete: only your own messages, within the time limits.
  st = run(st, student, "editChatMessage", ["student-3", q.id, "Sir, question 6?"]);
  t = st.chats.find((c) => c.id === "student-3");
  assert.deepEqual([t.messages.find((m) => m.id === q.id).text, t.messages.find((m) => m.id === q.id).edited], ["Sir, question 6?", true]);
  refused(() => checkAction("editChatMessage", ["student-3", a.id, "changed"], student, st)); // the teacher's message
  refused(() => checkAction("deleteChatMessage", ["student-3", q.id], myTeacher, st)); // the student's message
  assert.equal(canEdit({ ...q, at: new Date(Date.now() - 16 * 60_000).toISOString() }), false);
  st = run(st, myTeacher, "deleteChatMessage", ["student-3", a.id]);
  const gone = st.chats.find((c) => c.id === "student-3").messages.find((m) => m.id === a.id);
  assert.deepEqual([gone.deleted, gone.text, gone.reply], [true, "", undefined]);
  refused(() => checkAction("reactChatMessage", ["student-3", a.id, "family", "👍"], student, st)); // deleted

  // Reactions: one per side, from the fixed list; sending none takes it away.
  st = run(st, myTeacher, "reactChatMessage", ["student-3", q.id, "family", "❤️"]); // stored as the teacher's side
  assert.deepEqual(st.chats.find((c) => c.id === "student-3").messages.find((m) => m.id === q.id).react, { staff: "❤️" });
  refused(() => checkAction("reactChatMessage", ["student-3", q.id, "family", "💩"], student, st));
  st = run(st, myTeacher, "reactChatMessage", ["student-3", q.id, "staff", null]);
  assert.equal(st.chats.find((c) => c.id === "student-3").messages.find((m) => m.id === q.id).react, undefined);
  // A guardian can't touch the student's private chat.
  refused(() => checkAction("reactChatMessage", ["student-3", q.id, "family", "👍"], { ...guardian, studentIds: [3] }, st));
});

test("a removed student's roll number is never given to a newcomer, who would see what that student left behind", async () => {
  const { blankState } = await import("../src/lib/lms-actions.ts");
  const owner = { role: "owner", name: "", studentIds: [] };
  const input = (n) => ({ name: `New ${n}`, email: `new.${n}@gmail.com`, guardianName: "G", guardianEmail: `g.new.${n}@gmail.com`, phone: "01711000044", mode: "offline", batch: s.batches[0].name, feePaid: false });
  const add = (st, n) => runAction(st, "addStudent", [input(n)], Date.now());
  const idOf = (st, n) => st.students.find((x) => x.name === `New ${n}`).id;
  const top = Math.max(...s.students.map((x) => x.id));
  assert.ok(s.payments.some((p) => p.studentId === top)); // the newest student has paid, so something of theirs stays behind

  // The newest student writes privately to their teacher and is removed; the next student gets a new number and none of it.
  let st = runAction(s, "sendStudentMessage", [top, "Sir, a private question"], Date.now());
  st = add(runAction(st, "removeStudent", [top], Date.now()), 1);
  assert.equal(idOf(st, 1), top + 1);
  const seen = viewFor(st, { role: "student", name: "", studentIds: [idOf(st, 1)] });
  assert.deepEqual([seen.chats, seen.payments], [[], []]);
  assert.equal(st.nextStudentId, top + 2);
  // Staff are sent the counter (the owner's backup file is made from what they are sent).
  assert.deepEqual([viewFor(st, owner).nextStudentId, viewFor(st, teacher).nextStudentId], [top + 2, top + 2]);

  // Data saved before the counter was kept, the newest student already gone: counted from what they left behind.
  const old = { ...s, nextStudentId: undefined, students: s.students.filter((x) => x.id !== top) };
  assert.equal(idOf(add(old, 2), 2), top + 1);

  // An order confirmed after a removal makes its student the same way.
  st = runAction(st, "placeOrder", [{ batchId: s.batches[0].id, student: input(3), price: 0, trxId: "TRX123" }], Date.now());
  st = runAction(runAction(st, "removeStudent", [idOf(st, 1)], Date.now()), "decideOrder", [st.orders[0].id, true], Date.now());
  assert.equal(idOf(st, 3), top + 2);

  // Restoring an older backup doesn't take the counter back; a backup from before the counter is counted afresh.
  const backup = (data) => JSON.stringify({ app: "Instanton Campus", version: 1, data });
  st = add(runAction(st, "importBackup", [backup(viewFor(s, owner))], Date.now()), 4);
  assert.equal(idOf(st, 4), top + 3);
  assert.equal(idOf(add(runAction(blankState(), "importBackup", [backup(viewFor(old, owner))], Date.now()), 5), 5), top + 1);

  // A new institute starts at 1 and never goes back.
  st = add(blankState(), 6);
  assert.equal(idOf(st, 6), 1);
  assert.equal(idOf(add(runAction(st, "removeStudent", [1], Date.now()), 7), 7), 2);
});

test("a lesson of the wrong shape is refused; one already saved doesn't stop its batch's data loading", () => {
  const owner = { role: "owner", name: "", studentIds: [] };
  const mod = viewFor(s, student).modules[0]; // a published chapter of student 3's batch
  const add = (item) => checkAction("addModuleItem", [mod.id, item], owner, s);
  // What the teachers' screens send is kept as it is.
  const quiz = { kind: "quiz", title: "Waves", meta: "", points: 50, dueDate: "2026-12-01", questions: [{ q: "v = ?", topic: "Speed", options: ["f/λ", "fλ"], answer: 1 }], negative: 0.25, shuffle: true, timeLimitMin: 10, passPct: 40, antiCheat: true, rubric: [{ name: "Method", max: 5 }], paper: "data:application/pdf;base64,AAAA", paperName: "p.pdf", publishToExplore: false, free: true };
  assert.deepEqual(add(quiz), [mod.id, quiz]);
  const notes = { kind: "pdf", title: "Notes", meta: "2 pages", url: "https://example.com/a.pdf" };
  assert.deepEqual(add(notes), [mod.id, notes]);
  // Its id, marks and who finished it are the server's, never the sender's.
  assert.deepEqual(add({ kind: "task", title: "t", meta: "", id: 104, doneBy: 5, scores: { 3: 99 } })[1], { kind: "task", title: "t", meta: "" });
  const q = (x) => ({ questions: [{ q: "q", options: ["a", "b"], answer: 0, ...x }] });
  for (const bad of [{ questions: {} }, { questions: [null] }, q({ options: "ab" }), q({ answer: 2 }), q({ answer: 0.5 }), q({ options: ["a", 1] }), q({ q: 1 }), q({ topic: {} }), { title: 5 }, { title: "x".repeat(1001) }, { meta: undefined }, { kind: "virus" }, { points: "30" }, { dueDate: "soon" }, { url: {} }, { rubric: "x" }, { shuffle: "yes" }])
    refused(() => add({ kind: "quiz", title: "x", meta: "", ...bad }));
  refused(() => add(null));
  // A video put into a chapter becomes a lesson: the same rules.
  const video = { title: "v", subject: "Physics", level: "HSC", length: "45:00", free: true, moduleId: mod.id };
  assert.deepEqual(checkAction("addExploreVideo", [video], owner, s), [video]);
  refused(() => checkAction("addExploreVideo", [{ ...video, length: {} }], owner, s));
  // One saved before this was checked: the batch's students and guardians still get their data, that lesson without questions.
  const broken = { ...s, modules: s.modules.map((m) => (m.id === mod.id ? { ...m, items: [...m.items, { id: 7900, kind: "quiz", title: "x", meta: "", done: false, questions: {}, doneBy: 5 }] } : m)) };
  for (const who of [student, { ...guardian, studentIds: [3] }]) {
    const it = viewFor(broken, who).modules.flatMap((m) => m.items).find((x) => x.id === 7900);
    assert.equal(it.questions, undefined);
    assert.equal(it.done, false);
  }
  // A good one still goes all the way: saved, and sent to the student without the right answers.
  const next = runAction(s, "addModuleItem", add(quiz), Date.now());
  assert.deepEqual(viewFor(next, student).modules.flatMap((m) => m.items).find((x) => x.title === "Waves").questions, [{ ...quiz.questions[0], answer: -1 }]);
});

test("the server's own values (id, author, time) can't be chosen by the sender", () => {
  const sent = { batch: "SSC Higher Math", title: "Hi", body: "x", author: "Someone Else", id: 3, at: "2000-01-01T00:00:00.000Z" };
  const batch = s.batches.find((b) => b.teacher === teacher.name).name;
  const next = runAction(s, "addAnnouncement", checkAction("addAnnouncement", [{ ...sent, batch }], teacher, s), Date.now());
  const a = next.announcements[0];
  assert.equal(a.title, "Hi");
  assert.equal(a.author, s.teacherName);
  assert.notEqual(a.id, 3);
  assert.notEqual(a.at, sent.at);
  const ev = runAction(s, "addCalendarEvent", [{ title: "Exam", start: "2026-12-01T10:00", id: 3 }], Date.now()).calendarEvents.at(-1);
  assert.notEqual(ev.id, 3);
});

test("a refused change drops only itself; a change not sent yet stays queued", () => {
  assert.deepEqual([200, 400, 403, 413, 401, 429, 500].map((c) => afterAnswer(c, 1)), ["sent", "drop", "drop", "drop", "wait", "wait", "wait"]);
  assert.equal(afterAnswer(503, 5), "drop"); // busy five times in a row: given up, so the rest can still go
});

test("a new batch fee reaches students with a discount, and leaves two months' arrears alone", () => {
  const b = { ...s.batches[0], fee: 500 };
  const st = (id, feeDue, discount) => ({ ...s.students[0], id, batch: b.name, feeDue, discount });
  const start = { ...s, batches: [b, ...s.batches.slice(1)], students: [st(1, 400, 100), st(2, 500, 250), st(3, 500), st(4, 200)] };
  const next = runAction(start, "updateBatch", [b.id, { fee: 600 }], Date.now());
  assert.deepEqual(next.students.map((x) => x.feeDue), [500, 500, 600, 200]);
});

test("sign-in lists: no work when nothing changed, a removed teacher is noticed, and a failed earlier write is retried", () => {
  const none = { roster: false, teachers: false };
  assert.deepEqual(peopleToSync(s, s, false), none);
  const t = s.staff.find((x) => x.name !== s.teacherName);
  const withMail = { ...s, staff: s.staff.map((x) => (x === t ? { ...x, email: "t@example.com" } : x)) };
  const removed = { ...withMail, staff: withMail.staff.filter((x) => x.name !== t.name) };
  assert.deepEqual(peopleToSync(withMail, removed, false), { roster: false, teachers: true });
  // The removal's write failed: the next save (which changes nobody) must still write both lists.
  assert.deepEqual(peopleToSync(removed, removed, true), { roster: true, teachers: true });
});

test("with no institute picked, the owner's institute opens before one they teach at", () => {
  const b = { institute_id: "b", role: "teacher" }, a = { institute_id: "a", role: "owner" }, m = { institute_id: "c", role: "manager" };
  assert.equal(bestStaffRow([b, m, a]), a);
  assert.equal(bestStaffRow([b, m]), m);
  assert.equal(bestStaffRow([{ institute_id: "z", role: "teacher" }, b]), b); // equal ranks: the same one every time
  assert.equal(bestStaffRow([]), undefined);
});
