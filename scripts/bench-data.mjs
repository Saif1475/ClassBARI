// A big made-up institute for speed checks (scripts/bench.mjs): the same data every run.
import { blankState } from "../src/lib/lms-actions.ts";

export const N = 2000, BATCHES = 40;
const NOON = new Date().setHours(12, 0, 0, 0); // fixed for the whole day, so two runs build exactly the same data
export const day = (back) => new Date(NOON - back * 86_400_000);
export const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let id = 1_700_000_000_000;
const rnd = (() => { let x = 12345; return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296); })(); // same data every run

export function bigState() {
  const s = blankState();
  s.teacherName = "Owner Sir";
  s.staff = Array.from({ length: BATCHES }, (_, i) => ({ name: i ? `Teacher ${i}` : "Owner Sir", phone: "01711000000", salary: 10000, share: 10, email: `t${i}@example.com` }));
  s.batches = Array.from({ length: BATCHES }, (_, b) => ({ id: `batch-${b}`, name: `Batch ${b}`, short: "B", days: "Sat", classDays: [6, 1, 3], fee: 1000, lateFine: 50, teacher: s.staff[b].name }));
  s.students = Array.from({ length: N }, (_, i) => ({ id: i + 1, name: `Student ${i + 1}`, email: `s${i + 1}@gmail.com`, guardianName: `Guardian ${i + 1}`, guardianEmail: `g${i + 1}@gmail.com`, phone: "01711000001", mode: "offline", batch: `Batch ${i % BATCHES}`, feeDue: i % 3 ? 0 : 1000, ch4Score: 0, ch3Score: 0 }));
  const inBatch = (b) => s.students.filter((x) => x.batch === `Batch ${b}`).map((x) => x.id);
  s.modules = [];
  for (let b = 0; b < BATCHES; b++) {
    const ids = inBatch(b);
    for (let m = 0; m < 8; m++) {
      const items = [];
      for (let k = 0; k < 6; k++) {
        const kind = ["video", "pdf", "quiz", "quiz", "quiz", "task"][k];
        const it = { id: ++id, kind, title: `Item ${k}`, meta: "", done: false, doneBy: ids.filter(() => rnd() < 0.7), dueDate: key(day(-m)) };
        if (kind === "quiz") {
          it.points = 10;
          it.questions = Array.from({ length: 10 }, (_, q) => ({ q: `Question ${q}?`, options: ["a", "b", "c", "d"], answer: q % 4, topic: `Topic ${q % 5}` }));
          it.scores = Object.fromEntries(ids.map((sid) => [sid, Math.floor(rnd() * 11)]));
          it.answers = Object.fromEntries(ids.map((sid) => [sid, Array.from({ length: 10 }, () => rnd() < 0.6)]));
        }
        if (kind === "task") it.submissions = Object.fromEntries(ids.map((sid) => [sid, { fileName: "hw.jpg", file: "/api/files/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-00000000" + String(sid).padStart(4, "0"), at: day(1).toISOString(), grade: Math.floor(rnd() * 21) }]));
        items.push(it);
      }
      s.modules.push({ id: ++id, batch: `Batch ${b}`, title: `Chapter ${m}`, tag: "new", published: true, items });
    }
  }
  s.attendance = Object.fromEntries(Array.from({ length: 200 }, (_, d) => [key(day(d)), s.students.filter(() => rnd() < 0.05).map((x) => x.id)]));
  s.payments = Array.from({ length: N * 6 }, (_, i) => ({ id: ++id, studentId: (i % N) + 1, batch: `Batch ${(i % N) % BATCHES}`, amount: 1000, at: day(i % 180).toISOString(), method: "cash" }));
  s.xp = Object.fromEntries(s.students.map((x) => [x.id, Object.fromEntries(Array.from({ length: 30 }, (_, d) => [key(day(d)), Math.floor(rnd() * 60)]))]));
  s.friendships = Array.from({ length: 3000 }, (_, i) => ({ from: (i % N) + 1, to: ((i * 7 + 13) % N) + 1, status: i % 5 ? "friends" : "pending" })).filter((f) => f.from !== f.to);
  s.community = Array.from({ length: 800 }, (_, i) => ({ id: ++id, author: (i % N) + 1, text: `Post ${i} about #topic${i % 9} and waves`, at: day(i % 60).toISOString(), likes: Array.from({ length: i % 12 }, (_, k) => k + 1), comments: Array.from({ length: i % 4 }, (_, k) => ({ id: ++id, author: k + 1, text: "nice", at: day(1).toISOString() })), reports: [], audience: ["all", "batch", "friends"][i % 3], batch: `Batch ${(i % N) % BATCHES}` }));
  s.communityProfiles = Object.fromEntries(s.students.slice(0, 300).map((x) => [x.id, { bio: "hi", muted: [5, 9], blocked: [7] }]));
  s.staffPayments = Array.from({ length: 200 }, (_, i) => ({ name: s.staff[i % BATCHES].name, month: key(day(0)).slice(0, 7), amount: 500 }));
  s.feeMonth = key(day(0)).slice(0, 7);
  return s;
}
