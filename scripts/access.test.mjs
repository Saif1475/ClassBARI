// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { canOpen, homeFor, safeNext } from "../src/lib/access.ts";

test("each role opens only its own part of the app", () => {
  assert.equal(canOpen("institute", ["teacher"]), false); // a teacher can't open the owner's view
  assert.equal(canOpen("teacher", ["teacher"]), true);
  assert.equal(canOpen("teacher", ["owner"]), true);
  assert.equal(canOpen("student", ["guardian"]), false);
  assert.equal(canOpen("parent", ["guardian"]), true);
  assert.equal(canOpen("settings", []), false); // signed in but not enrolled anywhere
  assert.equal(canOpen("admin", ["owner"]), false); // unknown area: nobody
});

test("after login: the home that fits, preferring the button they chose", () => {
  assert.deepEqual(homeFor(["owner"]), { path: "/institute", uiRole: "institute" });
  assert.deepEqual(homeFor(["owner"], "teacher"), { path: "/teacher", uiRole: "teacher" });
  assert.deepEqual(homeFor(["teacher"], "institute"), { path: "/teacher", uiRole: "teacher" }); // can't pick what you aren't
  assert.deepEqual(homeFor(["guardian", "teacher"], "parent"), { path: "/parent", uiRole: "parent" });
  assert.equal(homeFor([]), null);
});

test("redirects stay inside the app", () => {
  assert.equal(safeNext("/student"), "/student");
  assert.equal(safeNext("https://evil.example"), "/auth/continue");
  assert.equal(safeNext("//evil.example"), "/auth/continue");
  assert.equal(safeNext(null), "/auth/continue");
});
