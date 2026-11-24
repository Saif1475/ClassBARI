import test from "node:test";
import assert from "node:assert/strict";
import { changeKey, ranBefore, ranNow } from "../src/lib/ran-before.ts";

const teacher = { role: "teacher", email: "t@example.com", studentIds: [] };

test("a change sent again is known; a different one is not", () => {
  const a = changeKey(teacher, "addStudent", ["Rina"], 1000);
  assert.equal(ranBefore("i1", a), false);
  ranNow("i1", a);
  assert.equal(ranBefore("i1", changeKey(teacher, "addStudent", ["Rina"], 1000)), true); // the resend
  assert.equal(ranBefore("i1", changeKey(teacher, "addStudent", ["Rina"], 1100)), false); // a new change
  assert.equal(ranBefore("i1", changeKey({ ...teacher, email: "u@example.com" }, "addStudent", ["Rina"], 1000)), false); // someone else
  assert.equal(ranBefore("i2", a), false); // another institute
});

test("only the last 200 changes of an institute are kept", () => {
  for (let i = 0; i < 201; i++) ranNow("i3", changeKey(teacher, "x", [], i));
  assert.equal(ranBefore("i3", changeKey(teacher, "x", [], 0)), false);
  assert.equal(ranBefore("i3", changeKey(teacher, "x", [], 1)), true);
  assert.equal(ranBefore("i3", changeKey(teacher, "x", [], 200)), true);
});
