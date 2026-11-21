// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { addTicket, adminAction, defaultPlatform, overview, publicView, registerInstitute } from "../src/lib/platform.ts";

const now = new Date("2026-11-19T10:00:00Z");

test("sign-ups start as a 30-day free trial; bad input and closed sign-ups are refused", () => {
  const p = defaultPlatform();
  const inst = registerInstitute(p, { name: "Alpha", owner: "Rahim", phone: "01711111111", email: "Rahim@Gmail.com" }, "i1", now);
  assert.equal(inst.plan, "free");
  assert.equal(inst.status, "trial");
  assert.equal(inst.trialEnds, "2026-12-19");
  assert.equal(inst.email, "rahim@gmail.com");
  assert.deepEqual(registerInstitute(p, { name: "", owner: "x", phone: "1" }, "i2", now), { error: "invalid" });
  p.flags.signups = false;
  assert.deepEqual(registerInstitute(p, { name: "B", owner: "x", phone: "1" }, "i3", now), { error: "signups closed" });
  assert.equal(p.institutes.length, 1);
});

test("admin changes are validated and logged", () => {
  const p = defaultPlatform();
  registerInstitute(p, { name: "Alpha", owner: "Rahim", phone: "01711111111" }, "i1", now);
  assert.deepEqual(adminAction(p, { type: "institute", id: "i1", plan: "pro", status: "active" }, now), { ok: true });
  assert.deepEqual(adminAction(p, { type: "institute", id: "i1", plan: "platinum" }, now), { error: "bad plan" });
  assert.deepEqual(adminAction(p, { type: "institute", id: "nope", status: "active" }, now), { error: "not found" });
  assert.deepEqual(adminAction(p, { type: "flag", key: "rm -rf", on: false }, now), { error: "bad flag" });
  assert.deepEqual(adminAction(p, { type: "price", plan: "pro", amount: -5 }, now), { error: "bad price" });
  assert.equal(p.audit.length, 1);
  assert.match(p.audit[0].detail, /Alpha: plan=pro, status=active/);
});

test("overview: income counts only active institutes at their plan's price", () => {
  const p = defaultPlatform();
  for (const [id, plan, status] of [["a", "pro", "active"], ["b", "basic", "active"], ["c", "pro", "trial"], ["d", "pro", "suspended"]]) {
    registerInstitute(p, { name: id, owner: "o", phone: "1" }, id, now);
    adminAction(p, { type: "institute", id, plan, status }, now);
  }
  adminAction(p, { type: "price", plan: "pro", amount: 3000 }, now);
  adminAction(p, { type: "price", plan: "basic", amount: 1000 }, now);
  const o = overview(p, now);
  assert.equal(o.monthlyIncome, 4000);
  assert.deepEqual(o.byStatus, { active: 2, trial: 1, suspended: 1 });
  assert.equal(o.trialsEndingSoon, 0);
});

test("support tickets; the public view hides private data", () => {
  const p = defaultPlatform();
  assert.equal(addTicket(p, { name: "Kamal", contact: "01711111111", role: "guardian", message: "Can't pay" }, "t1", now).status, "open");
  assert.deepEqual(addTicket(p, { name: "K", contact: "", message: "x" }, "t2", now), { error: "invalid" });
  adminAction(p, { type: "broadcast", on: true, level: "warning", en: "Maintenance tonight", bn: "আজ রাতে রক্ষণাবেক্ষণ" }, now);
  const pub = publicView(p);
  assert.deepEqual(Object.keys(pub).sort(), ["broadcast", "flags", "maintenance"]);
  assert.equal(pub.broadcast.en, "Maintenance tonight");
});

test("SMS: only Bangladeshi mobiles, de-duplicated, within the daily limit and switch", async () => {
  const { checkSms, logSms } = await import("../src/lib/platform.ts");
  const p = defaultPlatform();
  assert.deepEqual(checkSms(p, ["+8801711-234511", "01711234511"], "Fee due", now), { numbers: ["01711234511"], text: "Fee due" });
  assert.deepEqual(checkSms(p, ["0123"], "x", now), { error: "bad number" });
  assert.deepEqual(checkSms(p, [], "x", now), { error: "bad recipients" });
  assert.deepEqual(checkSms(p, ["01711234511"], "x".repeat(481), now), { error: "bad text" });
  p.smsDailyLimit = 2;
  logSms(p, [{ at: now.toISOString(), to: "01711234511", text: "a", status: "sent" }, { at: now.toISOString(), to: "01711234512", text: "a", status: "failed" }]);
  assert.ok("numbers" in checkSms(p, ["01811111111"], "x", now)); // failed ones don't count
  assert.deepEqual(checkSms(p, ["01811111111", "01911111111"], "x", now), { error: "daily limit reached" });
  // One institute has its own smaller limit inside the site's.
  const q = defaultPlatform();
  q.smsDailyLimit = 5000;
  logSms(q, Array.from({ length: 150 }, () => ({ at: now.toISOString(), to: "01711234511", text: "a", status: "sent", inst: "A" })));
  assert.deepEqual(checkSms(q, ["01811111111"], "x", now, "A"), { error: "daily limit reached" });
  assert.ok("numbers" in checkSms(q, ["01811111111"], "x", now, "B"));
  p.flags.sms = false;
  assert.deepEqual(checkSms(p, ["01811111111"], "x", now), { error: "switched off" });
});

test("push: valid subscriptions only, one per browser, targeted by batch, daily limit", async () => {
  const { addPushSub, pushTargets, PUSH_DAILY_LIMIT } = await import("../src/lib/platform.ts");
  const p = defaultPlatform();
  const sub = (endpoint) => ({ subscription: { endpoint, keys: { p256dh: "k", auth: "a" } }, role: "parent", batches: ["HSC A"] });
  assert.deepEqual(addPushSub(p, sub("https://fcm.googleapis.com/x"), now), { ok: true });
  assert.deepEqual(addPushSub(p, sub("https://fcm.googleapis.com/x"), now), { ok: true }); // same browser again
  assert.deepEqual(addPushSub(p, sub("http://evil/x"), now), { error: "bad subscription" });
  assert.deepEqual(addPushSub(p, sub("https://internal.example/x"), now), { error: "bad subscription" }); // not a browser push service
  assert.deepEqual(addPushSub(p, { ...sub("https://updates.push.services.mozilla.com/b"), role: "teacher" }, now), { error: "bad role" });
  assert.equal(p.push.length, 1);
  assert.equal(pushTargets(p, "HSC A", now).length, 1);
  assert.equal(pushTargets(p, "SSC B", now).length, 0);
  p.pushSent.count = PUSH_DAILY_LIMIT;
  assert.deepEqual(pushTargets(p, "HSC A", now), { error: "daily limit reached" });
  assert.equal(pushTargets(p, "HSC A", new Date("2026-11-20T10:00:00Z")).length, 1); // new day
});
