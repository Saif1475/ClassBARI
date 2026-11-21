import assert from "node:assert/strict";
import { test } from "node:test";
import { unkind } from "../src/lib/word-filter.ts";

test("abusive words are caught in English, Bangla and Banglish, with common disguises", () => {
  for (const bad of ["you are a bitch", "FUCK this", "f@ck off", "f*ck", "f.u.c.k you", "sh1t", "fuuuuck", "tui ekta harami", "shala chor", "তুই একটা হারামি", "কুত্তার বাচ্চা", "go kill yourself", "madarchod", "চুদিরভাই"]) assert.equal(unkind(bad), true, bad);
});

test("ordinary study talk is not caught", () => {
  for (const ok of [
    "Does anyone have the page number for the pendulum practice problems?",
    "Balance this chemical equation please",
    "The assignment class starts at 5, bring your basic notes",
    "Scunthorpe is a town; analysis of the passage",
    "Sexual reproduction in plants is in chapter 4",
    "আজকে পদার্থবিজ্ঞান ক্লাস কয়টায়?",
    "বালতি ভর্তি পানি নিয়ে পরীক্ষা করো",
    "ধন্যবাদ ভাই, অনেক উপকার হলো",
    "salam, kemon acho? balance sheet ta dao",
    "Read pages 12-15. Then do e.g. question 3_a",
    "",
  ])
    assert.equal(unkind(ok), false, ok);
});
