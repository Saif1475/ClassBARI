// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { answerSheetQuestions, parseLooseMcq, rowsToMcq, toQuizText } from "../src/lib/question-import.ts";
import { parseQuiz } from "../src/lib/quiz.ts";

test("Word / text style: numbered questions, lettered options, Answer lines", () => {
  const r = parseLooseMcq(`1. What is the SI unit of force?
a) Joule
b) Newton
c) Watt
d) Pascal
Answer: b

2) Speed of light is about
(a) 3×10⁸ m/s (b) 340 m/s (c) 1500 m/s (d) 0
Ans: A`);
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions[0], { q: "What is the SI unit of force?", options: ["Joule", "Newton", "Watt", "Pascal"], answer: 1 });
  assert.deepEqual(r.questions[1].options, ["3×10⁸ m/s", "340 m/s", "1500 m/s", "0"]);
  assert.equal(r.questions[1].answer, 0);
  assert.deepEqual(r.problems, []);
});

test("Bangla numbering, ক খ গ ঘ options and উত্তর; starred and ✓-marked options; wrapped question text", () => {
  const r = parseLooseMcq(`১। বাংলাদেশের রাজধানী
কোনটি?
ক) চট্টগ্রাম
খ) ঢাকা
গ) খুলনা
ঘ) সিলেট
উত্তর: খ
2. 2 + 2 = ?
*A) 4
B) 5
3. Water boils at
A) 50 °C
B) 100 °C ✓`);
  assert.equal(r.questions[0].q, "বাংলাদেশের রাজধানী কোনটি?");
  assert.equal(r.questions[0].answer, 1);
  assert.equal(r.questions[1].answer, 0);
  assert.equal(r.questions[2].answer, 1);
  assert.equal(r.questions[2].options[1], "100 °C");
});

test("missing answers are reported, not guessed; the result round-trips through the question box", () => {
  const r = parseLooseMcq("1. Q one\na) x\nb) y\n\n2. Q two\na) p\nb) q\nAnswer: b");
  assert.deepEqual(r.problems, [1]);
  const text = toQuizText(r.questions);
  assert.equal(parseQuiz(text).badQuestion, 1); // the teacher must star question 1 before publishing
  assert.equal(parseQuiz(text.replace("x\ny", "*x\ny")).questions.length, 2);
});

test("ClassBARI's own format still works", () => {
  const r = parseLooseMcq("## Physics\nUnit of frequency?\n*Hertz\nNewton");
  assert.deepEqual(r.questions, [{ q: "Unit of frequency?", options: ["Hertz", "Newton"], answer: 0, section: "Physics" }]);
});

test("spreadsheet rows: headings in any case, answer as letter, number or text", () => {
  const r = rowsToMcq([
    ["Question", "A", "B", "C", "D", "Answer", "Topic"],
    ["2+2", "3", "4", "5", "6", "B", "Maths"],
    ["Capital?", "Dhaka", "Delhi", "", "", "Dhaka", ""],
    ["Odd one", "1", "2", "3", "4", "3", ""],
    ["No answer", "x", "y", "", "", "", ""],
  ]);
  assert.deepEqual(r.questions.map((q) => q.answer), [1, 0, 2, -1]);
  assert.equal(r.questions[0].topic, "Maths");
  assert.deepEqual(r.problems, [4]);
});

test("paper + answer key", () => {
  assert.deepEqual(answerSheetQuestions([2, 0], (n) => `Q${n}`), [
    { q: "Q1", options: ["A", "B", "C", "D"], answer: 2 },
    { q: "Q2", options: ["A", "B", "C", "D"], answer: 0 },
  ]);
});
