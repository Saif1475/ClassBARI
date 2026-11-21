// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { planUsage } from "../src/lib/seat-billing.ts";

test("plan covers up to 250 students; near the limit and above it we ask to call for a price", () => {
  assert.deepEqual(planUsage(100), { students: 100, limit: 250, pct: 40, near: false, over: false });
  assert.equal(planUsage(225).near, true);
  assert.equal(planUsage(250).over, false);
  assert.deepEqual([planUsage(251).over, planUsage(400).pct], [true, 100]);
});
