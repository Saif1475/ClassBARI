// Speed check on a big made-up institute (2,000 students, 40 batches, ~1,900 lessons and tests).
//   node --experimental-strip-types --no-warnings scripts/bench.mjs [out.json]
// Prints the median time of each hot path; with a file name it also saves the numbers (to compare before / after a change).
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { checkAction, publicView, rosterOf, runAction, viewFor } from "../src/lib/data-access.ts";
import { blankState, rollFees } from "../src/lib/lms-actions.ts";
import { leagueRank, monthAttendance, myRank, payroll, quizBoard, topicMastery } from "../src/lib/lms-views.ts";
import { meritList } from "../src/lib/quiz.ts";
import { timeline, trending } from "../src/lib/community.ts";
import { topicOf } from "../src/lib/chat-topics.ts";
import { fmtAgo, fmtDate, fmtTime } from "../src/lib/dates.ts";

import { bigState, day, key, N, BATCHES } from "./bench-data.mjs";

const s = bigState();
const student = { role: "student", name: "", studentIds: [41] };
const guardian = { role: "guardian", name: "", studentIds: [41, 81] };
const teacher = { role: "teacher", name: "Teacher 1", studentIds: [], email: "t1@example.com" };
const owner = { role: "owner", name: "Owner Sir", studentIds: [] };
const myMod = s.modules.find((m) => m.batch === "Batch 0"); // student 41 is in batch 0
const quiz = myMod.items.find((it) => it.kind === "quiz");
const bigScores = Object.fromEntries(s.students.map((x) => [x.id, (x.id * 37) % 101]));
const bigQuiz = { ...quiz, scores: bigScores };
const month = key(day(0)).slice(0, 7);
const batchIds = s.students.filter((x) => x.batch === "Batch 1").map((x) => x.id);
const questions = Array.from({ length: 300 }, (_, i) => ["Explain Newton's second law with an example", "তরঙ্গের বেগ কীভাবে বের করব?", "integrate x sin x please step by step", "How does photosynthesis work in plants?", "hello there my friend"][i % 5]);
const stamps = Array.from({ length: 2000 }, (_, i) => day(i % 90).toISOString());

const tests = {
  "Save: whole institute to text (JSON.stringify)": () => JSON.stringify(s),
  "Save: one student ticks a lesson (runAction)": () => runAction(s, "toggleItemDone", [myMod.id, quiz.id, 41], Date.now()),
  "Save: did the sign-in list change? (roster check)": () => JSON.stringify(rosterOf(s)) !== JSON.stringify(rosterOf(s)),
  "View: what a student receives": () => viewFor(s, student),
  "View: what a guardian receives": () => viewFor(s, guardian),
  "View: what a teacher receives": () => viewFor(s, teacher),
  "View: what the owner receives": () => viewFor(s, owner),
  "File: may this student open this file?": () => JSON.stringify(viewFor(s, student)).includes('"/api/files/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000041"'),
  // As the files route does it now: one look per login per minute, then each further file is a set look-up.
  "File: 20 photos on one page": () => {
    const links = new Set();
    for (const m of JSON.stringify(viewFor(s, student)).matchAll(/"(\/api\/files\/[0-9a-f-]{36}\/[0-9a-f-]{36})"/g)) links.add(m[1]);
    for (let i = 0; i < 20; i++) links.has("/api/files/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000041");
  },
  "Public page: what a visitor receives": () => publicView(s, true),
  "Check: teacher marks a batch present": () => checkAction("markAllPresent", [batchIds], teacher, s),
  "Check: student likes a post": () => checkAction("toggleLike", [s.community[0].id, 41], student, s),
  "Fees: monthly roll (rollFees)": () => rollFees(s),
  "Merit list of 2,000 marks": () => meritList(bigScores),
  "One student's rank among 2,000": () => myRank(bigQuiz, 41),
  "Quiz board of 2,000 with names": () => quizBoard(bigQuiz, s.students),
  "Payroll for the month": () => payroll(s, month),
  "Attendance this month, every student": () => s.students.map((x) => monthAttendance(s.attendance, x.id, [6, 1, 3])),
  "Weekly league place, one student": () => leagueRank(s.students, s.xp, 41),
  "Topic mastery of one batch": () => topicMastery(s.modules.filter((m) => m.batch === "Batch 1"), batchIds),
  "Community feed for a student": () => timeline(s.community, s.friendships, s.communityProfiles, { student: 41, batch: "Batch 0" }),
  "Community trending tags": () => trending(s.community),
  "Sort 300 chats into topic folders": () => questions.map(topicOf),
  "Format 2,000 dates and times": () => stamps.map((x) => fmtAgo(x, "en") + fmtDate(x, "bn") + fmtTime(x, "en")),
  "Empty institute template x1000": () => { for (let i = 0; i < 1000; i++) blankState(); },
};

const out = { docMB: +(JSON.stringify(s).length / 1e6).toFixed(2) };
console.log(`Institute: ${N} students, ${BATCHES} batches, ${s.modules.length * 6} lessons and tests, ${out.docMB} MB of data\n`);
for (const [name, fn] of Object.entries(tests)) {
  fn(); // warm up
  const runs = [];
  const budget = performance.now() + 1500;
  while (runs.length < 5 || (runs.length < 40 && performance.now() < budget)) {
    const t = performance.now();
    fn();
    runs.push(performance.now() - t);
  }
  runs.sort((a, b) => a - b);
  out[name] = +runs[runs.length >> 1].toFixed(3);
  console.log(`${String(out[name].toFixed(2)).padStart(10)} ms  ${name}`);
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
