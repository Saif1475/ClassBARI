// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { csvText, readCsv, readXlsx, writeXlsx } from "../src/lib/sheet.ts";

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
  // A quote at the start of a cell that never closes is just a letter: the students after it must not merge into one cell.
  assert.deepEqual(readCsv('Name,Gmail\n"Babu,b@gmail.com\nRina,r@gmail.com\nTuli,t@gmail.com'), [["Name", "Gmail"], ['"Babu', "b@gmail.com"], ["Rina", "r@gmail.com"], ["Tuli", "t@gmail.com"]]);
  assert.deepEqual(readCsv('a,"b ""c""\nd,e'), [["a", '"b ""c""'], ["d", "e"]]);
  // A later unrelated quote must not close the stray one: a real closing quote is followed by the separator, a line break or the end.
  assert.deepEqual(readCsv('Name,Gmail\n"Babu,b@gmail.com\nRina,r@gmail.com\nO"Brien,o@gmail.com\nTuli,t@gmail.com'), [["Name", "Gmail"], ['"Babu', "b@gmail.com"], ["Rina", "r@gmail.com"], ['O"Brien', "o@gmail.com"], ["Tuli", "t@gmail.com"]]);
  assert.deepEqual(readCsv('Name,Gmail\n"Babu,b@gmail.com\nRina,"r@gmail.com\nTuli,t@gmail.com'), [["Name", "Gmail"], ['"Babu', "b@gmail.com"], ["Rina", '"r@gmail.com'], ["Tuli", "t@gmail.com"]]);
  assert.deepEqual(readCsv('"a\n"b\n"c'), [['"a'], ['"b'], ['"c']]);
  assert.deepEqual(readCsv('"Name;Gmail\nA;a@gmail.com'), [['"Name', "Gmail"], ["A", "a@gmail.com"]]);
  // Proper quoted cells still work, with spaces after the closing quote too.
  assert.deepEqual(readCsv('"a, b" ,"c"\n"",x'), [["a, b", "c"], ["", "x"]]);
  // The heading and the rows judge a closing quote the same way, however many spaces follow it.
  assert.deepEqual(readCsv(`"a"${" ".repeat(300)};b\nc;d`), [["a", "b"], ["c", "d"]]);
});

test("CSV with long runs of quotes is read in linear time", () => {
  const t = performance.now();
  assert.equal(readCsv('h\n"' + '""'.repeat(100_000) + "x")[1][0].length, 200_002);
  assert.equal(readCsv('h\n"' + '""'.repeat(100_000) + '"x')[1][0].length, 200_003);
  assert.equal(readCsv("h\nx" + '"'.repeat(200_000))[1][0].length, 200_001);
  assert.equal(readCsv('" '.repeat(100_000))[0][0].length, 199_999);
  assert.ok(performance.now() - t < 1500, `took ${Math.round(performance.now() - t)} ms`);
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

test("stops reading past the row cap: a tiny file with a million rows is refused, blank rows don't count", async () => {
  const rows = (n) => `<worksheet><sheetData>${'<row><c t="inlineStr"><is><t>a</t></is></c></row>'.repeat(n)}</sheetData></worksheet>`;
  await assert.rejects(readXlsx(xlsx({ "xl/worksheets/sheet1.xml": rows(5) }), 4), /too many rows/);
  assert.equal((await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": rows(2) + "<row></row>".repeat(10) + rows(2) + "<row></row>".repeat(10) }), 4)).length, 14); // blank rows between are kept, the ones after the list are not
  // Empty rows still cost memory, so too many of them are refused too, and so is a huge sharedStrings.xml.
  await assert.rejects(readXlsx(xlsx({ "xl/worksheets/sheet1.xml": rows(1) + '<row><c r="A1"/></row>'.repeat(41) }), 4), /too many rows/);
  await assert.rejects(readXlsx(xlsx({ "xl/sharedStrings.xml": "<si><t>a</t></si>".repeat(401), "xl/worksheets/sheet1.xml": rows(1) }), 4), /too many rows/);
  assert.throws(() => readCsv("a\n".repeat(5), 4), /too many rows/);
  assert.equal(readCsv("a\n".repeat(4) + "\n".repeat(10), 4).length, 4);
  // One cell or one row of tiny pieces passes the row caps, so with a row cap the unpacked size is capped too (and answered as too many rows).
  await assert.rejects(readXlsx(xlsx({ "xl/sharedStrings.xml": `<si>${"<t>a</t>".repeat(10_000)}</si>`, "xl/worksheets/sheet1.xml": rows(1) }), 4), /too many rows/);
  await assert.rejects(readXlsx(xlsx({ "xl/worksheets/sheet1.xml": `<row>${'<c t="inlineStr"><is><t>a</t></is></c>'.repeat(2_000)}</row>` }), 4), /too many rows/);
  assert.equal((await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": `<row>${'<c t="inlineStr"><is><t>a</t></is></c>'.repeat(150)}</row>` }))).at(0).length, 100);
});

test("a few KB file can't hold the server: tags that never close and one long text in every cell", async () => {
  // Each unclosed tag used to make the regex scan to the end of the file again: 400,000 "<row>"s took minutes.
  const t = performance.now();
  assert.deepEqual(await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": "<row>".repeat(400_000) }), 201), []);
  assert.deepEqual(await readXlsx(xlsx({ "xl/sharedStrings.xml": "<si>".repeat(100_000), "xl/worksheets/sheet1.xml": "<row></row>" }), 201), []);
  assert.deepEqual(await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": "<row>" + "<c a".repeat(100_000) + "</row>" }), 201), []);
  assert.deepEqual(await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": '<row><c t="inlineStr"><is>' + "<t>".repeat(100_000) + "</is></c></row>" }), 201), []);
  assert.deepEqual(await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": '<row><c r="A1">' + "<v>".repeat(200_000) + "</c></row>" }), 201), []);
  assert.ok(performance.now() - t < 3000, `took ${Math.round(performance.now() - t)} ms`);
  // One 1.9 MB shared text in 20,000 cells: every cell is cut short, so the import's checks don't read 38 billion letters.
  const cells = '<c t="s"><v>0</v></c>'.repeat(100);
  const grid = await readXlsx(xlsx({ "xl/sharedStrings.xml": `<si><t> ${"a".repeat(1_900_000)} </t></si>`, "xl/worksheets/sheet1.xml": `<row>${cells}</row>`.repeat(200) }), 201);
  assert.equal(grid.length, 200);
  assert.ok(grid.every((r) => r.every((c) => c.length === 200)));
  assert.equal((await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": `<row><c t="inlineStr"><is><t>${"q".repeat(500)}</t></is></c></row>` })))[0][0].length, 500); // no row cap: a long question stays whole
  // Self-closed and attribute-less tags still read as before.
  assert.deepEqual(await readXlsx(xlsx({ "xl/worksheets/sheet1.xml": '<row r="1"><c r="A1"/><c r="B1" t="inlineStr"><is><t/><t>x</t></is></c><c><v>5</v></c></row>' })), [["", "x", "5"]]);
});

test("CSV keeps negative marks and +880 phones as numbers, but still stops formulas", () => {
  assert.equal(csvText([[-1.5, "-1.5", "+8801712345678", "=1+1", "-2+3", "+cmd", "@x"]]), `"-1.5","-1.5","+8801712345678","'=1+1","'-2+3","'+cmd","'@x"`);
});
