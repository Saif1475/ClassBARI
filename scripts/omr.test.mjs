// Run: npm test — "photographs" synthetic filled OMR sheets (tilted, noisy, on a dark table) and reads them back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUBBLE_R, MARK, MARKS, PAGE, homography, parseKey, questionBubble, readSheet, rollBubble, setBubble } from "../src/lib/omr.ts";

/** Paper as seen in the photo: corners of the sheet land at `corners` (TL, TR, BL, BR) in a w×h photo. */
function photo({ w = 1000, h = 1400, corners, filled, faint = [], table = 70 }) {
  const toSheet = homography(corners, [{ x: 0, y: 0 }, { x: PAGE.w, y: 0 }, { x: 0, y: PAGE.h }, { x: PAGE.w, y: PAGE.h }]);
  const bubbles = filled.map((b) => ({ ...b, ink: 40 })).concat(faint.map((b) => ({ ...b, ink: 160 })));
  const data = new Uint8Array(w * h);
  let seed = 1;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 30;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = toSheet({ x, y });
      let v = table;
      if (p.x >= 0 && p.y >= 0 && p.x <= PAGE.w && p.y <= PAGE.h) {
        v = 230 - p.x / 10; // uneven light across the page
        if (MARKS.some(([mx, my]) => p.x >= mx && p.x <= mx + MARK && p.y >= my && p.y <= my + MARK)) v = 20;
        if (p.y > 20 && p.y < 40 && p.x > 30 && p.x < 150 && Math.floor(p.x) % 3 === 0) v = 60; // header text
        for (const b of bubbles) {
          const d = Math.hypot(p.x - b.x, p.y - b.y);
          if (d < BUBBLE_R * 0.95) v = Math.min(v, b.ink);
        }
      }
      data[y * w + x] = Math.max(0, Math.min(255, v + noise()));
    }
  return { data, w, h };
}

const answers = [0, 3, 1, 2, 2, 0, 1, 3, 0, 0, 1, 2, 3, 3, 0, 1, 2, 0, 1, 1, 2, 3, 0, 1, 2, 3, 3, 0, 1, 2]; // 30 questions
const filledFor = (roll, set, ans) => [
  ...String(roll).padStart(4, "0").split("").map((d, col) => rollBubble(col, Number(d))),
  setBubble(set),
  ...ans.flatMap((a, q) => (a === null ? [] : [questionBubble(q, a)])),
];

test("reads roll, set and answers from a tilted photo on a dark table", () => {
  const ans = [...answers];
  ans[5] = null; // left blank
  const g = photo({ corners: [{ x: 90, y: 110 }, { x: 900, y: 70 }, { x: 70, y: 1300 }, { x: 940, y: 1330 }], filled: filledFor(37, 2, ans) });
  const r = readSheet(g, 30);
  assert.ok(r, "sheet found");
  assert.equal(r.roll, 37);
  assert.equal(r.set, 2);
  assert.deepEqual(r.answers, ans);
  assert.deepEqual(r.unclear, []);
});

test("two marks on one question, or a faint mark, are flagged for the teacher", () => {
  const ans = [...answers];
  ans[7] = null;
  const filled = filledFor(5, 0, ans);
  filled.push(questionBubble(3, 0)); // second mark on question 4
  const g = photo({ corners: [{ x: 60, y: 60 }, { x: 940, y: 60 }, { x: 60, y: 1340 }, { x: 940, y: 1340 }], filled, faint: [questionBubble(7, 1)], table: 200 });
  const r = readSheet(g, 30);
  assert.deepEqual(r.unclear, [3, 7]); // two marks; faint (half-rubbed-out) mark
  assert.equal(r.answers[3], null);
  assert.equal(r.answers[7], null);
  assert.equal(r.roll, 5);
});

test("no corner squares in the photo -> null (ask for a better photo)", () => {
  const data = new Uint8Array(400 * 600).fill(220);
  assert.equal(readSheet({ data, w: 400, h: 600 }, 10), null);
});

test("answer key text", () => {
  assert.deepEqual(parseKey("a b d, c"), [0, 1, 3, 2]);
  assert.equal(parseKey("ABE"), null);
});
