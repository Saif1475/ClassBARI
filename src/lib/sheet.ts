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

export async function readSheetFile(file: File) {
  return /\.xlsx$/i.test(file.name) ? readXlsx(await file.arrayBuffer()) : readCsv(await file.text());
}

/** Column headings we understand (English or Bangla, any case) -> field. */
export const IMPORT_COLUMNS = {
  name: ["student name", "name", "নাম", "শিক্ষার্থীর নাম"],
  email: ["student gmail", "gmail", "email", "student email", "জিমেইল"],
  guardianName: ["guardian name", "guardian", "অভিভাবকের নাম", "অভিভাবক"],
  guardianEmail: ["guardian gmail", "guardian email", "অভিভাবকের জিমেইল"],
  phone: ["guardian phone", "phone", "mobile", "অভিভাবকের ফোন", "ফোন"],
  studentPhone: ["student phone", "শিক্ষার্থীর ফোন"],
  batch: ["batch", "ব্যাচ"],
  school: ["school", "স্কুল"],
  address: ["address", "ঠিকানা"],
} as const;
export type ImportField = keyof typeof IMPORT_COLUMNS;
export const TEMPLATE_HEADER = ["Student name", "Student Gmail", "Guardian name", "Guardian Gmail", "Guardian phone", "Student phone", "Batch", "School", "Address"];

/** First row = headings. Returns one object per data row, using the fields we recognise. */
export function rowsToRecords(rows: string[][]) {
  const [head = [], ...data] = rows;
  const map = head.map((h) => (Object.keys(IMPORT_COLUMNS) as ImportField[]).find((f) => (IMPORT_COLUMNS[f] as readonly string[]).includes(h.trim().toLowerCase())));
  const missing = (["name", "email", "guardianName", "guardianEmail", "phone"] as ImportField[]).filter((f) => !map.includes(f));
  const records = data.map((r) => Object.fromEntries(map.flatMap((f, i) => (f ? [[f, r[i] ?? ""]] : []))) as Partial<Record<ImportField, string>>);
  return { records, missing };
}
