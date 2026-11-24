// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCoupon, clashes, profitAndLoss } from "../src/lib/centre.ts";

process.env.TZ = "Asia/Dhaka"; // months are counted in local time: the same answer on any machine

const slot = (id, day, start, end, teacher, room, batch) => ({ id, day, start, end, teacher, room, batch });

test("timetable clashes: same teacher, room or batch at overlapping times on the same day", () => {
  const s = [
    slot(1, 6, "16:00", "17:30", "Tanvir", "Room 1", "HSC A"),
    slot(2, 6, "17:00", "18:00", "tanvir ", "Room 2", "SSC B"), // same teacher, overlaps
    slot(3, 6, "17:30", "19:00", "Rumana", "Room 1", "SSC C"), // starts when 1 ends: fine
    slot(4, 1, "16:00", "17:30", "Tanvir", "Room 1", "HSC A"), // other day: fine
    slot(5, 6, "18:30", "19:30", "Karim", "Room 1", "SSC C"), // same room and batch as 3
  ];
  const c = clashes(s).map((x) => [x.a.id, x.b.id, x.why]);
  assert.deepEqual(c, [[1, 2, ["teacher"]], [3, 5, ["room", "batch"]]]);
});

test("profit and loss for one month", () => {
  const r = profitAndLoss(
    "2026-11",
    [{ amount: 5000, at: "2026-11-03T10:00:00Z" }, { amount: 3000, at: "2026-10-30T10:00:00Z" }],
    [{ month: "2026-11", amount: 2000 }],
    [{ id: 1, date: "2026-11-01", category: "Rent", amount: 1500, note: "" }, { id: 2, date: "2026-11-05", category: "Rent", amount: 500, note: "" }, { id: 3, date: "2026-12-01", category: "Rent", amount: 9, note: "" }],
  );
  assert.deepEqual(r, { income: 5000, salaries: 2000, byCategory: { Rent: 2000 }, expenses: 4000, profit: 1000 });
});

test("profit and loss counts a payment in its local month, as payroll does", () => {
  const paid = [{ amount: 1000, at: "2026-11-30T18:30:00.000Z" }]; // 1 December, 00:30 in Dhaka
  assert.equal(profitAndLoss("2026-12", paid, [], []).income, 1000);
  assert.equal(profitAndLoss("2026-11", paid, [], []).income, 0);
});

test("coupons: percent off, course-only, expiry and use limit", () => {
  const coupons = [{ code: "EID20", percent: 20, maxUses: 2, used: 1 }, { code: "HSC", percent: 50, batchId: "hsc", maxUses: 9, used: 0, expires: "2026-11-30" }, { code: "FULL", percent: 10, maxUses: 1, used: 1 }];
  assert.equal(applyCoupon(1000, " eid20 ", coupons, "ssc", "2026-11-19").price, 800);
  assert.deepEqual(applyCoupon(1000, "HSC", coupons, "ssc", "2026-11-19"), { error: "otherCourse" });
  assert.deepEqual(applyCoupon(1000, "HSC", coupons, "hsc", "2026-12-01"), { error: "expired" });
  assert.deepEqual(applyCoupon(1000, "FULL", coupons, "hsc", "2026-11-19"), { error: "usedUp" });
  assert.deepEqual(applyCoupon(1000, "NOPE", coupons, "hsc", "2026-11-19"), { error: "unknown" });
  // A 1-use coupon already on a waiting order is used up for the next buyer; rejected orders don't count.
  const one = [{ code: "HALF", percent: 50, maxUses: 1, used: 0 }];
  assert.deepEqual(applyCoupon(1000, "half", one, "ssc", "2026-11-19", [{ status: "pending", coupon: "HALF" }]), { error: "usedUp" });
  assert.equal(applyCoupon(1000, "half", one, "ssc", "2026-11-19", [{ status: "rejected", coupon: "HALF" }]).price, 500);
});
