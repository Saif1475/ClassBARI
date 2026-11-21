// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractKeywords, keySentences } from "../src/lib/keywords.ts";

const physics = `Simple harmonic motion is a periodic motion. In simple harmonic motion the acceleration is proportional to displacement.
The time period of a simple pendulum is T = 2π√(L/g). The time period does not depend on the mass of the bob.
Energy in simple harmonic motion keeps changing between kinetic energy and potential energy. The weather was nice today.`;

test("finds repeated phrases and words, skips filler", () => {
  const terms = extractKeywords(physics).map((k) => k.term);
  assert.ok(terms.includes("simple harmonic"), terms.join(","));
  assert.ok(terms.includes("time period"), terms.join(","));
  assert.ok(terms.includes("energy"), terms.join(","));
  for (const filler of ["the", "is", "and", "of"]) assert.ok(!terms.includes(filler));
});

test("key sentences favour formulas and keywords, keep reading order, drop off-topic lines", () => {
  const kw = extractKeywords(physics);
  const s = keySentences(physics, kw, 3);
  assert.equal(s.length, 3);
  assert.ok(s.some((x) => x.includes("T = 2π")));
  assert.ok(!s.some((x) => x.includes("weather")));
  assert.ok(physics.indexOf(s[0]) < physics.indexOf(s[1]));
});

test("works for Bangla text", () => {
  const bn = "সরল ছন্দিত স্পন্দন একটি পর্যায়বৃত্ত গতি। সরল ছন্দিত স্পন্দন গতিতে ত্বরণ সরণের সমানুপাতিক। এই গতিকে সরল ছন্দিত স্পন্দন বলে।";
  const terms = extractKeywords(bn).map((k) => k.term);
  assert.ok(terms.some((t) => t.includes("ছন্দিত")), terms.join(","));
  assert.ok(!terms.includes("এই"));
  assert.ok(keySentences(bn, extractKeywords(bn), 2).length > 0);
});

test("empty text gives nothing", () => {
  assert.deepEqual(extractKeywords(""), []);
  assert.deepEqual(keySentences("", []), []);
});
