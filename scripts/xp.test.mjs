// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { streak, weekDays, weekXp } from "../src/lib/xp.ts";

const today = new Date(2026, 10, 19); // Thu 19 Nov 2026

test("streak counts consecutive days, today included", () => {
  assert.deepEqual(streak({ "2026-11-19": 10, "2026-11-18": 5, "2026-11-17": 5, "2026-11-15": 9 }, today), { days: 3, doneToday: true });
});

test("streak survives until today is over, breaks after a missed day", () => {
  assert.deepEqual(streak({ "2026-11-18": 5, "2026-11-17": 5 }, today), { days: 2, doneToday: false });
  assert.deepEqual(streak({ "2026-11-17": 5 }, today), { days: 0, doneToday: false });
  assert.deepEqual(streak({}, today), { days: 0, doneToday: false });
});

test("streak crosses month ends", () => {
  assert.equal(streak({ "2026-12-01": 1, "2026-11-30": 1 }, new Date(2026, 11, 1)).days, 2);
});

test("week starts Saturday", () => {
  assert.deepEqual(weekDays(today), ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]);
  assert.deepEqual(weekDays(new Date(2026, 10, 14)), ["2026-11-14"]);
  assert.equal(weekXp({ "2026-11-13": 50, "2026-11-14": 10, "2026-11-19": 5 }, today), 15);
});
