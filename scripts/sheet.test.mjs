// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { readCsv, readXlsx, writeXlsx } from "../src/lib/sheet.ts";

/** A tiny real .xlsx (zip) built by hand: shared strings, a number cell, a skipped column and an entity. */
function xlsx() {
  const files = {
    "xl/sharedStrings.xml": '<sst><si><t>Student name</t></si><si><r><t>Gu</t></r><r><t>ardian phone</t></r></si><si><t>Nusrat &amp; Co</t></si></sst>',
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1711234511</v></c></row></sheetData></worksheet>',
  };
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text)), n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(local, n, data); central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...parts, cd, end]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

test("reads an .xlsx: shared and rich text, numbers, empty columns, entities", async () => {
  assert.deepEqual(await readXlsx(xlsx()), [["Student name", "", "Guardian phone"], ["Nusrat & Co", "", "1711234511"]]);
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
