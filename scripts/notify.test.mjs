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

test("two people marking the same student absent (one syncing late from offline) keep them absent, not flipped back", () => {
  const id = batchIds[0];
  const once = runAction(s, "toggleAttendance", [id, "2026-11-20", true], Date.now());
  const twice = runAction(once, "toggleAttendance", [id, "2026-11-20", true], Date.now());
  assert.deepEqual(twice.attendance["2026-11-20"].filter((x) => x === id), [id]);
  assert.ok(!runAction(twice, "toggleAttendance", [id, "2026-11-20", false], Date.now()).attendance["2026-11-20"].includes(id));
  assert.ok(runAction(s, "toggleAttendance", [id, "2026-11-20"], Date.now()).attendance["2026-11-20"].includes(id)); // an older app's flip still works
});

test("an absence marked for a past day is not announced as 'today' in either language", () => {
  const { later } = notes("toggleAttendance", [batchIds[0], "2017-11-17"]);
  const [key, ...args] = later[0].note.text;
  assert.doesNotMatch(en.notify[key](...args)[0], /today/i);
  assert.doesNotMatch(bn.notify[key](...args)[0], /আজ/);
  assert.match(en.notify[key](...args)[1], /2017-11-17/);
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

test("an old lesson with a broken doneBy neither stops the timed reminders nor a student's Done tap", () => {
  const st = structuredClone(s);
  const m = st.modules.find((x) => x.published);
  const evening = new Date("2026-11-22T13:00:00Z"); // 7 pm in Dhaka
  m.items.push({ id: 999002, kind: "task", title: "Old", meta: "", done: false, dueDate: dhaka(evening, 1).day, doneBy: 5 });
  const ids = st.students.filter((x) => !x.pending && x.batch === m.batch).map((x) => x.id);
  assert.equal(timedNotes(st, evening).filter((n) => n.once?.startsWith("due:999002:")).length, ids.length);
  const next = runAction(st, "toggleItemDone", [m.id, 999002, ids[0]], Date.now());
  assert.deepEqual(next.modules.find((x) => x.id === m.id).items.find((i) => i.id === 999002).doneBy, [ids[0]]);
});

test("every notification has wording in both languages", () => {
  const keys = ["new_task", "new_quiz", "new_exam", "dueTomorrow", "graded", "merit", "notice", "live", "answered", "aiEnding", "absent", "paid", "feeDue", "message", "fromGuardian", "doubt", "booked", "cancelled", "reported", "leaveAsked", "leaveYes", "leaveNo", "admission", "order", "payApproved", "payRejected"];
  for (const words of [en.notify, bn.notify])
    for (const k of keys) {
      const [title, body] = words[k]("x", "y");
      assert.ok(title && typeof body === "string", k);
    }
});

test("private chat: the teacher hears from the student, the student hears the reply", async () => {
  const { notesFor } = await import("../src/lib/notify.ts");
  const { seed } = await import("../src/lib/mock-data.ts");
  const s = seed();
  const st = s.students[0];
  const teacher = s.batches.find((b) => b.name === st.batch).teacher;
  assert.deepEqual(notesFor("sendStudentMessage", [st.id, "Hi"], s, s, false).now[0].to, { staff: [teacher] });
  assert.deepEqual(notesFor("sendChatMessage", [`student-${st.id}`, teacher, "Hello", false], s, s, true).now[0].to, { students: [st.id] });
});

test("a waiting absence alert is not lost when one institute can't be read; it stays queued for the next run", async () => {
  // runTimed with a fake Supabase: institute "bad" fails to load, "good" loads; only the handled row may leave the queue.
  const stub = (code) => "data:text/javascript," + encodeURIComponent(code);
  const fake = stub("export const admin = () => globalThis.__ntDb; export const loadDoc = async (i) => { globalThis.__ntLoads.push(i); if (i === 'bad') throw new Error('load failed'); return { state: globalThis.__ntState }; };");
  (await import("node:module")).register(stub(`export async function resolve(s, c, next) { return s === "./data-server.ts" && c.parentURL?.endsWith("/notify-server.ts") ? { url: ${JSON.stringify(fake)}, shortCircuit: true } : next(s, c); }`));
  const row = (inst, id) => ({ key: `${inst}:absent:2026-11-22:${id}`, institute_id: inst, due_at: "2026-11-22T04:00:00Z", what: { note: { to: { guardians: [id] }, group: "attendance", text: ["absent", "X", "2026-11-22"], screen: "home", once: `absent:2026-11-22:${id}` }, afterMin: 15, still: { absent: ["2026-11-22", id] } } });
  const queue = [row("bad", 1), row("bad", 3), row("bad", 4), row("good", 2)];
  globalThis.__ntLoads = [];
  const moved = [];
  const q = (data) => { const p = Promise.resolve({ data, error: null }); return Object.assign(p, { lte: () => q(data), limit: () => q(data), eq: () => q(data), in: () => q(data), lt: () => q(data), select: () => q(data), order: () => q(data), range: () => q(data) }); };
  globalThis.__ntState = { ...s, attendance: { "2026-11-22": [2] } };
  globalThis.__ntDb = { from: (t) => ({
    select: () => q(t === "notify_later" ? queue : []),
    insert: () => q(null),
    upsert: () => q([]),
    update: (v) => ({ in: (_c, insts) => ({ lte: () => (moved.push([v.due_at, insts]), q(null)) }) }),
    delete: () => ({ in: (_k, keys) => (keys.forEach((k) => queue.splice(queue.findIndex((r) => r.key === k), 1)), q(null)), lt: () => q(null) }),
  }) };
  const { runTimed } = await import("../src/lib/notify-server.ts");
  await runTimed(new Date("2026-11-22T05:00:00Z"));
  assert.deepEqual(queue.map((r) => r.institute_id), ["bad", "bad", "bad"]); // "good" was handled; "bad" waits for the next run instead of vanishing
  assert.equal(globalThis.__ntLoads.filter((i) => i === "bad").length, 1); // a bad institute is read once per run, not once per waiting row
  assert.deepEqual(moved, [["2026-11-22T05:15:00.000Z", ["bad"]]]); // its rows move on, so they can't fill every run's batch
  await runTimed(new Date("2026-11-24T05:00:00Z"));
  assert.equal(queue.length, 0); // still failing a day later: dropped, so it can't block the queue for ever
});

test("an absence alert whose devices can't be read takes no 'once' claim, so the next run can still send it", async () => {
  const { send } = await import("../src/lib/notify-server.ts"); // the fake Supabase from the test above is still hooked in
  const claimed = [];
  globalThis.__ntDb = { from: (t) => ({
    insert: (v) => (claimed.push(`${t}:${v.key}`), Promise.resolve({ error: null })),
    select: () => { throw new Error("network down"); },
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }) };
  const note = { to: { guardians: [1] }, group: "attendance", text: ["absent", "X", "2026-11-22"], screen: "home", once: "absent:2026-11-22:1" };
  await assert.rejects(send("i1", note, globalThis.__ntState), /network down/);
  assert.deepEqual(claimed, []); // nothing to give back, even if the database stays down
});

test("a waiting alert whose claim fails on a timeout stays queued; one already claimed (unique clash) leaves the queue", async () => {
  const { runTimed } = await import("../src/lib/notify-server.ts"); // the fake Supabase from the tests above is still hooked in
  const row = (id) => ({ key: `good:absent:2026-11-22:${id}`, institute_id: "good", what: { note: { to: { guardians: [id] }, group: "attendance", text: ["absent", "X", "2026-11-22"], screen: "home", once: `absent:2026-11-22:${id}` }, afterMin: 15, still: { absent: ["2026-11-22", id] } } });
  const queue = [row(1), row(2)];
  const q = (data) => { const p = Promise.resolve({ data, error: null }); return Object.assign(p, { lte: () => q(data), limit: () => q(data), eq: () => q(data), in: () => q(data), select: () => q(data), order: () => q(data), range: () => q(data) }); };
  globalThis.__ntLoads = [];
  globalThis.__ntState = { ...s, attendance: { "2026-11-22": [1, 2] } };
  globalThis.__ntDb = { from: (t) => ({
    select: () => q(t === "notify_later" ? queue : []),
    insert: (v) => Promise.resolve({ error: v.key.endsWith(":1") ? { code: "57014", message: "canceling statement due to statement timeout" } : { code: "23505", message: "duplicate key" } }),
    upsert: () => q([]),
    update: () => ({ in: () => ({ lte: () => q(null) }) }),
    delete: () => ({ in: (_k, keys) => (keys.forEach((k) => queue.splice(queue.findIndex((r) => r.key === k), 1)), q(null)), lt: () => q(null) }),
  }) };
  await runTimed(new Date("2026-11-22T05:00:00Z"));
  assert.deepEqual(queue.map((r) => r.key), ["good:absent:2026-11-22:1"]); // the timed-out one waits for a retry instead of being read as "already sent"
});

test("devices past the API's 1000-row page still get notified: every page of push_devices is read", async () => {
  const { send, runTimed } = await import("../src/lib/notify-server.ts"); // the fake Supabase from the tests above is still hooked in
  // 2,500 guardian devices (the fake returns at most 1000 rows per query, like the real API); no Firebase account, so nothing leaves the machine.
  const rows = Array.from({ length: 2500 }, (_, i) => ({ token: `t${i}`, kind: "fcm", sub: null, email: `g${i}@x`, role: "guardian", student_ids: [1], lang: "en", institute_id: i < 1000 ? "a" : "b" }));
  const page = (list) => { const p = (from, to) => Promise.resolve({ data: list.slice(from, Math.min(to + 1, from + 1000)), error: null }); const c = { eq: () => c, order: () => c, range: p, lte: () => c, limit: () => c, then: (f, r) => Promise.resolve({ data: list.slice(0, 1000), error: null }).then(f, r) }; return c; };
  const loaded = [];
  globalThis.__ntLoads = loaded;
  globalThis.__ntDb = { from: (t) => ({
    select: () => page(t === "push_devices" ? rows : []),
    insert: () => Promise.resolve({ error: null }),
    upsert: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    delete: () => ({ in: () => Promise.resolve({ error: null }), lt: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }),
  }) };
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  const note = { to: { guardians: [1] }, group: "attendance", text: ["absent", "X", "2026-11-22"], screen: "home" };
  assert.equal(await send("a", note, globalThis.__ntState), 2500); // not just the first 1000
  await runTimed(new Date("2026-11-22T05:00:00Z"));
  assert.ok(loaded.includes("b")); // institute "b" has only devices after row 1000, and its timed notes are still checked
});
