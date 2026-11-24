// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { readCsv, readXlsx, writeXlsx } from "../src/lib/sheet.ts";

/** A tiny real .xlsx (zip) built by hand: shared strings, a number cell, a skipped column and an entity. */
function xlsx(files = {
  "xl/sharedStrings.xml": '<sst><si><t>Student name</t></si><si><r><t>Gu</t></r><r><t>ardian phone</t></r></si><si><t>Nusrat &amp; Co</t></si></sst>',
  "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1711234511</v></c></row></sheetData></worksheet>',
}) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(typeof text === "string" ? Buffer.from(text) : text), n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(local, n, data); central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(parts.length / 3, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...parts, cd, end]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

test("reads an .xlsx: shared and rich text, numbers, empty columns, entities", async () => {
  assert.deepEqual(await readXlsx(xlsx()), [["Student name", "", "Guardian phone"], ["Nusrat & Co", "", "1711234511"]]);
});

test("reads the first visible tab named in workbook.xml, refuses a zip bomb, and caps a row's width", async () => {
  const row = (t) => `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${t}</t></is></c><c r="XFD1" s="1"/></row></sheetData></worksheet>`;
  const book = {
    "xl/workbook.xml": '<workbook xmlns:r="x"><sheets><sheet name="Old" sheetId="1" state="hidden" r:id="rId1"/><sheet name="Students" sheetId="2" r:id="rId7"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Target="/xl/worksheets/students.xml" Id="rId7"/></Relationships>',
    "xl/worksheets/sheet1.xml": row("hidden"),
    "xl/worksheets/students.xml": row("visible"),
  };
  const rows = await readXlsx(xlsx(book));
  assert.equal(rows[0][0], "visible");
  assert.ok(rows[0].length <= 100);
  // 60 MB of zeros packs into a few KB: it must be refused, not unpacked into memory.
  await assert.rejects(readXlsx(xlsx({ "xl/worksheets/sheet1.xml": Buffer.alloc(60 * 1024 * 1024) })), /too big/);
});

test("writes an .xlsx that reads back as the same rows: text kept as typed, a phone's 0 too", async () => {
  const rows = [["Student name", "Guardian phone", "Note"], ["Nusrat & Co <1>", "01711234511", ""], ["Sadia", "+880 1811-234512", 'say "hi"']];
  const file = writeXlsx(rows, [1]);
  assert.deepEqual(await readXlsx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)), rows);
});

test("reads Excel-style CSV: BOM, quotes, commas inside quotes, semicolons", () => {
  assert.deepEqual(readCsv('﻿Name,Phone\r\n"Rahim, Jr","017 ""x"""\r\n'), [["Name", "Phone"], ["Rahim, Jr", '017 "x"']]);
  assert.deepEqual(readCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("CSV keeps every row: a quote inside a name is just a letter, and the separator comes from the first line with text", () => {
  // A quote in the middle of a cell must not swallow the rest of the file (the students after O"Brien used to vanish).
  assert.deepEqual(readCsv('O"Brien,x@gmail.com\nB,b@gmail.com\nPipe 5",c@gmail.com'), [['O"Brien', "x@gmail.com"], ["B", "b@gmail.com"], ['Pipe 5"', "c@gmail.com"]]);
  assert.deepEqual(readCsv('O"Brien;x@gmail.com\nB;b@gmail.com'), [['O"Brien', "x@gmail.com"], ["B", "b@gmail.com"]]);
  // A quoted cell may still start after a space, as people type it by hand.
  assert.deepEqual(readCsv('a, "b, c"'), [["a", "b, c"]]);
  // Semicolon files that start with an empty line, or whose quoted heading holds a line break or a comma.
  assert.deepEqual(readCsv("\r\n \r\nName;Gmail\r\nA;a@gmail.com\r\n"), [["Name", "Gmail"], ["A", "a@gmail.com"]]);
  assert.deepEqual(readCsv('"Student\nname";Gmail\nA;a@gmail.com'), [["Student\nname", "Gmail"], ["A", "a@gmail.com"]]);
  assert.deepEqual(readCsv('"Name, as on the ""card""";Gmail\nA;a@gmail.com'), [['Name, as on the "card"', "Gmail"], ["A", "a@gmail.com"]]);
});

test("reads the text of a Word (.docx) file, one paragraph per line", async () => {
  const { readDocxText } = await import("../src/lib/sheet.ts");
  const xml = '<w:document><w:body><w:p><w:r><w:t>1. Unit of force?</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">a) Joule </w:t></w:r><w:r><w:tab/><w:t>b) Newton</w:t></w:r></w:p><w:p><w:r><w:t>Answer: b &amp; done</w:t></w:r></w:p></w:body></w:document>';
  const data = deflateRawSync(Buffer.from(xml)), n = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28);
  const cd = Buffer.concat([c, n]), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(30 + n.length + data.length, 16);
  const buf = Buffer.concat([local, n, data, cd, end]);
  const text = await readDocxText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.equal(text, "1. Unit of force?\na) Joule \tb) Newton\nAnswer: b & done\n");
});
