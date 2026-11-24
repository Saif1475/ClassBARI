// Read the first sheet of an Excel (.xlsx) or CSV file into rows of text, without a spreadsheet library.
// .xlsx is a zip of XML files; the browser (and Node) can unzip "deflate" data with DecompressionStream.
// Pure code apart from that stream (also used by scripts/sheet.test.mjs).

// A small file can unpack to gigabytes (a "zip bomb") and crash the server, so unpacking stops past this many bytes in total.
const MAX_UNZIPPED = 50 * 1024 * 1024;

async function inflate(data: Uint8Array, limit: number) {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    total += r.value.length;
    if (total > limit) { await reader.cancel(); throw new Error("too big when unpacked"); }
    chunks.push(r.value);
  }
  const out = new Uint8Array(total);
  chunks.reduce((at, x) => (out.set(x, at), at + x.length), 0);
  return out;
}

/** Files inside a zip, by name (only the ones we ask for are unpacked). */
export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean) {
  const v = new DataView(buf);
  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  let left = MAX_UNZIPPED;
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, start, size);
    const bytes = method === 8 ? await inflate(raw, left) : raw;
    left -= bytes.length;
    if (left < 0) throw new Error("too big when unpacked");
    out.set(name, dec.decode(bytes));
  }
  return out;
}

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" } as Record<string, string>)[e.toLowerCase()],
  );
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// One formatted empty cell far to the right (XFD5) would make every row 16000 cells wide; no student list needs more columns than this.
const MAX_COLS = 100;

/** Path inside the zip of the first tab that is not hidden, found through workbook.xml and its rels (the tab order there, not the file names). */
function firstSheetPath(workbook = "", rels = "") {
  const sheet = [...workbook.matchAll(/<sheet\s([^>]*?)\/?>/g)].map((m) => m[1]).find((a) => !/\bstate="(hidden|veryHidden)"/.test(a));
  const id = sheet?.match(/\b\w+:id="([^"]+)"/)?.[1];
  const target = [...rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)].map((m) => m[1]).find((a) => a.match(/\bId="([^"]+)"/)?.[1] === id)?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!id || !target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
}

// A tiny zip can still hold a million rows; past `maxRows` rows with text, reading stops with this error instead of holding up the server.
export const TOO_MANY_ROWS = "too many rows";

export async function readXlsx(buf: ArrayBuffer, maxRows = Infinity): Promise<string[][]> {
  const meta = await unzip(buf, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml");
  const path = firstSheetPath(meta.get("xl/workbook.xml"), meta.get("xl/_rels/workbook.xml.rels"));
  const files = await unzip(buf, (n) => n === path || n === "xl/worksheets/sheet1.xml");
  // No sheet within the cap can use more distinct texts than it has cells, so a huge sharedStrings.xml stops here too.
  const shared: string[] = [];
  for (const m of (meta.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)) if (shared.push(texts(m[1])) > maxRows * MAX_COLS) throw new Error(TOO_MANY_ROWS);
  const sheet = files.get(path) ?? files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("no sheet");
  const rows: string[][] = [];
  let filled = 0, blanks = 0;
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? texts(body) : unescape(v);
      const col = ref ? colIndex(ref) : cells.length;
      if (col < MAX_COLS) cells[col] = value.trim();
    }
    // Blank rows are kept only when a row with text follows them, and count toward a total cap: millions of empty <row>s must not fill the memory.
    if (!cells.some(Boolean)) { if (rows.length + ++blanks > maxRows * 10) throw new Error(TOO_MANY_ROWS); continue; }
    for (; blanks; blanks--) rows.push([]);
    rows.push(Array.from(cells, (x) => x ?? ""));
    if (++filled > maxRows) throw new Error(TOO_MANY_ROWS);
  }
  return rows;
}

/** Plain text of a Word (.docx) file, one paragraph per line (tabs and line breaks kept). */
export async function readDocxText(buf: ArrayBuffer) {
  const xml = (await unzip(buf, (n) => n === "word/document.xml")).get("word/document.xml");
  if (!xml) throw new Error("not a Word file");
  return xml
    .split(/<\/w:p>/)
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br)\/>/g)].map((m) => (m[2] === "tab" ? "\t" : m[2] === "br" ? "\n" : unescape(m[1]))).join(""))
    .join("\n");
}

