// OMR (bubble answer sheet) layout and reader. Pure code: used by the printable sheet, the scanner,
// and scripts/omr.test.mjs (which "photographs" synthetic sheets). All sheet sizes are in millimetres (A4).
//
// Reading a photo: find the 4 black corner squares -> work out how the paper sits in the photo
// (a perspective transform, so tilted photos work) -> measure how dark each bubble is.

export const PAGE = { w: 210, h: 297 };
export const MARK = 8; // corner square size
export const MARKS = [
  [10, 10],
  [PAGE.w - 10 - MARK, 10],
  [10, PAGE.h - 10 - MARK],
  [PAGE.w - 10 - MARK, PAGE.h - 10 - MARK],
] as const; // top-left corners: TL, TR, BL, BR
export const BUBBLE_R = 2.2;
export const OPTIONS = ["A", "B", "C", "D"];
export const MAX_QUESTIONS = 100;
export const ROLL_DIGITS = 4;
const ROWS = 25; // questions per column

export const rollBubble = (col: number, digit: number) => ({ x: 24 + col * 7, y: 58 + digit * 6 });
export const setBubble = (k: number) => ({ x: 82 + k * 9, y: 58 });
export const questionBubble = (q: number, opt: number) => ({ x: 26 + Math.floor(q / ROWS) * 46 + opt * 7, y: 128 + (q % ROWS) * 6.2 });

type Pt = { x: number; y: number };
export type Gray = { data: Uint8Array | Uint8ClampedArray; w: number; h: number }; // one byte per pixel, 0 = black
export type OmrResult = {
  roll: number | null;
  set: number | null; // 0..3 = A..D
  answers: (number | null)[]; // chosen option, or null when blank / unclear
  unclear: number[]; // questions with two marks or a faint mark: the teacher should check these
};

/** Browser photo pixels (RGBA) -> gray. */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return { data, w, h };
}

function otsu(g: Gray) {
  const hist = new Array(256).fill(0);
  for (const v of g.data) hist[v]++;
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) [best, thr] = [between, t];
  }
  return thr;
}

/** Centres of the 4 corner squares (TL, TR, BL, BR), or null if they can't all be found. */
export function findMarks(g: Gray): Pt[] | null {
  // Work on a small copy: fast, and blurs away paper texture.
  const k = Math.max(1, Math.floor(Math.max(g.w, g.h) / 700));
  const w = Math.floor(g.w / k), h = Math.floor(g.h / k);
  const small = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += g.data[(y * k + dy) * g.w + x * k + dx];
      small[y * w + x] = s / (k * k);
    }
  const thr = otsu({ data: small, w, h });
  const seen = new Uint8Array(w * h);
  const blobs: { cx: number; cy: number; area: number; fill: number; aspect: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || small[i] > thr) continue;
    let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % w, y = (j - x) / w;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const n of [j - 1, j + 1, j - w, j + w]) {
        if (n < 0 || n >= w * h || seen[n] || small[n] > thr) continue;
        if ((n === j - 1 && x === 0) || (n === j + 1 && x === w - 1)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (area < 30 || x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1) continue; // edge = table/background, not the sheet
    blobs.push({ cx: (sx / area) * k + k / 2, cy: (sy / area) * k + k / 2, area, fill: area / (bw * bh), aspect: bw / bh });
  }
  // Corner squares: solid (a filled round bubble is only ~78% of its box), square-ish, and the biggest such shapes.
  const squares = blobs.filter((b) => b.fill > 0.8 && b.aspect > 0.6 && b.aspect < 1.65).sort((a, b) => b.area - a.area).slice(0, 4);
  if (squares.length < 4 || squares[3].area < squares[0].area * 0.4) return null;
  const pts = squares.map((b) => ({ x: b.cx, y: b.cy }));
  const by = (f: (p: Pt) => number) => pts.reduce((a, b) => (f(b) < f(a) ? b : a));
  const tl = by((p) => p.x + p.y), br = by((p) => -(p.x + p.y)), tr = by((p) => p.y - p.x), bl = by((p) => p.x - p.y);
  return new Set([tl, tr, bl, br]).size === 4 ? [tl, tr, bl, br] : null;
}

/** Perspective transform taking sheet millimetres to photo pixels, from 4 point pairs. */
export function homography(src: Pt[], dst: Pt[]) {
  const A: number[][] = [];
  src.forEach((s, i) => {
    const d = dst[i];
    A.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y, d.x]);
    A.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y, d.y]);
  });
  for (let c = 0; c < 8; c++) {
    const p = A.slice(c).reduce((best, row, i) => (Math.abs(row[c]) > Math.abs(A[best][c]) ? c + i : best), c);
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return (p: Pt): Pt => {
    const z = h[6] * p.x + h[7] * p.y + 1;
    return { x: (h[0] * p.x + h[1] * p.y + h[2]) / z, y: (h[3] * p.x + h[4] * p.y + h[5]) / z };
  };
}

const markCentres = MARKS.map(([x, y]) => ({ x: x + MARK / 2, y: y + MARK / 2 }));

/** 0 (white) … 1 (black): average darkness inside a bubble, ignoring its printed ring. */
function darkness(g: Gray, map: (p: Pt) => Pt, c: Pt) {
  let s = 0, n = 0;
  const r = BUBBLE_R * 0.6;
  for (let dy = -r; dy <= r; dy += r / 4)
    for (let dx = -r; dx <= r; dx += r / 4) {
      if (dx * dx + dy * dy > r * r) continue;
      const p = map({ x: c.x + dx, y: c.y + dy });
      const x = Math.round(p.x), y = Math.round(p.y);
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      s += g.data[y * g.w + x];
      n++;
    }
  return n ? 1 - s / n / 255 : 0;
}

/** Pick one bubble out of a group: index, null (blank) or "unclear" (two marks / faint mark). */
function choose(levels: number[]): number | null | "unclear" {
  const order = levels.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const [top, second] = [order[0][0], order[1]?.[0] ?? 0];
  if (top < 0.3) return null;
  if (top < 0.5 || second > 0.45) return "unclear";
  return order[0][1];
}

export function readSheet(g: Gray, questions: number): OmrResult | null {
  const marks = findMarks(g);
  if (!marks) return null;
  const map = homography(markCentres, marks);
  let roll: number | null = 0;
  for (let col = 0; col < ROLL_DIGITS; col++) {
    const d = choose([...Array(10).keys()].map((digit) => darkness(g, map, rollBubble(col, digit))));
    roll = typeof d === "number" && roll !== null ? roll * 10 + d : null;
  }
  const s = choose(OPTIONS.map((_, k) => darkness(g, map, setBubble(k))));
  const answers: (number | null)[] = [];
  const unclear: number[] = [];
  for (let q = 0; q < questions; q++) {
    const c = choose(OPTIONS.map((_, o) => darkness(g, map, questionBubble(q, o))));
    if (c === "unclear") unclear.push(q);
    answers.push(typeof c === "number" ? c : null);
  }
  return { roll, set: typeof s === "number" ? s : null, answers, unclear };
}

/** "ABDC…" -> [0,1,3,2,…]; null when a letter isn't A–D. */
export function parseKey(text: string): number[] | null {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, "").split("");
  const key = letters.map((l) => OPTIONS.indexOf(l));
  return key.length && key.every((k) => k >= 0) ? key : null;
}
