// Run: npm test — paying by bKash or Nagad with the transaction ID.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPayment, packUntil, payNumbers } from "../src/lib/pay.ts";

const plans = { basic: 1499, pro: 3499 };
const ok = { kind: "ai_pack", item: "400", months: 3, method: "bkash", sender: "01712-345678", trxId: " 9a1b2c3d4e " };

test("the amount comes from our price list, never from the payer", () => {
  assert.deepEqual(checkPayment({ ...ok, amount: 1 }, plans), { kind: "ai_pack", item: "400", months: 3, amount: 1200, method: "bkash", sender: "01712345678", trxId: "9A1B2C3D4E" });
  assert.equal(checkPayment({ ...ok, kind: "plan", item: "pro", months: 1 }, plans).amount, 3499);
});

test("anything odd is refused", () => {
  for (const bad of [{ item: "999" }, { months: 2 }, { method: "card" }, { sender: "12345" }, { trxId: "abc" }, { trxId: "9A1B2C3D4E5F6" }, { kind: "plan", item: "gold" }, { kind: "refund" }])
    assert.ok("error" in checkPayment({ ...ok, ...bad }, plans), JSON.stringify(bad));
});

test("a pack runs on from its current end, or from today", () => {
  assert.equal(packUntil(undefined, "2026-11-22", 1), "2026-12-22");
  assert.equal(packUntil("2026-12-10", "2026-11-22", 3), "2027-03-10"); // still running: added on
  assert.equal(packUntil("2026-10-01", "2026-11-22", 1), "2026-12-22"); // ran out: from today
});

test("only methods with a real number are offered", () => {
  assert.deepEqual(payNumbers({ PAY_BKASH_NUMBER: "01712345678", PAY_NAGAD_NUMBER: "" }), [{ method: "bkash", number: "01712345678" }]);
  assert.deepEqual(payNumbers({ PAY_BKASH_NUMBER: "123" }), []);
});
