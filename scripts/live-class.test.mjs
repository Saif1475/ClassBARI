// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, startSession, viewOf } from "../src/lib/live-class.ts";

const A = "device-aaaa1111", B = "device-bbbb2222";
const stu = (voter) => ({ voter, staff: false });
const ROOM = "ClassBARI-" + "a".repeat(32);
const staff = { staff: true };

test("joining builds attendance once per device; students can't see who joined", () => {
  const s = startSession({ batch: "HSC A", topic: "Waves", teacher: "Tanvir", room: ROOM }, 0);
  assert.deepEqual(act(s, { action: "join", name: "Nusrat", studentId: 1 }, stu(A), 1), { ok: true });
  act(s, { action: "join", name: "Nusrat again", studentId: 1 }, stu(A), 2);
  act(s, { action: "join", name: "Guest" }, stu(B), 3);
  const t = viewOf(s, staff, 0, 4);
  assert.equal(t.joinedCount, 2);
  assert.deepEqual(t.joined.map((j) => [j.name, j.studentId]), [["Nusrat", 1], ["Guest", undefined]]);
  assert.equal(viewOf(s, stu(A), 0, 4).joined, undefined);
});

test("hands: raise, lower, teacher lowers; only the teacher sees the queue", () => {
  const s = startSession({ batch: "A", room: ROOM }, 0);
  act(s, { action: "hand", name: "Nusrat", up: true }, stu(A), 1);
  act(s, { action: "hand", name: "Rafsan", up: true }, stu(B), 2);
  assert.deepEqual(viewOf(s, staff, 0, 3).hands.map((h) => h.name), ["Nusrat", "Rafsan"]);
  assert.equal(viewOf(s, stu(A), 0, 3).myHand, true);
  assert.equal(viewOf(s, stu(A), 0, 3).hands, undefined);
  act(s, { action: "lowerHand", voter: A }, staff, 4);
  assert.equal(viewOf(s, stu(A), 0, 5).myHand, false);
});

test("chat: length limit, slow-down for students, teacher can delete", () => {
  const s = startSession({ batch: "A", room: ROOM }, 0);
  assert.deepEqual(act(s, { action: "chat", name: "N", text: "x".repeat(301) }, stu(A), 0), { error: "bad message" });
  assert.deepEqual(act(s, { action: "chat", name: "N", text: "hi" }, stu(A), 2000), { ok: true });
  assert.deepEqual(act(s, { action: "chat", name: "N", text: "hi again" }, stu(A), 2500), { error: "too fast" });
  act(s, { action: "chat", name: "Tanvir", text: "Welcome" }, staff, 2600);
  const v = viewOf(s, stu(A), 0, 3000);
  assert.deepEqual(v.chat.map((m) => [m.text, m.teacher, m.mine]), [["hi", false, true], ["Welcome", true, false]]);
  assert.equal("voter" in v.chat[0], false); // device ids never leave the server
  act(s, { action: "deleteChat", id: v.chat[0].id }, staff, 3100);
  assert.equal(viewOf(s, stu(A), 0, 3200).chat.length, 1);
});

test("questions: most upvoted first, answered go to the bottom, max 3 open per student", () => {
  const s = startSession({ batch: "A", room: ROOM }, 0);
  act(s, { action: "ask", name: "N", text: "Q1" }, stu(A), 1);
  act(s, { action: "ask", name: "R", text: "Q2" }, stu(B), 2);
  const q2 = viewOf(s, stu(A), 0, 3).questions.find((q) => q.text === "Q2");
  act(s, { action: "vote", id: q2.id }, stu(A), 4);
  assert.deepEqual(viewOf(s, stu(A), 0, 5).questions.map((q) => [q.text, q.votes, q.myVote]), [["Q2", 2, true], ["Q1", 1, true]]);
  act(s, { action: "answered", id: q2.id }, staff, 6);
  assert.deepEqual(viewOf(s, stu(A), 0, 7).questions.map((q) => q.text), ["Q1", "Q2"]);
  act(s, { action: "ask", name: "N", text: "Q3" }, stu(A), 8);
  act(s, { action: "ask", name: "N", text: "Q4" }, stu(A), 9);
  assert.deepEqual(act(s, { action: "ask", name: "N", text: "Q5" }, stu(A), 10), { error: "too many" });
});

