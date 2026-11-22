// Run: npm run flutter:gen   (after changing wording in src/lib/i18n, or any helper used below)
// The Flutter apps (flutter/) show the website's own words and must work out the same answers as the website.
// Writes  flutter/assets/gen/en.json, bn.json   the words (text functions become "{0}" templates)
//         flutter/assets/gen/shared.json        chat topic keywords and pack prices
//         flutter/test/fixtures.json            answers from the website's own code; `flutter test` checks the Dart copies against them
import { mkdirSync, writeFileSync } from "node:fs";
import { PACKS } from "../src/lib/ai-chat.ts";
import { topicOf, WEIGHT, WORDS } from "../src/lib/chat-topics.ts";
import { dayKey } from "../src/lib/dates.ts";
import bn from "../src/lib/i18n/bn.ts";
import en from "../src/lib/i18n/en.ts";
import { ICONS } from "../src/lib/icon-set.ts";
import { gradedResults, monthAttendance } from "../src/lib/lms-views.ts";
import { taka } from "../src/lib/mock-data.ts";
import { pageNumbers } from "../src/lib/paging.ts";
import { findInText } from "../src/lib/pdf-insights.ts";
import { quizOrder } from "../src/lib/quiz.ts";
import { validateStudent } from "../src/lib/site.ts";
import { streak, totalXp, weekXp } from "../src/lib/xp.ts";

const SECTIONS = ["app", "auth", "aichat", "pdfhl", "pager", "roster", "kid", "tday", "glance", "streak", "settings", "pay", "batch", "doubts", "practice", "skills", "video", "community", "parent", "fees", "teacher", "fee", "att", "income", "money", "admissions", "staffTool", "payroll", "exam", "quiz", "rubric", "merit", "bank", "watch", "routine"];
const SINGLE = ["notify.title", "notify.help", "notify.open", "notify.groups.classwork", "notify.groups.results", "notify.groups.notices", "notify.groups.ai", "notify.groups.attendance", "notify.groups.fees", "notify.groups.messages", "notify.groups.work", "common.loading", "common.textSize", "support.link", "landing.privacy", "landing.terms", "teacher.phoneInvalid", "quiz.checking", "parent.noClasses", "login.newHere", "login.create", "login.title", "login.sub", "student.progress", "student.actions.video", "student.actions.pdf", "student.actions.quiz", "student.actions.task", "student.actions.exam", "student.tags.inProgress", "student.tags.new", "student.tags.completed", "teacher.greeting", "student.calendar", "student.calendarSub", "student.all", "student.joinClass", "kinds.live", "kinds.exam", "kinds.due", "student.explore", "student.free", "report.title", "report.attendance", "report.quizzes", "report.assignments", "report.notSubmitted", "report.comment", "report.noComment", "sub.waiting", "student.noQuizYet", "att.date", "teacher.confirmDeleteAnn"];

// ---- words -------------------------------------------------------------------------------------------------------
const local = (v, lang) => (typeof v === "number" ? v.toLocaleString(lang === "bn" ? "bn-BD" : "en-US") : String(v));
/** What the Dart side does with a template (flutter/lib/strings.dart): the wording for 0 or 1 if there is one, then the blanks. */
function render(words, key, args, lang) {
  const text = (args[0] === 0 || args[0] === 1) && words[`${key}=${args[0]}`] !== undefined ? words[`${key}=${args[0]}`] : words[key];
  return text.replace(/\{(\d)(n?)\}/g, (_, i, n) => (n ? local(args[i], lang) : String(args[i])));
}
// Stands in for an argument: prints as "{0}", or "{0n}" where the text asks for the number in the reader's digits.
const blank = (i) => ({ [Symbol.toPrimitive]: (hint) => (hint === "number" ? 2 : `{${i}}`), toLocaleString: () => `{${i}n}` });

function template(key, fn, lang, out) {
  const blanks = Array.from({ length: fn.length }, (_, i) => blank(i));
  try {
    out[key] = String(fn(...blanks));
  } catch {
    out[key] = String(fn(...blanks.map((_, i) => `{${i}}`))); // the text cuts the argument up (a first name): plain text blank
  }
  // Wording that is different for none or one ("Submit now?", "1 student") is kept as its own line.
  for (const n of [0, 1]) {
    try {
      const said = String(fn(n, ...blanks.slice(1)));
      if (said !== out[key].replace(/\{0(n?)\}/g, (_, loc) => (loc ? local(n, lang) : String(n)))) out[`${key}=${n}`] = said;
    } catch {
      /* not a number argument */
    }
  }
}

