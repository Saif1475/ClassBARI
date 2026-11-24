// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { runAction } from "../src/lib/data-access.ts";
import { blankState } from "../src/lib/lms-actions.ts";
import { canOpen, emailAlreadyTaken, forgetsPickedInstitute, homeFor, needsFirstBatch, needsOwnInstitute, safeNext } from "../src/lib/access.ts";

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
  assert.equal(safeNext("/student?tab=fees&x=1#top"), "/student?tab=fees&x=1#top"); // a normal path keeps its query and hash
  // Browsers drop tabs and newlines and read "\" as "/", so each of these is really "//evil.example".
  for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\\evil.example", "/\\/evil.example", "/.//evil.example", "/./\\evil.example", "/\t/[", "student", ""]) {
    assert.equal(safeNext(bad), "/auth/continue", JSON.stringify(bad));
    assert.equal(new URL(safeNext(bad), "https://app.example").origin, "https://app.example", JSON.stringify(bad)); // what /auth/callback does with it
  }
});

test("institute sign-up: a teacher or guardian elsewhere still gets their own centre; an owner doesn't get a second", () => {
  assert.equal(needsOwnInstitute(["teacher"], "institute"), true); // teaches at B, signed up to open their own
  assert.equal(needsOwnInstitute(["guardian"], "institute"), true);
  assert.equal(needsOwnInstitute([], "institute"), true);
  assert.equal(needsOwnInstitute(["teacher", "owner"], "institute"), false); // already created
  assert.equal(needsOwnInstitute(["teacher"], undefined), false); // a plain login, not a sign-up
});

test("a sign-up whose first batch failed to save is sent again on the next login, and only then", () => {
  assert.equal(needsFirstBatch("institute", { role: "owner", state: { teacherName: "" } }), true); // centre made, batch POST failed
  assert.equal(needsFirstBatch("institute", { role: "owner", state: { teacherName: "New Owner" } }), false); // it saved (maybe its answer was lost): never a second batch
  assert.equal(needsFirstBatch("institute", { role: "teacher", state: { teacherName: "" } }), false); // not their own centre
  assert.equal(needsFirstBatch(undefined, { role: "owner", state: { teacherName: "" } }), false); // not a sign-up
  assert.equal(needsFirstBatch("institute", null), false);
  // A blank owner name (a name of only spaces in the form): the first batch saved, so the next login must not add another.
  const fresh = blankState();
  assert.equal(needsFirstBatch("institute", { role: "owner", state: fresh }), true);
  const saved = runAction(fresh, "signUpTeacher", [{ institute: "", name: "", phone: "", batch: "Batch 1", days: "", classDays: [], subject: "", fee: 0 }], 1_700_000_000_000);
  assert.equal(saved.teacherName, "");
  assert.equal(needsFirstBatch("institute", { role: "owner", state: saved }), false);
});

test("institute sign-up with an email that already has an account is noticed (Supabase sends no email then)", () => {
  assert.equal(emailAlreadyTaken({ id: "x", identities: [] }), true); // a teacher at B or a guardian who logged in before
  assert.equal(emailAlreadyTaken({ id: "x", identities: [{ provider: "email" }] }), false); // a new account: the link is on its way
  assert.equal(emailAlreadyTaken({ id: "x" }), false);
  assert.equal(emailAlreadyTaken(null), false);
});

test("choosing Institute forgets an institute picked earlier on this browser, even when they land on the teacher view", () => {
  assert.equal(forgetsPickedInstitute(homeFor(["teacher"], "institute").uiRole, "institute"), true); // a plain teacher of B, with A left over from a student
  assert.equal(forgetsPickedInstitute("institute", undefined), true);
  assert.equal(forgetsPickedInstitute("teacher", "teacher"), false); // a teacher who picked an institute keeps it
  assert.equal(forgetsPickedInstitute("student", "student"), false);
  assert.equal(forgetsPickedInstitute(homeFor(["teacher"]).uiRole, undefined), true); // nothing chosen (password-reset link in a new tab): the pick was never checked
  assert.equal(forgetsPickedInstitute("student", undefined), true);
});