test("reactions fade after a few seconds; board is only resent when newer", () => {
  const s = startSession({ batch: "A", room: ROOM }, 0);
  act(s, { action: "react", emoji: "👏" }, stu(A), 1000);
  assert.deepEqual(act(s, { action: "react", emoji: "💩" }, stu(A), 1000), { error: "bad reaction" });
  assert.equal(viewOf(s, stu(A), 0, 2000).reactions.length, 1);
  assert.equal(viewOf(s, stu(A), 0, 20000).reactions.length, 0);
  assert.deepEqual(act(s, { action: "board", img: "javascript:alert(1)" }, staff, 1), { error: "bad board" });
  act(s, { action: "board", img: "data:image/jpeg;base64,AAAA" }, staff, 5000);
  assert.equal(viewOf(s, stu(A), 0, 5001).board, "data:image/jpeg;base64,AAAA");
  assert.equal(viewOf(s, stu(A), 5000, 5001).board, undefined); // already have it
});

test("everyone gets the same secret room from the session; made-up room names are refused", () => {
  assert.deepEqual(startSession({ batch: "A", room: "my-room" }, 0), { error: "bad room" });
  const s = startSession({ batch: "A", room: ROOM }, 0);
  assert.equal(viewOf(s, stu(A), 0, 1).room, ROOM);
  const fresh = "Instanton-" + "c".repeat(32); // rooms made after the rename (ROOM is one made before it)
  assert.equal(viewOf(startSession({ batch: "A", room: fresh }, 0), stu(A), 0, 1).room, fresh);
});

test("a signed-in student can only join, chat and ask as themselves, never mark a classmate present", () => {
  const s = startSession({ batch: "A", room: ROOM }, 0);
  const me = { voter: "aaaaaaaa1", staff: false, own: [{ id: 3, name: "Student 3" }] };
  act(s, { action: "join", name: "Student 7", studentId: 7 }, me, 1);
  assert.deepEqual(Object.values(s.joined).map((j) => [j.name, j.studentId]), [["Student 3", 3]]);
  act(s, { action: "chat", name: "Teacher", text: "hi" }, me, 5000);
  assert.equal(s.chat[0].name, "Student 3");
  // A guardian (no students of their own to be) can't join or post at all.
  assert.deepEqual(act(s, { action: "join", name: "Student 7", studentId: 7 }, { voter: "bbbbbbbb1", staff: false, own: [] }, 3), { error: "bad join" });
});

test("made-up device ids can't beat the chat slow-down or flood hands, questions and attendance", () => {
  const s = startSession({ batch: "A", room: ROOM }, 0);
  const me = (n) => ({ voter: `fakedev-${n}`, staff: false, own: [{ id: 3, name: "Student 3" }] });
  assert.deepEqual(act(s, { action: "chat", text: "hi" }, me(1), 5000), { ok: true });
  assert.deepEqual(act(s, { action: "chat", text: "spam" }, me(2), 5001), { error: "too fast" }); // a new device id is still the same student
  for (let n = 3; n < 20; n++) act(s, { action: "hand", up: true }, me(n), 6000);
  assert.equal(Object.keys(s.joined).length, 5);
  assert.equal(s.hands.length, 3); // devices 3-5; devices 1 and 2 joined by chatting
  assert.deepEqual(act(s, { action: "join" }, me(99), 7000), { error: "too many" });
  assert.deepEqual(act(s, { action: "join" }, me(1), 7000), { ok: true }); // a device already in still works
});