function flatten(node, prefix, lang, out) {
  for (const [k, v] of Object.entries(node)) {
    const key = `${prefix}.${k}`;
    if (typeof v === "string" || Array.isArray(v)) out[key] = v;
    else if (typeof v === "function") template(key, v, lang, out);
    else if (v && typeof v === "object") flatten(v, key, lang, out);
  }
}
const at = (dict, path) => path.split(".").reduce((o, k) => o?.[k], dict);

const fixtures = { words: [] };
const wrong = [];
function words(dict, lang) {
  const out = {};
  for (const s of SECTIONS) flatten(dict[s], s, lang, out);
  for (const path of SINGLE) {
    const v = at(dict, path);
    if (typeof v === "function") template(path, v, lang, out);
    else out[path] = v;
  }
  // Every text function is tried with real values: the template must say exactly what the website says.
  const check = (key, fn) => {
    for (const first of [0, 1, 2, 12, 1234567, "Rahim Uddin"])
      for (const rest of [[3, 7, 9], ["Batch A", "৳1,500", "Physics"]]) {
        const args = [first, ...rest].slice(0, fn.length);
        let want;
        try {
          want = String(fn(...args));
        } catch {
          continue; // e.g. a name's first word asked of a number
        }
        if (render(out, key, args, lang) !== want) wrong.push(`${lang} ${key}(${JSON.stringify(args)}): website "${want}", template "${render(out, key, args, lang)}"`);
        else fixtures.words.push({ lang, key, args, out: want });
      }
  };
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "function") check(`${prefix}.${k}`, v);
      else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${prefix}.${k}`);
    }
  };
  for (const s of SECTIONS) walk(dict[s], s);
  for (const path of SINGLE) if (typeof at(dict, path) === "function") check(path, at(dict, path));
  return out;
}

// ---- answers the Dart copies must reproduce (flutter/lib/views.dart) ------------------------------------------------
const NOW = "2026-11-22T10:30"; // a Sunday, read as local time here and in Dart
const now = new Date(NOW);
const xpLog = { "2026-11-22": 20, "2026-11-21": 35, "2026-11-20": 5, "2026-11-18": 40, "2026-11-01": 15 };
const quiz = (id, shuffle, sections) => ({ id, shuffle, questions: Array.from({ length: 7 }, (_, i) => ({ q: `Q${i}`, options: ["a", "b", "c", "d", "e"].slice(0, 4 + (i % 2)), answer: 0, ...(sections ? { section: i < 3 ? "A" : "B" } : {}) })) });
const modules = [
  { id: 1, batch: "A", title: "One", items: [
    { id: 11, kind: "quiz", title: "Quiz 1", dueDate: "2026-11-10", points: 10, scores: { 5: 7, 6: 10 } },
    { id: 12, kind: "task", title: "Homework", dueDate: "2026-11-05", submissions: { 5: { grade: 13, fileName: "a.jpg" }, 6: { fileName: "b.jpg" } } },
    { id: 13, kind: "video", title: "Video" },
  ] },
  { id: 2, batch: "A", title: "Two", items: [
    { id: 21, kind: "quiz", title: "Quiz 2", scores: { 5: 0 } },
    { id: 22, kind: "exam", title: "Exam", dueDate: "2026-11-08", points: 50, submissions: { 5: { grade: 33, fileName: "c.pdf" } } },
  ] },
];
const attendance = { "2026-11-02": [5], "2026-11-03": [], "2026-11-09": [6], "2026-11-21": [5, 6], "2026-11-22": [], "2026-11-29": [5], "2026-10-30": [5], "2025-11-10": [5] };
const roll = [{ id: 1, email: "rahim@gmail.com", guardianEmail: "father@gmail.com" }, { id: 2, email: "karim@gmail.com", guardianEmail: "father@gmail.com" }];
const person = (over) => ({ name: "Sadia", email: "sadia@gmail.com", guardianName: "Mrs Akter", guardianEmail: "akter@gmail.com", phone: "01712345678", ...over });
const people = [person({}), person({ name: " " }), person({ email: "sadia@yahoo.com" }), person({ email: "Rahim@gmail.com" }), person({ email: "father@gmail.com" }), person({ guardianEmail: "sadia@gmail.com" }), person({ guardianEmail: "karim@gmail.com" }), person({ guardianEmail: "father@gmail.com" }), person({ guardianName: "" }), person({ phone: "0171234" }), person({ phone: "+880 1712-345678" }), person({ studentPhone: "123" }), person({ studentPhone: "01912345678" })];
const page = "The  Second law:\nForce  equals mass × acceleration.\tবল = ভর × ত্বরণ\nSpeed   is   de fi ned   as   the   distance   travelled   per   unit   time .\u0000 a   = ( v   −   u ) /   t .";
const asked = ["Explain Newton's second law with an example", "Make me a physics revision plan", "integrals of sin x", "তরঙ্গের বেগ কী?", "সমাস কাকে বলে", "hello there", "Make me a 7-day revision plan for my exam", "What is an acid and a base? অম্ল", "python loop array"];

Object.assign(fixtures, {
  now: NOW,
  dayKey: dayKey(now),
  xp: { log: xpLog, streak: streak(xpLog, now), week: weekXp(xpLog, now), total: totalXp(xpLog), none: streak({}, now), yesterday: streak({ "2026-11-21": 4, "2026-11-20": 4 }, now) },
  results: { modules, cases: [5, 6, 9].map((id) => ({ id, out: gradedResults(modules, id) })) },
  attendance: { record: attendance, cases: [[5, undefined], [6, undefined], [5, [0, 1]], [6, [6]], [7, [3]]].map(([id, days]) => ({ id, days: days ?? null, out: monthAttendance(attendance, id, days, now) })) },
  quizOrder: [[quiz(1700000000123, false, false), 5], [quiz(1700000000123, true, false), 5], [quiz(1700000000123, true, true), 1999], [quiz(1700000099999, true, true), 2000000], [quiz(7, true, false), 1]].map(([item, sid]) => ({ item, sid, out: quizOrder(item, sid) })),
  taka: [0, 5, 999, 1000, 15000, 123456, 1234567, 12345678].map((n) => ({ n, out: taka(n) })),
  enrol: { roll, cases: people.map((p) => ({ input: p, out: validateStudent(p, roll) })).concat([{ input: person({ email: "rahim@gmail.com" }), except: 1, out: validateStudent(person({ email: "rahim@gmail.com" }), roll, 1) }]) },
  find: { page, cases: ["second LAW", "force equals   mass", "বল = ভর", "nothing here", "", "ত্বরণ", "Speed is defined as the distance travelled per unit time.", "a = (v − u) / t"].map((phrase) => ({ phrase, out: findInText(page, phrase) })) },
  topics: asked.map((text) => ({ text, out: topicOf(text) })),
  pages: [[1, 1], [3, 7], [1, 100], [50, 100], [100, 100], [2, 100], [4, 8]].map(([page, pages]) => ({ page, pages, out: pageNumbers(page, pages) })),
  packs: PACKS,
});

const dir = new URL("../flutter/", import.meta.url).pathname;
mkdirSync(`${dir}assets/gen`, { recursive: true });
const save = (file, value) => writeFileSync(dir + file, JSON.stringify(value, null, 1) + "\n");
save("assets/gen/en.json", words(en, "en"));
save("assets/gen/bn.json", words(bn, "bn"));
save("assets/gen/shared.json", { topics: WORDS, weights: WEIGHT, packs: PACKS });
if (wrong.length) {
  console.error(`These texts can't be turned into templates as they are written:\n  ${wrong.join("\n  ")}`);
  process.exit(1);
}
save("test/fixtures.json", fixtures);

