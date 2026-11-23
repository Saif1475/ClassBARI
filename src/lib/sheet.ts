// Read the first sheet of an Excel (.xlsx) or CSV file into rows of text, without a spreadsheet library.
// .xlsx is a zip of XML files; the browser (and Node) can unzip "deflate" data with DecompressionStream.
// Pure code apart from that stream (also used by scripts/sheet.test.mjs).

async function inflate(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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
    out.set(name, dec.decode(method === 8 ? await inflate(raw) : raw));
  }
  return out;
}

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" } as Record<string, string>)[e.toLowerCase()],
  );
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet1\.xml$/.test(n));
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("no sheet");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? texts(body) : unescape(v);
      cells[ref ? colIndex(ref) : cells.length] = value.trim();
    }
    return Array.from(cells, (x) => x ?? "");
  });
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
export function readCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = "";
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

/** Rows as CSV text for Excel. Leading = + - @ are neutralised so cells can't run formulas. */
export const csvText = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((v) => `"${String(v).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`).join(",")).join("\r\n");

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

