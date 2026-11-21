// Run: npm test — which of the four Android apps a page belongs to.
import assert from "node:assert/strict";
import { test } from "node:test";
import { appFrom } from "../src/lib/apps.ts";

test("the subdomain decides the app", () => {
  assert.equal(appFrom("guardian.classbari.app"), "parent");
  assert.equal(appFrom("student.classbari.app"), "student");
  assert.equal(appFrom("institute.classbari.app"), "institute");
  assert.equal(appFrom("classbari.app"), null); // the main website: every role
  assert.equal(appFrom("www.classbari.app"), null);
});

test("?app= works for testing on this computer", () => {
  assert.equal(appFrom("localhost", "?app=guardian"), "parent");
  assert.equal(appFrom("localhost", "?app=teacher"), "teacher");
  assert.equal(appFrom("localhost", "?app=nonsense"), null);
  assert.equal(appFrom("localhost", ""), null);
});
