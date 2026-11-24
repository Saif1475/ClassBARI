// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { pollView, startPoll, vote, voterOf } from "../src/lib/live-poll.ts";

test("live poll: one vote per device, answer hidden until you vote", () => {
  assert.deepEqual(startPoll({ batch: "A", question: "Q?", options: ["x"], correct: 0 }, "p1", 0), { error: "invalid poll" });
  const p = startPoll({ batch: "A", question: "Unit of frequency?", options: ["Hz", "N", " "], correct: 0 }, "p1", 0);
  assert.deepEqual(p.options, ["Hz", "N"]); // blank options dropped
  assert.equal(pollView(p, { staff: false, voter: "device-0001" }).correct, null);
  assert.deepEqual(vote(p, "p1", "device-0001", 1), { ok: true });
  assert.deepEqual(vote(p, "p1", "device-0001", 0), { error: "already voted" });
  assert.deepEqual(vote(p, "old", "device-0002", 0), { error: "poll ended" });
  assert.deepEqual(vote(p, "p1", "x", 0), { error: "bad voter" });
  assert.deepEqual(pollView(p, { staff: false, voter: "device-0001" }), { id: "p1", question: "Unit of frequency?", options: ["Hz", "N"], counts: [0, 1], total: 1, mine: 1, correct: 0 });
  assert.equal(pollView(p, { staff: true }).correct, 0);
});

test("live poll: a signed-in person votes once and sees the answer only after their own vote, whatever device id they send", () => {
  const p = startPoll({ batch: "A", question: "Q?", options: ["a", "b"], correct: 1 }, "p1", 0);
  assert.deepEqual(vote(p, "p1", voterOf("rina@x.com", "throwaway-0001"), 0), { ok: true });
  assert.deepEqual(vote(p, "p1", voterOf("rina@x.com", "real-device-01"), 1), { error: "already voted" });
  assert.equal(pollView(p, { staff: false, voter: voterOf("kamal@x.com", "throwaway-0001") }).correct, null); // another person reusing the device id sees nothing
  assert.equal(pollView(p, { staff: false, voter: voterOf("rina@x.com", undefined) }).correct, 1);
  assert.equal(voterOf(undefined, "device-0001"), "device-0001"); // demo mode: the device id as before
});
