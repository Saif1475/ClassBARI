// Run: npm test — reading a student list for "Import students" (src/lib/student-import.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { assign, checkRows, MAX_ROWS, columnInfo, fixPhone, gridFromPieces, gridToRecords, guessFields, missingFields, rowsToFix } from "../src/lib/student-import.ts";

/** A line of a PDF table: [x, text] pairs at one height (12 high, 6 wide a letter). */
const line = (page, y, ...cells) => cells.map(([x, str]) => ({ str, x, y, w: str.length * 6, h: 12, page }));
const HEAD = [[40, "SL"], [70, "Student name"], [200, "Gmail"], [330, "Father's name"], [460, "Mobile"]];

test("a PDF table: columns from where the students' words sit; title, footer and repeated headings left out", () => {
  const pieces = [
    ...line(1, 50, [100, "Tanvir's Physics Care — Student list"]),
    ...line(1, 100, ...HEAD),
    ...line(1, 120, [40, "1"], [70, "Nusrat Jahan"], [200, "nusrat@gmail.com"], [330, "Kamal Jahan"], [460, "01711234511"]),
    ...line(1, 134, [70, "Chowdhury"]), // her name ran onto a second line
    ...line(1, 160, [40, "2"], [70, "Rahim Uddin"], [200, "RAHIM.U@gmail.com"], [330, "Karim Uddin"], [460, "+880 1811-234512"]),
    ...line(1, 300, [250, "Page 1 of 2"]),
    ...line(2, 100, ...HEAD),
    ...line(2, 120, [40, "3"], [70, "Sadia"], [200, "sadia@gmail.com"], [330, "Rahima Khatun"], [460, "01911234513"]),
  ];
  const grid = gridFromPieces(pieces);
  assert.deepEqual(grid, [
    ["SL", "Student name", "Gmail", "Father's name", "Mobile"],
    ["1", "Nusrat Jahan Chowdhury", "nusrat@gmail.com", "Kamal Jahan", "01711234511"],
    ["2", "Rahim Uddin", "RAHIM.U@gmail.com", "Karim Uddin", "+880 1811-234512"],
    ["3", "Sadia", "sadia@gmail.com", "Rahima Khatun", "01911234513"],
  ]);
  // The headings say what each column holds; the serial numbers are not used.
  assert.deepEqual(guessFields(grid, []), { heads: true, fields: ["", "name", "email", "guardianName", "phone"] });
});

test("a list that isn't a table (one student per line, as a sentence) is cut at its Gmails and mobile numbers", () => {
  const grid = gridFromPieces([
    ...line(1, 10, [0, "Student list"]),
    ...line(1, 30, [0, "1. Nusrat Jahan nusrat@gmail.com Kamal Jahan kamal@gmail.com 01711234511 Dhaka"]),
    ...line(1, 50, [0, "2. Rahim rahim@gmail.com Karim karim@gmail.com ০১৮১১২৩৪৫১২"]),
    ...line(1, 70, [0, "Rahim NID 9901711234511"]), // an ID card number is not a mobile
  ]);
  assert.deepEqual(grid, [
    ["Nusrat Jahan", "nusrat@gmail.com", "Kamal Jahan", "kamal@gmail.com", "", "01711234511", "Dhaka"],
    ["Rahim", "rahim@gmail.com", "Karim", "karim@gmail.com", "", "01811234512", ""],
  ]);
  assert.deepEqual(guessFields(grid, []), { heads: false, fields: ["name", "email", "guardianName", "guardianEmail", "", "phone", ""] });
});

test("what each column holds: Bangla and English headings first, then what unknown columns hold", () => {
  const known = [["ক্রমিক", "শিক্ষার্থীর নাম", "Mail", "পিতার নাম", "Student mobile", "Mobile no", "Batch"], ["1", "Sadia", "sadia@gmail.com", "Rahim", "01911234513", "01711234511", "Class 9"]];
  assert.deepEqual(guessFields(known, ["Class 9"]).fields, ["", "name", "email", "guardianName", "studentPhone", "phone", "batch"]);
  // Headings nobody knows: still headings (no Gmail in that row, Gmails under it); the columns go by what they hold.
  const unknown = [["Naam", "Mail", "Abba", "Abba mail", "Phone no"], ["Rafi", "rafi@gmail.com", "Karim", "karim@gmail.com", "1711000001"]];
  assert.deepEqual(guessFields(unknown, []), { heads: true, fields: ["name", "email", "guardianName", "guardianEmail", "phone"] });
  assert.deepEqual(columnInfo(unknown, true)[4], { heading: "Phone no", samples: ["1711000001"] });
  // One column per kind: giving "name" to another column takes it from the first.
  assert.deepEqual(assign(["name", "email", "guardianName"], 2, "name"), ["", "email", "name"]);
  assert.deepEqual(missingFields(["name", "email", ""]), ["guardianName", "guardianEmail", "phone"]);
});

