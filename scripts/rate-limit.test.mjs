// Run: npm test — the request limiter and the "uploaded files never open as a web page" rule.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, tooMany } from "../src/lib/rate-limit.ts";
import { safeBlob, uploadData, uploadPaper } from "../src/lib/files.ts";

test("the limiter allows `max` per window, then refuses until the window ends", () => {
  const key = `t:${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(tooMany(key, 3, 1000, 0), false);
  assert.equal(tooMany(key, 3, 1000, 500), true);
  assert.equal(tooMany(key, 3, 1000, 500, 0), true); // looking doesn't reset it
  assert.equal(tooMany(key, 3, 1000, 1001), false); // new window
  assert.equal(tooMany(`other:${Math.random()}`, 3, 1000, 0, 0), false); // looking at an unknown key counts nothing
});

test("the visitor's address comes from Cloudflare first, but only behind Cloudflare", () => {
  const req = (h) => new Request("http://x/", { headers: h });
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "9.9.9.9"); // a made-up header is ignored
  process.env.BEHIND_CLOUDFLARE = "1";
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  delete process.env.BEHIND_CLOUDFLARE;
  for (const made of ["1.1.1.1", "2.2.2.2, 3.3.3.3"]) assert.equal(clientIp(req({ "x-forwarded-for": `${made}, 5.6.7.8` })), "5.6.7.8"); // only the last entry is our proxy's: a made-up first one must not give a fresh limit
  assert.equal(clientIp(req({})), "local");
  // every address in one IPv6 /64 shares one limit, also written short with "::"
  for (const ip of ["2400:c600:1:2::a", "2400:c600:1:2:ffff:1:2:3", "2400:C600:0001:0002::b"]) assert.equal(clientIp(req({ "x-forwarded-for": ip })), "2400:c600:1:2::/64");
  for (const ip of ["2400:c600::1", "2400:c600::2", "2400:c600:0:0:5::"]) assert.equal(clientIp(req({ "x-forwarded-for": ip })), "2400:c600:0:0::/64");
  assert.equal(clientIp(req({ "x-forwarded-for": "::ffff:1.2.3.4" })), "::ffff:1.2.3.4");
});

test("uploaded web pages and SVGs become plain downloads; pictures, PDFs, video and sound stay", () => {
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", ""]) assert.equal(safeBlob(new Blob(["x"], { type })).type, "application/octet-stream", type);
  for (const type of ["image/png", "image/jpeg", "application/pdf", "video/mp4", "audio/webm;codecs=opus"]) assert.equal(safeBlob(new Blob(["x"], { type })).type, type, type);
});

test("a flood of new keys keeps the site working and never lets admin guesses go uncounted", () => {
  const now = 10_000_000, old = `admin-fail:old:${Math.random()}`, user = `data:user:${Math.random()}`;
  for (let i = 0; i < 3; i++) tooMany(old, 3, 60_000, now);
  tooMany(user, 60, 1000, now);
  for (let i = 0; i < 50_002; i++) tooMany(`public-read:${i}:${Math.random()}`, 240, 60_000, now);
  assert.equal(tooMany(old, 3, 60_000, now), true); // an existing admin-guess counter survives the flood
  assert.equal(tooMany(user, 60, 1000, now + 2000), false); // a user whose window ended is not refused
  assert.equal(tooMany(`new:${Math.random()}`, 3, 60_000, now), false); // nor is a brand-new visitor
  // isAdmin's pattern for an address with no counter yet: look, then count a wrong guess
  const key = `admin-fail:new:${Math.random()}`;
  let allowed = 0;
  for (let i = 0; i < 100; i++) if (!tooMany(key, 20, 900_000, now, 0)) { allowed++; tooMany(key, 20, 900_000, now); }
  assert.equal(allowed, 21); // counted, so it locks out (21 = the 20 allowed wrong tries plus the one that crosses the limit)
});

test("when admin-guess counters themselves fill up, a new address is refused, even when only looking", () => {
  const now = 20_000_000;
  for (let i = 0; i < 50_000; i++) tooMany(`admin-fail:f:${i}:${Math.random()}`, 20, 900_000, now);
  assert.equal(tooMany(`admin-fail:x:${Math.random()}`, 20, 900_000, now, 0), true);
  assert.equal(tooMany(`public-read:x:${Math.random()}`, 240, 60_000, now), false); // other limits are unaffected
});

test("a small HEIC/AVIF/BMP homework photo is sent as JPEG, which the server takes; a PNG or PDF goes as it is", async () => {
  const drawn = [];
  globalThis.createImageBitmap = async (f) => (drawn.push(f.name), { width: 400, height: 300 });
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: (type) => `data:${type};base64,AA` }) };
  globalThis.FileReader ??= class { readAsDataURL(b) { b.arrayBuffer().then((a) => { this.result = `data:${b.type};base64,${Buffer.from(a).toString("base64")}`; this.onload(); }); } };
  for (const [name, type] of [["a.heic", "image/heic"], ["b.avif", "image/avif"], ["c.bmp", "image/bmp"], ["d.heic", ""]]) assert.match(await uploadData(new File(["x"], name, { type })), /^data:image\/jpeg;/, name);
  assert.equal(await uploadData(new File(["x"], "e.png", { type: "image/png" })), "data:image/png;base64,eA==");
  assert.equal(await uploadData(new File(["x"], "f.pdf", { type: "application/pdf" })), "data:application/pdf;base64,eA==");
  assert.deepEqual(drawn, ["a.heic", "b.avif", "c.bmp", "d.heic"]);
  globalThis.createImageBitmap = async () => { throw new Error("can't decode"); };
  assert.equal(await uploadData(new File(["x"], "g.heic", { type: "image/heic" })), null); // the screen then asks for a JPEG or PNG
  assert.equal(await uploadPaper(new File(["x"], "g.heic", { type: "image/heic" })), "data:image/heic;base64,eA=="); // a teacher's paper is kept as it was before
});
