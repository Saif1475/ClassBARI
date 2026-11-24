// Run: npm test
// The fast versions of the hot paths must give exactly what the plain, obvious versions give.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { canSee, seer } from "../src/lib/community.ts";
import { topId } from "../src/lib/data-access.ts";
import { BACKUP_MAX, DOC_MAX, FULL, MAX_FILE_BYTES, POST_MAX, fileTooBig, guardedFetch, postLimit, readCapped } from "../src/lib/doc-limit.ts";
import nextConfig from "../next.config.ts";
import { blankState } from "../src/lib/lms-actions.ts";
import { averagePct, gradedResults, incomeByMonth, myRank, quizBoard } from "../src/lib/lms-views.ts";
import { meritList } from "../src/lib/quiz.ts";
import { PAGE_SIZES, pageAt, pageNumbers } from "../src/lib/paging.ts";
import { bigState, day, key } from "./bench-data.mjs";

const s = bigState();
const round = (a, b) => Math.round((a / b) * 100);

test("merit list: rank and percentile match counting everyone above and below, with ties", () => {
  const scores = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [i + 1, (i * 37) % 23])); // many equal marks
  const all = Object.values(scores);
  const fast = meritList(scores);
  assert.equal(fast.length, all.length);
  for (const r of fast) {
    assert.equal(r.rank, all.filter((v) => v > r.score).length + 1);
    assert.equal(r.percentile, round(all.filter((v) => v < r.score).length, all.length - 1));
    assert.equal(r.of, all.length);
  }
  assert.deepEqual(meritList({ 7: 12 }), [{ id: 7, score: 12, rank: 1, of: 1, percentile: 100 }]);
  assert.deepEqual(meritList({}), []);
  // One student's rank (worked out without ranking everybody) is the same row of the full list.
  const quiz = { id: 1, kind: "quiz", title: "", meta: "", done: false, scores };
  for (const r of fast.filter((_, i) => i % 40 === 0)) assert.deepEqual(myRank(quiz, r.id), r);
  assert.equal(myRank(quiz, 9999), undefined);
  // The board is the same marks high to low, each with the student's name.
  assert.deepEqual(quizBoard(quiz, s.students), fast.map((r) => ({ id: r.id, name: s.students.find((x) => x.id === r.id)?.name ?? "—", score: r.score })));
});

test("average mark: one pass gives what marking every student one by one gives", () => {
  const mods = s.modules.slice(0, 12);
  const ids = s.students.filter((x) => x.id % 3 === 0).map((x) => x.id);
  const pcts = ids.flatMap((id) => gradedResults(mods, id).map((r) => r.pct));
  assert.ok(pcts.length > 0);
  assert.equal(averagePct(mods, ids), Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length));
  assert.equal(averagePct(mods, []), null);
  assert.equal(averagePct([], ids), null);
});

test("income table: each cell is the sum of that month's (and batch's) payments", () => {
  const months = [0, 31, 62].map((back) => key(day(back)).slice(0, 7));
  const names = ["Batch 0", "Batch 7", "No such batch"];
  const income = incomeByMonth(s.payments, months, names);
  const monthOf = (p) => key(new Date(p.at)).slice(0, 7);
  for (const m of months) {
    for (const b of names) assert.equal(income(m, b), s.payments.filter((p) => p.batch === b && monthOf(p) === m).reduce((t, p) => t + p.amount, 0));
    assert.equal(income(m), s.payments.filter((p) => names.includes(p.batch) && monthOf(p) === m).reduce((t, p) => t + p.amount, 0));
  }
  assert.equal(income("1999-01"), 0);
});

test("community: checking a whole feed at once agrees with checking each post", () => {
  for (const viewer of [{ student: 41, batch: "Batch 0" }, { student: 2, batch: "Batch 1" }, { staff: true }]) {
    const sees = seer(viewer, s.friendships, s.communityProfiles);
    for (const p of s.community) assert.equal(sees(p), canSee(p, viewer, s.friendships, s.communityProfiles));
  }
});

test("a new empty institute is its own copy: changing one never changes the next", () => {
  const a = blankState();
  a.students.push({ id: 1 });
  a.batches.push({ id: 2 });
  a.attendance["2026-01-01"] = {};
  a.site.headline = "changed";
  const b = blankState();
  assert.equal(b.students.length, 0);
  assert.equal(b.batches.length, 0);
  assert.deepEqual(b.attendance, {});
  assert.notEqual(b.site.headline, "changed");
});

test("highest id in the data: the quick scan finds what walking every record finds", () => {
  let top = 0;
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (!Array.isArray(v) && Number.isInteger(v.id)) top = Math.max(top, v.id);
    for (const x of Object.values(v)) walk(x);
  };
  walk(s);
  assert.equal(topId(s), top);
  assert.equal(topId({}), 0);
});

