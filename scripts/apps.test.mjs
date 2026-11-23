// Run: npm test — which of the three Android apps a page belongs to.
import assert from "node:assert/strict";
import { test } from "node:test";
import { appFrom, roleIn } from "../src/lib/apps.ts";

test("the subdomain decides the app", () => {
  assert.equal(appFrom("guardian.classbari.app"), "parent");
  assert.equal(appFrom("student.classbari.app"), "student");
  assert.equal(appFrom("teacher.classbari.app"), "teacher");
  assert.equal(appFrom("institute.classbari.app"), null); // no Institution app any more: Instanton Campus has both
  assert.equal(appFrom("classbari.app"), null); // the main website: every role
  assert.equal(appFrom("www.classbari.app"), null);
});

test("?app= works for testing on this computer", () => {
  assert.equal(appFrom("localhost", "?app=guardian"), "parent");
  assert.equal(appFrom("localhost", "?app=teacher"), "teacher");
  assert.equal(appFrom("localhost", "?app=nonsense"), null);
  assert.equal(appFrom("localhost", ""), null);
});

test("Instanton Campus opens as teacher or institute, as picked on its login page; other apps only as themselves", () => {
  assert.equal(roleIn("teacher", "institute"), "institute");
  assert.equal(roleIn("teacher", "teacher"), "teacher");
  assert.equal(roleIn("teacher", null), "teacher");
  assert.equal(roleIn("teacher", "student"), "teacher"); // picked on the main website earlier: not one of this app's
  assert.equal(roleIn("parent", "institute"), "parent");
});
