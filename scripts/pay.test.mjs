// Run: npm test — paying by bKash or Nagad with the transaction ID.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPayment, packClash, packUntil, payNumbers } from "../src/lib/pay.ts";

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

test("a different pack can't be bought while one is still running", () => {
  const cheap = { premiumUntil: "2027-11-22", aiPack: 150 };
  assert.deepEqual(packClash(cheap, "2026-11-24", 1500), { pack: 150, until: "2027-11-22" }); // would turn 12 paid ৳150 months into ৳1500 ones
  assert.deepEqual(packClash({ premiumUntil: "2027-11-22", aiPack: 1500 }, "2026-11-24", 150), { pack: 1500, until: "2027-11-22" }); // or downgrade paid months
  assert.equal(packClash(cheap, "2026-11-24", 150), null); // the same level: months are added as before
  assert.deepEqual(packClash(cheap, "2026-11-24"), { pack: 150, until: "2027-11-22" }); // no level asked: what is running
  assert.deepEqual(packClash({ premiumUntil: "2027-01-01" }, "2026-11-24", 400), { pack: 150, until: "2027-01-01" }); // premium given without a pack counts as the smallest
  assert.equal(packClash({ premiumUntil: "2027-01-01" }, "2026-11-24", 150), null);
  for (const st of [undefined, {}, { aiPack: 150 }, { premiumUntil: "2026-11-23", aiPack: 150 }, { premiumUntil: "2026-11-24", aiPack: 150 }]) assert.equal(packClash(st, "2026-11-24", 1500), null, JSON.stringify(st)); // none, ran out, or its last day: the new one starts today
});

test("only methods with a real number are offered", () => {
  assert.deepEqual(payNumbers({ PAY_BKASH_NUMBER: "01712345678", PAY_NAGAD_NUMBER: "" }), [{ method: "bkash", number: "01712345678" }]);
  assert.deepEqual(payNumbers({ PAY_BKASH_NUMBER: "123" }), []);
});

test("a pack that fails to save puts the payment back in the queue", async () => {
  // The route needs Supabase, so check its text: the pack's act must sit in a try whose catch sets the payment back to pending.
  const src = (await import("node:fs")).readFileSync(new URL("../src/app/api/platform/admin/payments/route.ts", import.meta.url), "utf8");
  const pack = src.slice(src.indexOf('p.kind === "ai_pack") {'), src.indexOf('p.kind === "ai_credit") {'));
  assert.match(pack, /try \{\s*await act\(system, "setStudentPremium"[\s\S]*\} catch \(e\) \{[\s\S]*status: "pending"[\s\S]*status: 503/);
});