test("an institute's data over the size limit is refused before it is sent; everything else goes through", async () => {
  const real = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (input) => (sent.push(String(input)), new Response("[]", { headers: { "content-type": "application/json" } }));
  try {
    const db = createClient("http://localhost:9", "test-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guardedFetch } });
    const big = await db.from("institute_data").update({ state: "x".repeat(DOC_MAX + 1) }).eq("institute_id", "a");
    assert.ok(big.error?.message.includes(FULL));
    assert.equal(sent.length, 0); // never left the server
    const small = await db.from("institute_data").update({ state: "x" }).eq("institute_id", "a");
    assert.equal(small.error, null);
    await db.from("answers").insert({ text: "x".repeat(DOC_MAX + 1) }); // the limit is only for institute data
    assert.equal(sent.length, 2);
  } finally {
    globalThis.fetch = real;
  }
});

test("a request body is read only up to its limit, even when it was sent in chunks with no length", async () => {
  const chunked = (n) => new Request("http://x/", { method: "POST", body: new ReadableStream({ pull(c) { n-- > 0 ? c.enqueue(new Uint8Array(1000).fill(97)) : c.close(); } }), duplex: "half" });
  assert.equal(await readCapped(chunked(50), 20_000), null); // 50 kB, no Content-Length
  assert.equal((await readCapped(chunked(3), 20_000))?.length, 3000);
  assert.equal(await readCapped(new Request("http://x/", { method: "POST", body: "{}" }), 20_000), "{}");
});

test("long lists: page sizes, the page you are on, and which page numbers are offered", () => {
  assert.deepEqual(PAGE_SIZES, [10, 20, 50, 100]);
  assert.deepEqual(pageAt(2000, 20, 1), { pages: 100, page: 1 });
  assert.deepEqual(pageAt(45, 20, 3), { pages: 3, page: 3 });
  assert.deepEqual(pageAt(45, 20, 9), { pages: 3, page: 3 }); // the list got shorter: the last page, not an empty one
  assert.deepEqual(pageAt(0, 10, 1), { pages: 1, page: 1 });
  assert.deepEqual(pageAt(45, 20, -4), { pages: 3, page: 1 });
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageNumbers(1, 100), [1, 2, 0, 100]); // 0 is the gap "…"
  assert.deepEqual(pageNumbers(50, 100), [1, 0, 49, 50, 51, 0, 100]);
  assert.deepEqual(pageNumbers(100, 100), [1, 0, 99, 100]);
  assert.deepEqual(pageNumbers(2, 100), [1, 2, 3, 0, 100]);
  // Every row is on exactly one page.
  for (const size of PAGE_SIZES) {
    const rows = Array.from({ length: 237 }, (_, i) => i);
    const seen = [];
    for (let p = 1; p <= pageAt(rows.length, size, 1).pages; p++) seen.push(...rows.slice((p - 1) * size, p * size));
    assert.deepEqual(seen, rows);
  }
});

test("upload slot: only a sent size that is too big is refused; old tabs that send no body still upload", () => {
  assert.equal(fileTooBig(""), false); // old file-store.ts: POST with no body
  assert.equal(fileTooBig("{}"), false);
  assert.equal(fileTooBig(JSON.stringify({ size: 5 })), false);
  assert.equal(fileTooBig(JSON.stringify({ size: MAX_FILE_BYTES + 1 })), true);
  assert.equal(fileTooBig(null), true); // body over the read cap
});

test("restore: a backup of a full institute fits through the proxy and the data route", async () => {
  // A full institute that is all Bangla, at DOC_MAX characters: the worst case in bytes (3 per character, escaping adds nothing).
  const state = { ...blankState(), instituteName: "অ".repeat(DOC_MAX - 2000) };
  assert.ok(JSON.stringify(state).length <= DOC_MAX);
  const post = JSON.stringify({ name: "importBackup", args: [JSON.stringify({ app: "instanton", state })], base: 1 });
  const send = (body) => new Request("http://x/", { method: "POST", body, headers: { "content-length": String(Buffer.byteLength(body)) } });
  assert.ok(Buffer.byteLength(post) > POST_MAX * 4);
  assert.equal((await readCapped(send(post), postLimit("owner")))?.length, post.length, "the owner's restore is read whole");
  assert.equal((await readCapped(send(post), postLimit("manager")))?.length, post.length);
  for (const role of ["teacher", "student", "guardian"]) assert.equal(await readCapped(send(post), postLimit(role)), null, `${role}: only owners and managers may send a restore`);
  // A full institute of quotes, the worst ASCII case (each is 2 characters stored, 4 bytes once escaped again), also fits.
  const quotes = { ...s, instituteName: '"'.repeat(Math.floor((DOC_MAX - JSON.stringify(s).length) / 2) - 1000) };
  assert.ok(JSON.stringify(quotes).length <= DOC_MAX);
  const ascii = JSON.stringify({ name: "importBackup", args: [JSON.stringify({ app: "instanton", state: quotes })], base: 1 });
  assert.equal((await readCapped(send(ascii), postLimit("owner")))?.length, ascii.length);
  assert.equal(postLimit("teacher"), POST_MAX);
  assert.ok(Number(nextConfig.experimental?.proxyClientMaxBodySize) >= BACKUP_MAX, "the proxy must not cut a restore short (Next's default is 10 MiB)");
});