/** CSV with quotes, commas or semicolons, as saved by Excel. */
export function readCsv(text: string, maxRows = Infinity): string[][] {
  text = text.replace(/^﻿/, "");
  // The separator is the one seen more often on the first line that has text, counted outside quotes only: a file can start with an empty line, and a quoted heading can hold a comma or a line break.
  const head = text.trimStart();
  let commas = 0, semis = 0;
  // A stray opening quote (one that never properly closes, see below) is a letter here too, or a "Name;Gmail heading would be split on commas.
  for (let i = 0, inQuotes = false, blank = true, openAt = -1; ; i++) {
    if (i >= head.length) { if (!inQuotes) break; inQuotes = false; i = openAt; blank = false; continue; }
    const ch = head[i];
    if (inQuotes) {
      if (ch === '"' && head[i + 1] === '"') i++;
      else if (ch === '"') { inQuotes = false; if (!/^[ \t]*([,;\r\n]|$)/.test(head.slice(i + 1, i + 200))) { i = openAt; blank = false; } }
    } else if (ch === "\n" || ch === "\r") break;
    else if (ch === "," || ch === ";") { if (ch === ",") commas++; else semis++; blank = true; }
    else if (ch === '"' && blank) { inQuotes = true; openAt = i; }
    else if (ch.trim()) blank = false;
  }
  const sep = semis > commas ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, filled = 0;
  // A quote opens a quoted cell only while the cell is still empty: in the middle (O"Brien, 5") it is just a letter, or the rest of the file would become one cell.
  // A quote that opens a cell but never properly closes is a plain letter: go back to it, or every student after it would merge into one cell. A real closing quote is followed only by spaces and then the separator, a line break or the end ("Babu,b@x then Rina,"r@x or O"Brien is not one).
  // Stays linear: everything between the stray quote and where we stopped holds only "" pairs, and a cell reopened on such a pair stops at the end of its own run of quotes.
  for (let i = 0, openAt = -1, before = ""; ; i++) {
    if (i >= text.length) { if (!quoted) break; quoted = false; i = openAt; cell = before + '"'; continue; }
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') {
        let k = i + 1;
        while (text[k] === " " || text[k] === "\t") k++;
        quoted = false;
        if (k < text.length && text[k] !== sep && text[k] !== "\n" && text[k] !== "\r") { i = openAt; cell = before + '"'; }
      } else cell += ch;
    } else if (ch === '"' && !cell.trim()) { quoted = true; openAt = i; before = cell; }
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      // Blank lines are dropped at the end anyway; keeping them first would let a file of ",\n" fill the memory.
      if (row.some(Boolean)) { rows.push(row); if (++filled > maxRows) throw new Error(TOO_MANY_ROWS); }
      row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some(Boolean));
}

// ---- writing an .xlsx: a zip of a few XML files, stored without compression (Excel and LibreOffice open it) ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip of text files, stored as they are (the "stored" method needs no compression library). */
function zip(files: [string, string][]) {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, 33, true); // 1 January 1980, the zip format's first day
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((sum, x) => sum + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((sum, x) => sum + x.length, 0));
  all.reduce((at, x) => (out.set(x, at), at + x.length), 0);
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number): string => (i >= 26 ? colName(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main", REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * Rows as an Excel file (.xlsx): the first row bold and kept in view while scrolling, every column wide enough to type
 * in, and `textCols` (0-based) formatted as text, so a mobile number typed there keeps its leading 0.
 */
export function writeXlsx(rows: string[][], textCols: number[] = []) {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="24" customWidth="1"${textCols.includes(i) ? ' style="2"' : ""}/>`).join("");
  const data = rows
    .map((r, y) => `<row r="${y + 1}">${r.map((v, x) => `<c r="${colName(x)}${y + 1}" t="inlineStr" s="${y === 0 ? 1 : textCols.includes(x) ? 2 : 0}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("")}</row>`)
    .join("");
  return zip([
    ["[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `${XML}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", `${XML}<worksheet xmlns="${MAIN}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>`],
  ]);
}

/** Rows as CSV text for Excel. Leading = + - @ are neutralised so cells can't run formulas; a plain signed number (-1.5, +880 1712...) can't, so it stays a number. */
export const csvText = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((v) => `"${(typeof v === "number" || /^[+-]\d[\d.\s]*$/.test(v) ? String(v) : String(v).replace(/^([=+\-@])/, "'$1")).replace(/"/g, '""')}"`).join(",")).join("\r\n");

export async function readSheetFile(file: File) {
  return /\.xlsx$/i.test(file.name) ? readXlsx(await file.arrayBuffer()) : readCsv(await file.text());
}

/** Column headings we recognise (English or Bangla, any case) -> field: "Import students" fills these in by itself. */
export const IMPORT_COLUMNS = {
  name: ["student name", "student's name", "students name", "name", "নাম", "শিক্ষার্থীর নাম", "ছাত্রের নাম", "ছাত্রীর নাম"],
  email: ["student gmail", "student's gmail", "gmail", "email", "e-mail", "email address", "student email", "জিমেইল", "শিক্ষার্থীর জিমেইল", "ইমেইল"],
  guardianName: ["guardian name", "guardian's name", "guardian", "father's name", "fathers name", "father name", "parent name", "parent's name", "অভিভাবকের নাম", "অভিভাবক", "পিতার নাম", "বাবার নাম"],
  guardianEmail: ["guardian gmail", "guardian's gmail", "guardian email", "guardian's email", "parent gmail", "parent email", "অভিভাবকের জিমেইল"],
  phone: ["guardian phone", "guardian's phone", "guardian mobile", "guardian's mobile", "phone", "mobile", "mobile no", "mobile number", "phone number", "contact", "contact no", "parent phone", "parent mobile", "অভিভাবকের ফোন", "অভিভাবকের মোবাইল", "ফোন", "মোবাইল"],
  studentPhone: ["student phone", "student's phone", "student mobile", "student's mobile", "শিক্ষার্থীর ফোন", "শিক্ষার্থীর মোবাইল"],
  batch: ["batch", "batch name", "ব্যাচ"],
  school: ["school", "school/college", "college", "institution", "স্কুল", "স্কুল/কলেজ", "শিক্ষাপ্রতিষ্ঠান"],
  address: ["address", "present address", "home address", "ঠিকানা", "বর্তমান ঠিকানা"],
} as const;
export type ImportField = keyof typeof IMPORT_COLUMNS;
export const TEMPLATE_HEADER = ["Student name", "Student Gmail", "Guardian name", "Guardian Gmail", "Guardian phone", "Student phone", "Batch", "School", "Address"];