test("a PDF list in the template's columns, over two pages, comes back as the same students", async () => {
  const { studentListPdf } = await import("../src/lib/student-list-pdf.ts");
  const { readPieces } = await import("../src/lib/pdf-mark.ts");
  const students = Array.from({ length: 25 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return [`Student ${n} Rahman`, `instanton.demo.s${n}@gmail.com`, `Guardian ${n} Rahman`, `instanton.demo.g${n}@gmail.com`, `017112345${n}`, i % 2 ? `018112345${n}` : "", "Teacher Batch", "Udayan School", "Dhaka"];
  });
  const grid = gridFromPieces(await readPieces(await studentListPdf(students, "Instanton Campus: student list", "One student per row.")));
  const { heads, fields } = guessFields(grid, ["Teacher Batch"]);
  assert.deepEqual(fields, ["name", "email", "guardianName", "guardianEmail", "phone", "studentPhone", "batch", "school", "address"]);
  assert.deepEqual(gridToRecords(grid, fields, heads), students.map(([name, email, guardianName, guardianEmail, phone, studentPhone, batch, school, address]) => ({ name, email, guardianName, guardianEmail, phone, studentPhone, batch, school, address })));
});

test("every row is checked like the enrol form: Gmail rules, the same Gmail twice in the file, unknown batches", () => {
  const grid = [
    ["Name", "Gmail", "Guardian", "Guardian Gmail", "Phone", "Batch"],
    ["One", "one@gmail.com", "P1", "p1@gmail.com", "1711000001", ""], // Excel dropped the 0
    ["Two", "one@gmail.com", "P2", "p2@gmail.com", "01711000002", ""],
    ["Three", "three@yahoo.com", "P3", "p3@gmail.com", "+880 1711-000003", "Nowhere"],
    ["Four", "taken@gmail.com", "P4", "p4@gmail.com", "০১৭১১০০০০০৪", "Class 9"],
    ["", "", "", "", "", ""],
  ];
  const { heads, fields } = guessFields(grid, ["Class 9"]);
  const rows = checkRows(gridToRecords(grid, fields, heads), "HSC Physics · A", ["HSC Physics · A", "Class 9"], [{ id: 1, email: "taken@gmail.com", guardianEmail: "x@gmail.com" }]);
  assert.deepEqual(
    rows.map((r) => [r.line, r.input.batch, r.input.phone, r.problems]),
    [
      [2, "HSC Physics · A", "01711000001", []],
      [3, "HSC Physics · A", "01711000002", ["emailTaken"]],
      [4, "HSC Physics · A", "01711000003", ["gmailInvalid", { unknownBatch: "Nowhere" }]],
      [5, "Class 9", "01711000004", ["emailTaken"]],
    ],
  );
  assert.equal(fixPhone("01711-23"), "01711-23"); // not a mobile: left as typed, so the check says so
  // The rows to fix, for Excel: the template's headings, then only those rows.
  assert.deepEqual(rowsToFix(rows).map((r) => r[0]), ["Student name", "Two", "Three", "Four"]);
});

test("a big list is checked fast, with the same answers as the enrol form", async () => {
  const { validateStudent } = await import("../src/lib/site.ts");
  const existing = [{ id: 1, email: "ta.ken@gmail.com", guardianEmail: "papa@gmail.com" }];
  const records = Array.from({ length: MAX_ROWS }, (_, i) => ({ name: `S${i}`, email: `s${i % 250}@gmail.com`, guardianName: "G", guardianEmail: i % 100 ? `g${i}@gmail.com` : "taken+x@gmail.com", phone: "01711000001" }));
  records.splice(300, 0, { name: "P", email: "PAPA@gmail.com", guardianName: "G", guardianEmail: "s5@gmail.com", phone: "01711000001" });
  const t0 = performance.now();
  const rows = checkRows(records, "A", ["A"], existing);
  assert.ok(performance.now() - t0 < 500, "2000 rows in well under a second");
  // The old way, row by row against every student accepted before it, on the first 400 rows (a row never depends on later ones): the same problems.
  const accepted = [...existing];
  const slow = records.slice(0, 400).map((r, i) => {
    const p = Object.values(validateStudent({ ...r, studentPhone: undefined }, accepted));
    if (!p.length) accepted.push({ id: -1 - i, email: r.email, guardianEmail: r.guardianEmail });
    return p;
  });
  assert.deepEqual(rows.slice(0, 400).map((r) => r.problems), slow);
  assert.ok(slow.some((p) => p.includes("emailTaken")) && slow.some((p) => p.includes("guardianIsStudent")));
  assert.equal(MAX_ROWS, 2000);
});
