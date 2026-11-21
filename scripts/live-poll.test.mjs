// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { pollView, startPoll, vote } from "../src/lib/live-poll.ts";

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
