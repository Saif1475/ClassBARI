// Run: npm test — the server counts days and months in Dhaka time, whatever time zone its machine is set to.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "../src/instrumentation.ts";
import { runAction } from "../src/lib/data-access.ts";
import { dayKey } from "../src/lib/dates.ts";
import { blankState, monthKey } from "../src/lib/lms-actions.ts";

test("server start switches the process to Dhaka time, so 00:30 on the 1st is already the new month", async () => {
  process.env.TZ = "UTC"; // how the server machine (a cloud VM) is set up
  delete process.env.NEXT_RUNTIME; // register() then stops before it starts anything (no alerts, no timer)
  const night = new Date("2026-11-30T18:30:00Z"); // 00:30 on 1 December in Dhaka
  assert.equal(monthKey(night), "2026-11"); // the machine's own month: what went wrong
  await register();
  assert.equal(process.env.TZ, "Asia/Dhaka");
  assert.equal(dayKey(night), "2026-12-01");
  assert.equal(monthKey(night), "2026-12");
  // A salary paid at that moment is saved under December, so December's payroll shows it as paid.
  mock.timers.enable({ apis: ["Date"], now: night });
  const paid = runAction({ ...blankState(), staff: [{ name: "Rumana Ma'am", phone: "", salary: 5000, share: 0 }] }, "payStaff", ["Rumana Ma'am", 5000], Date.now());
  mock.timers.reset();
  assert.equal(paid.staffPayments[0].month, "2026-12");
});
