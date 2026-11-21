// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { answer, createGame, hostAction, join, view } from "../src/lib/live-game.ts";

const qs = [
  { q: "2+2?", options: ["3", "4"], answer: 1 },
  { q: "Capital of Bangladesh?", options: ["Dhaka", "Khulna", "Sylhet"], answer: 0 },
];
const newGame = () => {
  const g = createGame("123456", "key", "Test", qs, 0, 20_000);
  join(g, "Rafi", "p1");
  join(g, "Nusrat", "p2");
  return g;
};

test("join rules: unique names, no joining after start", () => {
  const g = newGame();
  assert.deepEqual(join(g, " rafi ", "p3"), { error: "name" });
  assert.deepEqual(join(g, "", "p3"), { error: "name" });
  hostAction(g, "start", 1000);
  assert.deepEqual(join(g, "Late", "p3"), { error: "started" });
});

test("faster correct answers score more; wrong scores 0; one answer each", () => {
  const g = newGame();
  hostAction(g, "start", 0);
  assert.equal(answer(g, "p1", 1, 0), true); // instant: 1000
  assert.equal(answer(g, "p1", 0, 100), false); // already answered
  assert.equal(answer(g, "p2", 1, 10_000), true); // half time: 750
  assert.equal(g.players[0].score, 1000);
  assert.equal(g.players[1].score, 750);
});

test("players cannot see the answer before the reveal; reveal after all answered", () => {
  const g = newGame();
  hostAction(g, "start", 0);
  const during = view(g, 5, { playerId: "p1" });
  assert.equal(during.correct, undefined);
  assert.equal(during.phase, "question");
  answer(g, "p1", 0, 100);
  answer(g, "p2", 1, 200);
  const after = view(g, 300, { playerId: "p1", host: false });
  assert.equal(after.phase, "reveal");
  assert.equal(after.correct, 1);
  assert.equal(after.me.wasCorrect, false);
  assert.equal(view(g, 300, { host: true }).counts.join(), "1,1");
});

test("time running out reveals; game ends after the last question with a ranking", () => {
  const g = newGame();
  hostAction(g, "start", 0);
  answer(g, "p2", 1, 1000);
  assert.equal(view(g, 20_001).phase, "reveal");
  hostAction(g, "next", 21_000);
  answer(g, "p1", 0, 21_000);
  answer(g, "p2", 2, 22_000);
  hostAction(g, "next", 23_000);
  const end = view(g, 23_000, { playerId: "p1" });
  assert.equal(end.phase, "end");
  // Rafi: 0 + 1000 (instant, correct). Nusrat: 975 (correct after 1 s) + 0 (wrong).
  assert.deepEqual(end.top.map((p) => [p.name, p.score]), [["Rafi", 1000], ["Nusrat", 975]]);
  assert.equal(end.me.rank, 1);
});

test("bad answers are ignored", () => {
  const g = newGame();
  hostAction(g, "start", 0);
  assert.equal(answer(g, "p1", 7, 10), false);
  assert.equal(answer(g, "ghost", 1, 10), false);
});