// The icons, as Dart: the same shapes the website draws (src/lib/icon-set.ts), one constant per icon (I.home…).
for (const [name, g] of Object.entries(ICONS))
  for (const d of [...g.s, ...(g.a ?? []), ...(g.f ?? [])])
    if (/[^MLHVCQZ0-9.\s-]/.test(d)) throw new Error(`icon ${name}: only M L H V C Q Z with plain numbers can be drawn in the apps: ${d}`);
const dartList = (l) => `[${(l ?? []).map((d) => `'${d}'`).join(", ")}]`;
writeFileSync(
  `${dir}lib/icons.g.dart`,
  `// Made by \`npm run flutter:gen\` from src/lib/icon-set.ts. Do not edit by hand.\n// ignore_for_file: constant_identifier_names\nimport 'icon.dart';\n\n/// ClassBARI's icons, one constant per icon.\nabstract final class I {\n${Object.keys(ICONS).map((k) => `  static const ${k} = CbIcon('${k}');`).join("\n")}\n}\n\n/// Each icon's shapes: stroked lines, soft accent fills, solid fills.\nconst kGlyphs = <String, (List<String>, List<String>, List<String>)>{\n${Object.entries(ICONS).map(([k, g]) => `  '${k}': (${dartList(g.s)}, ${dartList(g.a)}, ${dartList(g.f)}),`).join("\n")}\n};\n`,
);
console.log(`flutter words and fixtures written (${fixtures.words.length} text checks)`);
