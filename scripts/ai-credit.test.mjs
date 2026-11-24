// Run: npm test — extra AI credit (migration 0016) on real Postgres (PGlite): the ledger, refunds, the check, and
// allowance() paying past the daily limit from credit. No AI is called; answers are counted with made-up costs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { allowance, answerMaxUsd, creditKey } from "../src/lib/ai-allowance.ts";
import { budgetPaused, creditTaka, creditUsd, aiWindow } from "../src/lib/ai-chat.ts";
import { changeCredit, creditHistory } from "../src/lib/ai-credit.ts";
import { checkPayment } from "../src/lib/pay.ts";

const pg = new PGlite();
const sql = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
let inst = "";

/** Just enough of the Supabase client (from/select/eq/…/maybeSingle, rpc) over PGlite, as the server uses it. */
function query(table) {
  const where = [], args = [];
  let cols = "*", order = "", limit = "";
  const q = {
    select: (c) => ((cols = c), q),
    eq: (c, v) => (args.push(v), where.push(`${c} = $${args.length}`), q),
    in: (c, v) => (args.push(v), where.push(`${c} = any($${args.length})`), q),
    gte: (c, v) => (args.push(v), where.push(`${c} >= $${args.length}`), q),
    lte: (c, v) => (args.push(v), where.push(`${c} <= $${args.length}`), q),
    order: (c, o) => ((order = ` order by ${c}${o?.ascending === false ? " desc" : ""}`), q),
    limit: (n) => ((limit = ` limit ${Number(n)}`), q),
    run: async () => (await pg.query(`select ${cols} from ${table}${where.length ? ` where ${where.join(" and ")}` : ""}${order}${limit}`, args)).rows,
    maybeSingle: async () => ({ data: (await q.run())[0] ?? null, error: null }),
    then: (ok, bad) => q.run().then((data) => ({ data, error: null })).then(ok, bad),
  };
  return q;
}
const db = {
  from: query,
  rpc: async (fn, a = {}) => {
    const keys = Object.keys(a);
    try {
      const { rows, fields } = await pg.query(`select * from ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`, keys.map((k) => a[k]));
      return { data: fields.length === 1 && fields[0].name === fn ? rows[0][fn] : rows, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  },
};
const balance = async (key) => Number((await pg.query("select usd from ai_credit where user_key = $1", [key])).rows[0]?.usd ?? 0);
const logged = async (key) => Number((await pg.query("select coalesce(sum(usd), 0) as s from ai_credit_log where user_key = $1", [key])).rows[0].s);
const pay = async (amount) => (await pg.query("insert into pay_requests (institute_id, payer_email, payer_role, kind, item, student_id, months, amount, method, sender, trx_id, status) values ($1, 's@gmail.com', 'student', 'ai_credit', $2, 1, 1, $3, 'bkash', '01712345678', $4, 'approved') returning id", [inst, String(amount), amount, `T${Math.random().toString(36).slice(2, 10).toUpperCase()}`])).rows[0].id;

before(async () => {
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`);
  for (const m of ["0001_institutes.sql", "0006_ai_usage.sql", "0007_ai_tokens.sql", "0013_ai_usage_add.sql", "0015_payments.sql", "0016_ai_credit.sql"]) await pg.exec(await sql(m));
  inst = (await pg.query("insert into institutes (name) values ('Alpha') returning id")).rows[0].id;
});

test("credit: ৳ → US$ keeps the margin; the amount is whole taka from ৳50 to ৳5,000, set by the server", () => {
  assert.equal(creditUsd(50), 0.245902); // 50 × 0.6 ÷ 122
  assert.equal(creditUsd(1000, { packMargin: 0.5, usdToBdt: 125 }), 4);
  assert.equal(creditTaka(creditUsd(50)), 50);
  assert.ok(creditUsd(500) * 122 <= 500 * 0.6 + 1e-9); // at least 40% of the money is ours
  const ok = { kind: "ai_credit", method: "nagad", sender: "01712345678", trxId: "9A1B2C3D4E", months: 12, amount: 1 };
  assert.deepEqual(checkPayment({ ...ok, item: "50" }, {}), { kind: "ai_credit", item: "50", months: 1, amount: 50, method: "nagad", sender: "01712345678", trxId: "9A1B2C3D4E" });
  assert.equal(checkPayment({ ...ok, item: "5000" }, {}).amount, 5000);
  for (const item of ["49", "5001", "50.5", "1e2", "-60", "", "abc"]) assert.ok("error" in checkPayment({ ...ok, item }, {}), item);
});

test("balance always equals the sum of its log: purchase, spend, admin add/remove, refund", async () => {
  const key = `${inst}:student:1`;
  const p = await pay(500);
  await changeCredit(db, { key, institute: inst, kind: "purchase", usd: creditUsd(500), taka: 500, payId: p });
  await changeCredit(db, { key, institute: inst, kind: "spend", usd: -0.1, day: "2026-11-23" });
  await changeCredit(db, { key, institute: inst, kind: "admin_add", usd: 0.5, taka: 100, note: "sorry for the outage", by: "admin" });
  await changeCredit(db, { key, institute: inst, kind: "admin_remove", usd: -0.2, taka: 40, note: "mistake", by: "admin" });
  const r = await changeCredit(db, { key, institute: inst, kind: "refund", usd: 0, payId: p });
  assert.equal(r.usd, -creditUsd(500)); // enough left: the whole purchase comes back
  assert.equal(r.taka, 500);
  assert.equal(await balance(key), await logged(key));
  assert.ok(Math.abs((await balance(key)) - (0.5 - 0.1 - 0.2)) < 1e-9);
  assert.deepEqual((await db.rpc("ai_credit_check")).data, []);
  const t = (await db.rpc("ai_credit_totals", { since: "2000-01-01T00:00:00+06:00" })).data; // the admin's month figures
  assert.equal(Number(t.takaSold), 500);
  assert.ok(Math.abs(t.usdSpent - 0.1) < 1e-9 && Math.abs(t.usdOutstanding - 0.2) < 1e-9);
});

test("approving the same payment twice adds the credit once", async () => {
  const key = `${inst}:student:2`;
  const p = await pay(100);
  await changeCredit(db, { key, institute: inst, kind: "purchase", usd: creditUsd(100), taka: 100, payId: p });
  const again = await changeCredit(db, { key, institute: inst, kind: "purchase", usd: creditUsd(100), taka: 100, payId: p });
  assert.equal(again.usd, 0);
  assert.equal(await balance(key), creditUsd(100));
  assert.equal((await pg.query("select count(*)::int as n from ai_credit_log where pay_request_id = $1", [p])).rows[0].n, 1);
});

test("a refund takes back at most the unused credit, and only once", async () => {
  const key = `${inst}:student:3`;
  const p = await pay(200);
  const usd = creditUsd(200);
  await changeCredit(db, { key, institute: inst, kind: "purchase", usd, taka: 200, payId: p });
  await changeCredit(db, { key, institute: inst, kind: "spend", usd: -usd / 4, day: "2026-11-23" }); // a quarter used
  const r = await changeCredit(db, { key, institute: inst, kind: "refund", usd: 0, payId: p });
  assert.ok(Math.abs(r.usd + usd * 0.75) < 1e-9);
  assert.equal(r.taka, 150); // three quarters of ৳200 to give back
  assert.equal(await balance(key), 0);
  await assert.rejects(changeCredit(db, { key, institute: inst, kind: "refund", usd: 0, payId: p }), /already refunded/);
  await assert.rejects(changeCredit(db, { key: `${inst}:student:99`, institute: inst, kind: "refund", usd: 0, payId: p }), /no such purchase/); // not someone else's
  assert.equal(await balance(key), await logged(key));
});

test("spending: one row per student per Dhaka day, added to; never below zero", async () => {
  const key = `${inst}:student:4`;
  await changeCredit(db, { key, institute: inst, kind: "admin_add", usd: 0.05, note: "test", by: "admin" });
  await changeCredit(db, { key, institute: inst, kind: "spend", usd: -0.01, day: "2026-11-23" });
  await changeCredit(db, { key, institute: inst, kind: "spend", usd: -0.01, day: "2026-11-23" });
  await changeCredit(db, { key, institute: inst, kind: "spend", usd: -0.01, day: "2026-11-24" });
  const rows = (await pg.query("select day::text, usd from ai_credit_log where user_key = $1 and kind = 'spend' order by day", [key])).rows;
  assert.deepEqual(rows.map((r) => [r.day, Number(r.usd)]), [["2026-11-23", -0.02], ["2026-11-24", -0.01]]);
  const last = await changeCredit(db, { key, institute: inst, kind: "spend", usd: -1, day: "2026-11-24" }); // costs more than is left
  assert.equal(last.balance, 0);
  assert.ok(Math.abs(last.usd + 0.02) < 1e-9);
  assert.equal(await balance(key), await logged(key));
  await assert.rejects(changeCredit(db, { key, institute: inst, kind: "spend", usd: 1 }), /negative/); // spending can't add
});

test("students see only their own history; clients can't read the tables or run the functions", async () => {
  const mine = await creditHistory(db, `${inst}:student:2`, {});
  assert.deepEqual(mine.map((r) => [r.kind, r.taka]), [["purchase", 100]]);
  for (const stmt of ["select * from ai_credit_log", "select * from ai_credit", `select ai_credit_change('${inst}:student:1', '${inst}', 'admin_add', 100)`, "select * from ai_credit_check()"]) {
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      try {
        await assert.rejects(pg.query(stmt), /permission denied/, `${role}: ${stmt}`);
      } finally {
        await pg.exec("reset role");
      }
    }
  }
});

test("the check reports a balance that differs from its log, and fixes nothing", async () => {
  const key = `${inst}:student:2`;
  await pg.query("update ai_credit set usd = usd + 1 where user_key = $1", [key]); // injected by hand
  const { data } = await db.rpc("ai_credit_check");
  assert.equal(data.length, 1);
  assert.equal(data[0].user_key, key);
  assert.equal(Number(data[0].balance) - Number(data[0].logged), 1);
  assert.equal((await db.rpc("ai_credit_check")).data.length, 1); // still there: never auto-fixed
  await pg.query("update ai_credit set usd = usd - 1 where user_key = $1", [key]);
});

test("allowance: past the daily limit only with credit, which pays the real cost; the budget pause still wins", async () => {
  const plan = { pack: 0, daily: 20_000 };
  const key = `${inst}:student:5`;
  const { day, slot } = aiWindow();
  await pg.query("insert into ai_usage (user_key, day, slot, institute_id, questions, cost_usd, tokens) values ($1, $2, $3, $4, 9, 0.002, 20000)", [key, day, slot, inst]); // today's tokens used up
  let a = await allowance(db, key, inst, plan);
  assert.equal(a.over, true); // no credit: refused
  assert.equal(a.paying, false);

  await changeCredit(db, { key, institute: inst, kind: "admin_add", usd: 0.0001, note: "test", by: "admin" });
  assert.equal((await allowance(db, key, inst, plan)).over, true); // a crumb of credit can't buy a whole answer
  await changeCredit(db, { key, institute: inst, kind: "admin_add", usd: 0.0399, note: "test", by: "admin" });
  a = await allowance(db, key, inst, plan);
  assert.equal(a.over, false);
  assert.equal(a.paying, true);
  assert.equal(a.left(), 0);
  await a.record(0.004, 3000);
  assert.ok(Math.abs((await balance(key)) - 0.036) < 1e-9);
  assert.equal(a.creditTk(0.004), creditTaka(0.036));
  // Paid from credit: counted for the site's budget under its own key, not as today's (or tomorrow's) overuse.
  assert.equal(Number((await pg.query("select tokens from ai_usage where user_key = $1 and day = $2", [key, day])).rows[0].tokens), 20000);
  assert.equal(Number((await pg.query("select cost_usd from ai_usage where user_key = $1", [creditKey(key)])).rows[0].cost_usd), 0.004);

  a = await allowance(db, key, inst, plan);
  await a.record(0.05, 3000); // the last answer costs more than is left: the balance stops at 0
  assert.equal(await balance(key), 0);
  assert.equal(await balance(key), await logged(key));
  assert.equal((await allowance(db, key, inst, plan)).over, true);

  // Credit never gets past the site's monthly budget: the pause depends on the spending only.
  assert.equal(budgetPaused(24, { budgetUsd: 30 }, 0), true); // free: stops at 80%
  assert.equal(budgetPaused(24, { budgetUsd: 30 }, 150), false);
  assert.equal(budgetPaused(30, { budgetUsd: 30 }, 150), true);
});

test("allowance: credit must cover the dearest answer of the chosen model, not just US$0.03", async () => {
  const plan = { pack: 1500, daily: 200_000 };
  const key = `${inst}:student:6`;
  const { day, slot } = aiWindow();
  await pg.query("insert into ai_usage (user_key, day, slot, institute_id, questions, cost_usd, tokens) values ($1, $2, $3, $4, 9, 0.01, 200000)", [key, day, slot, inst]); // today's tokens used up
  await changeCredit(db, { key, institute: inst, kind: "admin_add", usd: 0.04, note: "test", by: "admin" });
  const max = answerMaxUsd("qwen3.8-max", 6000, 60_000); // a thinking answer with a 30,000-letter file: 12,000 output tokens at US$6/M and more
  assert.ok(max > 0.08);
  assert.equal((await allowance(db, key, inst, plan, {}, undefined, max)).over, true); // US$0.04 can't pay for it
  assert.equal((await allowance(db, key, inst, plan, {}, undefined, answerMaxUsd("qwen3.7-flash", 6000, 60_000))).paying, true); // a cheap model still can
});
