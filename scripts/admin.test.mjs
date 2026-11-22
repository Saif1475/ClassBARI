// Run: npm test — admin panel controls: AI settings (defaults, validation, effect) and suspending an institute.
import assert from "node:assert/strict";
import { test } from "node:test";
import { adminAction, defaultPlatform, isSuspended } from "../src/lib/platform.ts";
import { aiDefaults, freePlan, modelMenu, modelOn, monthlyBudgetUsd, packMonthlyUsd, packPlan, windowCostUsd } from "../src/lib/ai-chat.ts";

const now = new Date("2026-11-23T10:00:00Z");
const ID = "0b5c3f7e-1a2b-4c3d-8e9f-0123456789ab";

test("no AI settings: everything is what the code and .env.local say", () => {
  const p = defaultPlatform();
  assert.deepEqual(p.ai, {});
  assert.deepEqual(packPlan(400, p.ai), packPlan(400));
  assert.deepEqual(freePlan(p.ai), { pack: 0, daily: 20_000, models: ["qwen3.7-flash"] });
  assert.equal(windowCostUsd(150, p.ai), windowCostUsd(150));
  assert.equal(monthlyBudgetUsd(p.ai), aiDefaults().budgetUsd);
  assert.equal(aiDefaults().packDaily[1500], 200_000);
});

test("AI settings are validated, logged, take effect, and null goes back to the default", () => {
  const p = defaultPlatform();
  const ai = (b) => adminAction(p, { type: "ai", ...b }, now);
  assert.deepEqual(ai({ key: "budgetUsd", value: 50 }), { ok: true });
  assert.equal(monthlyBudgetUsd(p.ai), 50);
  assert.deepEqual(ai({ key: "budgetUsd", value: -1 }), { error: "bad AI setting" });
  assert.deepEqual(ai({ key: "budgetUsd", value: "50" }), { error: "bad AI setting" });
  assert.deepEqual(ai({ key: "costShare", value: 0.5 }), { error: "bad AI setting" }); // replaced by monthly caps
  assert.deepEqual(ai({ key: "packMonthlyUsd", pack: 999, value: 1 }), { error: "bad cap" });
  assert.deepEqual(ai({ key: "packMonthlyUsd", pack: 400, value: -1 }), { error: "bad cap" });
  assert.deepEqual(ai({ key: "__proto__", value: 1 }), { error: "bad AI setting" });
  assert.deepEqual(ai({ key: "freeDaily", value: 1.5 }), { error: "bad AI setting" });
  assert.deepEqual(ai({ key: "packDaily", pack: 999, value: 1000 }), { error: "bad tokens" });
  assert.deepEqual(ai({ key: "model", id: "gpt-9", value: false }), { error: "bad model" });
  assert.deepEqual(ai({ key: "provider", id: "evil", value: false }), { error: "bad provider" });

  ai({ key: "packDaily", pack: 400, value: 60_000 });
  assert.equal(packPlan(400, p.ai).daily, 60_000);
  ai({ key: "packDaily", pack: 400, value: null });
  assert.equal(packPlan(400, p.ai).daily, 100_000);
  ai({ key: "freeOn", value: false });
  assert.deepEqual(freePlan(p.ai).models, []);
  ai({ key: "freeWindowUsd", value: 0.01 });
  assert.equal(windowCostUsd(0, p.ai), 0.01);
  ai({ key: "packMonthlyUsd", pack: 400, value: 3 });
  assert.equal(packMonthlyUsd(400, p.ai), 3);
  // The margin and dollar rate drive the caps; a cap typed by hand still wins for its pack.
  assert.deepEqual(ai({ key: "packMargin", value: 0.99 }), { error: "bad AI setting" });
  assert.deepEqual(ai({ key: "usdToBdt", value: 5 }), { error: "bad AI setting" });
  ai({ key: "packMargin", value: 0.5 });
  ai({ key: "usdToBdt", value: 125 });
  assert.equal(packMonthlyUsd(800, p.ai), 3.2); // 800 × 50% ÷ 125
  assert.equal(packMonthlyUsd(400, p.ai), 3); // set by hand above
  assert.equal(aiDefaults(p.ai).packMonthlyUsd[1500], 6); // what the panel shows: 1500 × 50% ÷ 125

  ai({ key: "budgetUsd", value: null });
  assert.equal(p.ai.budgetUsd, undefined);
  assert.equal(p.audit.length, 9); // only the accepted changes are logged
  assert.ok(p.audit.every((a) => a.action === "ai"));
});

test("models and providers switched off are hidden from the picker and never picked", () => {
  const p = defaultPlatform();
  adminAction(p, { type: "ai", key: "model", id: "claude-haiku-5-5", value: false }, now);
  assert.ok(!modelOn("claude-haiku-5-5", p.ai));
  assert.ok(!packPlan(400, p.ai).models.includes("claude-haiku-5-5"));
  assert.ok(!modelMenu(400, p.ai).some((m) => m.id === "claude-haiku-5-5"));
  adminAction(p, { type: "ai", key: "provider", id: "qwen", value: false }, now);
  assert.ok(packPlan(1500, p.ai).models.every((id) => !id.startsWith("qwen")));
  assert.deepEqual(freePlan(p.ai).models, []); // the free model is Qwen
  adminAction(p, { type: "ai", key: "provider", id: "qwen", value: true }, now);
  adminAction(p, { type: "ai", key: "model", id: "claude-haiku-5-5", value: true }, now);
  assert.deepEqual(packPlan(1500, p.ai), packPlan(1500));
});

test("a suspended institute is refused saving until unsuspended; bad ids are refused", () => {
  const p = defaultPlatform();
  assert.equal(isSuspended(p, ID), false);
  assert.deepEqual(adminAction(p, { type: "suspend", id: ID, name: "Alpha", on: true }, now), { ok: true });
  adminAction(p, { type: "suspend", id: ID, on: true }, now); // twice: listed once
  assert.deepEqual(p.suspended, [ID]);
  assert.equal(isSuspended(p, ID), true);
  assert.equal(isSuspended(p, "another"), false);
  assert.deepEqual(adminAction(p, { type: "suspend", id: ID, on: false }, now), { ok: true });
  assert.equal(isSuspended(p, ID), false);
  assert.deepEqual(adminAction(p, { type: "suspend", id: "x", on: true }, now), { error: "bad institute" });
  assert.match(p.audit.at(-1).detail, /Alpha: suspended/);
});

test("subscriptions: plan and paid-until are checked and logged", () => {
  const p = defaultPlatform();
  assert.deepEqual(adminAction(p, { type: "sub", id: ID, name: "Alpha", plan: "pro" }, now), { ok: true });
  assert.deepEqual(adminAction(p, { type: "sub", id: ID, paidUntil: "2027-01-31" }, now), { ok: true });
  assert.deepEqual(p.subs[ID], { plan: "pro", paidUntil: "2027-01-31" });
  assert.deepEqual(adminAction(p, { type: "sub", id: ID, plan: "gold" }, now), { error: "bad plan" });
  assert.deepEqual(adminAction(p, { type: "sub", id: ID, paidUntil: "soon" }, now), { error: "bad date" });
  assert.match(p.audit[0].detail, /plan=pro, paid until 2027-01-31/);
});
