// Run: npm run test:lessons     (the website must be running on port 3000, and `npm run test:accounts` done)
// Puts a few sample lessons into the ClassBARI Test Institute, so the website and the phone apps have something to
// show: a chapter with a video, two quizzes and two homeworks, a notice, meeting slots, one marked attendance day,
// one homework handed in, one quiz taken and a guardian–teacher chat. Safe to run again: it adds nothing twice.
// It logs in as the test teacher, student and guardian, like a person would (scripts/test-login.mjs).
import sharp from "sharp";
import { as, finish, INSTITUTE } from "./test-login.mjs";

const BATCH = "Teacher Batch", CHAPTER = "Chapter 1: Motion";
const day = (n) => new Date(Date.now() + n * 86_400_000);
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (n, h, m) => { const d = day(n); d.setHours(h, m, 0, 0); return d.toISOString(); };

const teacher = await as("teacher");
let state = await teacher.data();
let chapter = state.modules.find((m) => m.batch === BATCH && m.title === CHAPTER);
const did = [];
if (!chapter) {
  state = await teacher.send("addModule", [CHAPTER, BATCH]);
  const id = state.modules.find((m) => m.batch === BATCH && m.title === CHAPTER).id;
  const q = (text, options) => ({ q: text, options, answer: 0 }); // the first option is the right one
  for (const item of [
    { kind: "video", title: "Speed and velocity", meta: "12 min", url: "https://www.youtube.com/results?search_query=speed+and+velocity+class+9" },
    { kind: "quiz", title: "Quiz: Units", meta: "3 questions", points: 3, dueDate: key(day(-2)), questions: [q("The SI unit of speed is", ["m/s", "km", "s", "m/s²"]), q("Which one is a vector?", ["Velocity", "Speed", "Distance", "Time"]), q("1 km equals", ["1000 m", "100 m", "10 m", "1 m"])] },
    { kind: "quiz", title: "Quiz: Motion basics", meta: "3 questions", points: 3, dueDate: key(day(2)), shuffle: true, questions: [q("A car moves 100 m in 20 s. Its speed is", ["5 m/s", "20 m/s", "2000 m/s", "0.2 m/s"]), q("Acceleration is the rate of change of", ["velocity", "distance", "mass", "time"]), q("A body at rest has a velocity of", ["0", "1 m/s", "9.8 m/s", "10 m/s"])] },
    { kind: "task", title: "Homework 1: 5 sums on speed", meta: "Send a photo of your work", points: 20, dueDate: key(day(-1)) },
    { kind: "task", title: "Homework 2: Draw a distance–time graph", meta: "Send a photo of your work", points: 20, dueDate: key(day(3)) },
  ]) state = await teacher.send("addModuleItem", [id, item]);
  state = await teacher.send("addAnnouncement", [{ title: "Class test on Sunday", body: "Chapter 1: Motion. Bring your calculator and admit card.", batch: BATCH }]);
  state = await teacher.send("addMeetingSlots", [[{ start: at(2, 17, 0), minutes: 15, teacher: "Test Teacher", batch: BATCH }, { start: at(2, 17, 15), minutes: 15, teacher: "Test Teacher", batch: BATCH }]]);
  state = await teacher.send("markAllPresent", [state.students.filter((s) => s.batch === BATCH).map((s) => s.id), key(day(0))]);
  did.push("a chapter with 5 lessons, a notice, 2 meeting slots and today's attendance");
  chapter = state.modules.find((m) => m.id === id);
}
const item = (title) => chapter.items.find((it) => it.title.startsWith(title));

const student = await as("student");
let mine = await student.data();
const me = mine.meId;
const find = (title) => mine.modules.find((m) => m.id === chapter.id)?.items.find((it) => it.title.startsWith(title));
if (find("Quiz: Units")?.scores?.[me] === undefined) {
  await student.send("startQuiz", [chapter.id, item("Quiz: Units").id, me]);
  mine = await student.send("submitQuiz", [chapter.id, item("Quiz: Units").id, me, 0, [], 0, [0, 0, 2]]); // two right, one wrong
  did.push("the student took a quiz");
}
if (!find("Homework 1")?.submissions?.[me]) {
  const page = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#fffdf5"/><g font-family="DejaVu Sans, Arial" font-size="26" fill="#1c3d6e"><text x="40" y="70" font-size="30" font-weight="bold">Homework 1 — Test Student</text><text x="40" y="150">1)  v = d / t = 100 / 20 = 5 m/s</text><text x="40" y="220">2)  d = v × t = 12 × 30 = 360 m</text><text x="40" y="290">3)  t = d / v = 450 / 15 = 30 s</text><text x="40" y="360">4)  72 km/h = 20 m/s</text><text x="40" y="430">5)  average speed = 240 / 60 = 4 m/s</text></g></svg>`;
  const photo = `data:image/png;base64,${(await sharp(Buffer.from(page)).png().toBuffer()).toString("base64")}`;
  await student.send("submitAssignment", [chapter.id, item("Homework 1").id, me, { fileName: "homework-1.png", file: photo }]);
  did.push("the student handed in a homework photo");
}

const guardian = await as("guardian");
const theirs = await guardian.data();
if (!theirs.chats.find((c) => c.id === `parent-${me}`)?.messages.length) {
  await guardian.send("sendParentMessage", [me, "Assalamu alaikum. Is there a class tomorrow?"]);
  await teacher.send("sendChatMessage", [`parent-${me}`, "Test Teacher", "Wa alaikum assalam. Yes, at 5 pm as usual.", false]);
  did.push("the guardian and the teacher exchanged a message");
}
await finish();
console.log(did.length ? `Added to ${INSTITUTE}: ${did.join("; ")}.` : `${INSTITUTE} already has its sample lessons. Nothing added.`);
