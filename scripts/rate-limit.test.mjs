// Run: npm test — the request limiter and the "uploaded files never open as a web page" rule.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, tooMany } from "../src/lib/rate-limit.ts";
import { safeBlob } from "../src/lib/files.ts";

test("the limiter allows `max` per window, then refuses until the window ends", () => {
  const key = `t:${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(tooMany(key, 3, 1000, 0), false);
  assert.equal(tooMany(key, 3, 1000, 500), true);
  assert.equal(tooMany(key, 3, 1000, 500, 0), true); // looking doesn't reset it
  assert.equal(tooMany(key, 3, 1000, 1001), false); // new window
  assert.equal(tooMany(`other:${Math.random()}`, 3, 1000, 0, 0), false); // looking at an unknown key counts nothing
});

test("the visitor's address comes from Cloudflare first", () => {
  const req = (h) => new Request("http://x/", { headers: h });
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(clientIp(req({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })), "5.6.7.8");
  assert.equal(clientIp(req({})), "local");
});

test("uploaded web pages and SVGs become plain downloads; pictures, PDFs, video and sound stay", () => {
  for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", ""]) assert.equal(safeBlob(new Blob(["x"], { type })).type, "application/octet-stream", type);
  for (const type of ["image/png", "image/jpeg", "application/pdf", "video/mp4", "audio/webm;codecs=opus"]) assert.equal(safeBlob(new Blob(["x"], { type })).type, type, type);
});
