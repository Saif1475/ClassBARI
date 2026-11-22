// Run: npm test — who gets which notification after an action, and the timed ones.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runAction } from "../src/lib/data-access.ts";
import { seed } from "../src/lib/mock-data.ts";
import { dhaka, notesFor, timedNotes } from "../src/lib/notify.ts";
import en from "../src/lib/i18n/en.ts";
import bn from "../src/lib/i18n/bn.ts";

const s = seed();
const after = (name, args) => runAction(s, name, args, Date.now());
const notes = (name, args, staff = true) => notesFor(name, args, s, after(name, args), staff);
const mod = s.modules.find((m) => m.published);
const batchIds = s.students.filter((x) => !x.pending && x.batch === mod.batch).map((x) => x.id);

test("new homework reaches only that batch's students; a new video sends nothing", () => {
  const { now } = notes("addModuleItem", [mod.id, { kind: "task", title: "Draw a graph", meta: "", dueDate: "2026-11-25" }]);
  assert.equal(now.length, 1);
  assert.deepEqual(now[0].to, { students: batchIds });
  assert.deepEqual(now[0].text, ["new_task", "Draw a graph", "2026-11-25"]);
  assert.equal(now[0].screen, "todo");
  assert.equal(notes("addModuleItem", [mod.id, { kind: "video", title: "Watch", meta: "" }]).now.length, 0);
});

test("a notice reaches the batch's students and guardians; an absence waits 15 minutes for the guardian only", () => {
  const n = notes("addAnnouncement", [{ title: "No class Friday", body: "Holiday", batch: mod.batch }]).now[0];
  assert.deepEqual(n.to, { students: batchIds, guardians: batchIds });
  const id = batchIds[0];
  const { now, later } = notes("toggleAttendance", [id, "2026-11-22"]);
  assert.equal(now.length, 0);
  assert.equal(later.length, 1);
  assert.deepEqual(later[0].note.to, { guardians: [id] });
  assert.equal(later[0].afterMin, 15);
  assert.deepEqual(later[0].still.absent, ["2026-11-22", id]);
});

test("marks go to that student and their guardian only, never to classmates", () => {
  const item = s.modules.flatMap((m) => m.items.map((it) => ({ m, it }))).find(({ it }) => it.submissions && Object.keys(it.submissions).length);
  const sid = Number(Object.keys(item.it.submissions)[0]);
  const n = notes("gradeSubmission", [item.m.id, item.it.id, sid, 8, "Good"]).now[0];
  assert.deepEqual(n.to, { students: [sid], guardians: [sid] });
  assert.equal(n.group, "results");
});

test("messages: a teacher's reply reaches the guardian; a guardian's message reaches the batch's teacher", () => {
  const child = s.students[0];
  const teacher = s.batches.find((b) => b.name === child.batch).teacher;
  assert.deepEqual(notes("sendParentMessage", [child.id, "Hello"], false).now[0].to, { staff: [teacher] });
  assert.equal(notes("sendParentMessage", [child.id, "Hello"], true).now.length, 0);
});

test("leave and admissions go to the owners", () => {
  assert.deepEqual(notes("requestLeave", [{ name: "Mina", from: "2026-11-28", to: "2026-11-29", reason: "ill" }]).now[0].to, { owners: true });
  assert.deepEqual(notes("addAdmission", [{ name: "Sadia", guardian: "Mrs A", phone: "01711000000", wants: "Class 9", note: "" }]).now[0].to, { owners: true });
});

test("timed: due tomorrow from 6 pm for those who haven't done it, the fee from the 7th, each with a once-key", () => {
  const st = structuredClone(s);
  const m = st.modules.find((x) => x.published);
  const evening = new Date("2026-11-22T13:00:00Z"); // 7 pm in Dhaka
  m.items.push({ id: 999001, kind: "task", title: "Graph", meta: "", done: false, dueDate: dhaka(evening, 1).day, submissions: {} });
  const ids = st.students.filter((x) => !x.pending && x.batch === m.batch).map((x) => x.id);
  m.items.at(-1).submissions[ids[0]] = { fileName: "a.jpg", at: "" }; // already handed in
  const due = timedNotes(st, evening).filter((n) => n.text[0] === "dueTomorrow");
  assert.deepEqual(due.map((n) => n.to.students[0]), ids.slice(1));
  assert.ok(due.every((n) => n.once.startsWith("due:999001:")));
  assert.equal(timedNotes(st, new Date("2026-11-22T06:00:00Z")).filter((n) => n.text[0] === "dueTomorrow").length, 0); // noon: not yet
  const fees = timedNotes(st, evening).filter((n) => n.text[0] === "feeDue");
  assert.ok(fees.length > 0 && fees.every((n) => n.to.guardians && n.once.startsWith("fee:2026-11:")));
  assert.equal(timedNotes(st, new Date("2026-11-03T13:00:00Z")).filter((n) => n.text[0] === "feeDue").length, 0); // before the 7th
});

test("every notification has wording in both languages", () => {
  const keys = ["new_task", "new_quiz", "new_exam", "dueTomorrow", "graded", "merit", "notice", "live", "answered", "aiEnding", "absent", "paid", "feeDue", "message", "fromGuardian", "doubt", "booked", "cancelled", "reported", "leaveAsked", "leaveYes", "leaveNo", "admission", "order", "payApproved", "payRejected"];
  for (const words of [en.notify, bn.notify])
    for (const k of keys) {
      const [title, body] = words[k]("x", "y");
      assert.ok(title && typeof body === "string", k);
    }
});
