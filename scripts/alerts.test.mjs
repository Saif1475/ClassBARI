import assert from "node:assert/strict";
import { test } from "node:test";
import { scrub, shouldAlert } from "../src/lib/alerts.ts";

test("keys, emails and phone numbers never reach the error log or the alert", () => {
  const out = scrub("failed for rahim@gmail.com 01711000000 with sb_secret_abcDEF123456 at postgresql://postgres:pw@db.example:5432/x token eyJhbGciOiJIUzI1NiJ9.payload.sig");
  for (const bad of ["rahim@gmail.com", "01711000000", "sb_secret_", "pw@db", "eyJhbGci"]) assert.ok(!out.includes(bad), bad);
  assert.ok(out.includes("[email]") && out.includes("[phone]") && out.includes("[key]"));
  assert.ok(scrub("x".repeat(5000)).length <= 600);
});

test("the same error alerts once, then counts the repeats until the quiet time is over", () => {
  const t = 1_000_000;
  assert.deepEqual(shouldAlert("a|boom", t), { skipped: 0 });
  assert.equal(shouldAlert("a|boom", t + 60_000), null);
  assert.equal(shouldAlert("a|boom", t + 120_000), null);
  assert.deepEqual(shouldAlert("b|other", t + 120_000), { skipped: 0 }); // a different error is not held back
  assert.deepEqual(shouldAlert("a|boom", t + 11 * 60_000), { skipped: 2 });
});
