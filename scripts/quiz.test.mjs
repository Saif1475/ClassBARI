// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { markQuiz, masteryLevel, meritList, parseQuiz, scoreQuiz, sectionResults, seededOrder } from "../src/lib/quiz.ts";

test("parses questions and the starred answer", () => {
  const { questions, badQuestion } = parseQuiz("Unit of frequency?\n*Hertz\nNewton\n\n  2+2?  \n3\n* 4\n\n\n");
  assert.equal(badQuestion, undefined);
  assert.deepEqual(questions, [
    { q: "Unit of frequency?", options: ["Hertz", "Newton"], answer: 0 },
    { q: "2+2?", options: ["3", "4"], answer: 1 },
  ]);
});

test("rejects a question with no or two starred answers", () => {
  assert.equal(parseQuiz("Q1\n*a\nb\n\nQ2\na\nb").badQuestion, 2);
  assert.equal(parseQuiz("Q1\n*a\n*b").badQuestion, 1);
  assert.equal(parseQuiz("Q1\n*a").badQuestion, 1);
});

test("scores scaled to points, unanswered is wrong", () => {
  const { questions } = parseQuiz("A\n*1\n2\n\nB\n1\n*2\n\nC\n*1\n2");
  assert.equal(scoreQuiz(questions, [0, 1, 0], 30), 30);
  assert.equal(scoreQuiz(questions, [0, null, 1], 30), 10);
  assert.equal(scoreQuiz([], [], 30), 0);
});

test("topic tags are read and removed from the question", () => {
  const { questions } = parseQuiz("[Pendulum] Period depends on?\n*length\nmass\n\nNo tag here?\n*a\nb");
  assert.deepEqual(questions[0], { q: "Period depends on?", topic: "Pendulum", options: ["length", "mass"], answer: 0 });
  assert.equal(questions[1].topic, undefined);
});

test("marking and mastery levels", () => {
  const { questions } = parseQuiz("A\n*1\n2\n\nB\n1\n*2");
  assert.deepEqual(markQuiz(questions, [0, 0]), [true, false]);
  assert.equal(masteryLevel(95), "mastered");
  assert.equal(masteryLevel(60), "proficient");
  assert.equal(masteryLevel(59), "familiar");
});

test("rubric lines parse; bad lines reject the whole rubric", async () => {
  const { parseRubric } = await import("../src/lib/quiz.ts");
  assert.deepEqual(parseRubric("Method: 10\n\n Final answer : 10\nPresentation:5"), [
    { name: "Method", max: 10 },
    { name: "Final answer", max: 10 },
    { name: "Presentation", max: 5 },
  ]);
  assert.deepEqual(parseRubric(""), []);
  assert.equal(parseRubric("Method 10"), null);
  assert.equal(parseRubric("Method: 0"), null);
  assert.deepEqual(parseRubric("পদ্ধতি: ১০\nপ্রশ্ন ২: ৫"), [{ name: "পদ্ধতি", max: 10 }, { name: "প্রশ্ন ২", max: 5 }]);
});

test("sections: a '## Name' heading applies to the questions after it", () => {
  const { questions } = parseQuiz("## Physics\nQ1\n*a\nb\n\nQ2\n*a\nb\n\n## Chemistry\n\nQ3\na\n*b");
  assert.deepEqual(questions.map((q) => q.section), ["Physics", "Physics", "Chemistry"]);
  assert.deepEqual(sectionResults(questions, [0, 1, null]), [
    { section: "Physics", right: 1, wrong: 1, skipped: 0 },
    { section: "Chemistry", right: 0, wrong: 0, skipped: 1 },
  ]);
});

test("negative marking: wrong answers lose marks, skipped ones don't", () => {
  const qs = parseQuiz("A\n*1\n2\n\nB\n*1\n2\n\nC\n*1\n2\n\nD\n*1\n2").questions;
  assert.equal(scoreQuiz(qs, [0, 0, 1, null], 4, 0.25), 1.75); // 2 right (2 marks) − 1 wrong (0.25)
  assert.equal(scoreQuiz(qs, [1, 1, 1, 1], 4, 0.25), -1);
  assert.equal(scoreQuiz(qs, [0, 0, 1, null], 4), 2); // no negative marking: unchanged behaviour
});

test("shuffle: same order for the same student, every index exactly once", () => {
  const a = seededOrder(20, 7);
  assert.deepEqual(seededOrder(20, 7), a);
  assert.deepEqual([...a].sort((x, y) => x - y), [...Array(20).keys()]);
  assert.notDeepEqual(seededOrder(20, 8), a);
});

test("merit list: ties share a rank, percentile counts students beaten", () => {
  assert.deepEqual(meritList({ 1: 20, 2: 25, 3: 20, 4: 10 }), [
    { id: 2, score: 25, rank: 1, of: 4, percentile: 100 },
    { id: 1, score: 20, rank: 2, of: 4, percentile: 33 },
    { id: 3, score: 20, rank: 2, of: 4, percentile: 33 },
    { id: 4, score: 10, rank: 4, of: 4, percentile: 0 },
  ]);
});
