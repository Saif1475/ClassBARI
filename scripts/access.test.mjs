// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAction, Refused, runAction } from "../src/lib/data-access.ts";
import { blankState } from "../src/lib/lms-actions.ts";
import { canOpen, emailAlreadyTaken, forgetsPickedInstitute, homeFor, needsFirstBatch, needsOwnInstitute, openOwnCentre, ownsInstitute, safeNext, setUpOwnInstitute } from "../src/lib/access.ts";

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

test("institute sign-up by a teacher or manager at B: every request after create names the new centre, never B", async () => {
  let rows = [{ role: "manager", institute_id: "B" }];
  const calls = [];
  const d = {
    access: async () => rows,
    create: async () => { rows = [...rows, { role: "owner", institute_id: "NEW" }]; return { error: null }; },
    fetch: async (url, init = {}) => { calls.push(init); return { ok: true, json: async () => ({ role: "owner", state: blankState() }) }; },
  };
  const meta = { signup_kind: "institute", institute: "New Centre", full_name: "Rahim", batch: "HSC 26", fee: 900 };
  assert.equal(await setUpOwnInstitute(meta, "rahim@gmail.com", d), "made");
  assert.equal(calls.length, 2); // the first-batch check, then signUpTeacher
  for (const c of calls) assert.equal(c.headers["x-classbari-institute"], "NEW"); // the server's who-is-asking cache is keyed by it: B is never the answer
  assert.equal(JSON.parse(calls[1].body).args[0].batch, "HSC 26");
});

test("a switched-off owner: create_institute hands back the hidden centre, nothing is sent anywhere", async () => {
  let made = 0;
  const calls = [];
  const d = { access: async () => [{ role: "teacher", institute_id: "B" }], create: async () => (made++, { error: null }), fetch: async (u, i) => (calls.push(i), { ok: true, json: async () => ({}) }) };
  assert.equal(await setUpOwnInstitute({ signup_kind: "institute" }, "x@y.z", d), "skip");
  assert.equal(made, 1);
  assert.equal(calls.length, 0); // no batch sent to B
  assert.equal(await setUpOwnInstitute({}, "x@y.z", d), "skip"); // a plain login
  assert.equal(made, 1);
});

test("the sign-up form on an account that already owns a centre opens it instead of renaming or listing a second", () => {
  assert.equal(ownsInstitute([{ role: "teacher" }, { role: "owner" }]), true);
  assert.equal(ownsInstitute([{ role: "teacher" }, { role: "guardian" }]), false);
  assert.equal(ownsInstitute(null), false);
});

test("an owner who teaches at B sends the sign-up form: opened through /auth/continue as Institute, so the B pick is forgotten", () => {
  const kept = {};
  const go = openOwnCentre({ setItem: (k, v) => (kept[k] = v) });
  assert.equal(go, "/auth/continue"); // not /institute with the B cookie still set
  const wanted = kept["classbari-wanted-role"];
  assert.equal(wanted, "institute");
  const home = homeFor(["teacher", "owner"], wanted);
  assert.equal(home.path, "/institute");
  assert.equal(forgetsPickedInstitute(home.uiRole, wanted), true);
});

test("a retry of the first batch never locks out an owner, and a centre is set up only once", async () => {
  const owner = [{ role: "owner", institute_id: "MINE" }];
  const meta = { signup_kind: "institute", full_name: "Rahim" };
  const answers = (post) => ({ access: async () => owner, create: async () => ({ error: null }), fetch: async (u, i = {}) => (i.method === "POST" ? post : { ok: true, json: async () => ({ role: "owner", state: blankState() }) }) });
  assert.equal(await setUpOwnInstitute(meta, "r@x.y", answers({ ok: false, status: 403 })), "skip"); // suspended centre: they still get in and see the notice
  const notJson = { access: async () => owner, create: async () => ({ error: null }), fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError("not JSON"); } }) };
  assert.equal(await setUpOwnInstitute(meta, "r@x.y", notJson), "skip");
  // Just created and the batch failed: still "failed", so they know.
  let rows = [];
  const fresh = { ...answers({ ok: false, status: 503 }), access: async () => rows, create: async () => ((rows = owner), { error: null }) };
  assert.equal(await setUpOwnInstitute(meta, "r@x.y", fresh), "failed");
  // Two devices at once: the server takes the first signUpTeacher and refuses the second.
  const who = { role: "owner", name: "Rahim", email: "r@x.y", studentIds: [] };
  const args = [{ institute: "", name: "Rahim", phone: "", batch: "Batch 1", days: "", classDays: [], subject: "", fee: 0 }];
  const once = runAction(blankState(), "signUpTeacher", checkAction("signUpTeacher", args, who, blankState()), 1_700_000_000_000);
  assert.throws(() => checkAction("signUpTeacher", args, who, once), Refused);
  assert.throws(() => checkAction("signUpTeacher", [{ ...args[0], name: "" }], who, runAction(blankState(), "signUpTeacher", [{ ...args[0], name: "" }], 1)), Refused); // blank name: its batch still counts
});
