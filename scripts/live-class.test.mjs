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
});
