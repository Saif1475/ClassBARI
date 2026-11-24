import { loadPart, STAFF_ROLES, whoIs } from "@/lib/data-server";
import { readPieces } from "@/lib/pdf-mark";
import { limited } from "@/lib/rate-limit";
import { csvText, readCsv, readXlsx, TOO_MANY_ROWS, writeXlsx } from "@/lib/sheet";
import { studentListPdf } from "@/lib/student-list-pdf";
import { checkRows, columnInfo, FIELDS, MAX_ROWS, gridFromPieces, gridToRecords, guessFields, missingFields, templateRows, type Field } from "@/lib/student-import";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv; charset=utf-8", pdf: "application/pdf" };

/**
 * The template, as an Excel sheet, a CSV file or a PDF (?format=xlsx|csv|pdf): the website's and the app's
 * "Download template". The sheets have one example student, in the batch picked; the PDF has empty lines to fill in.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const format = q.get("format") === "xlsx" || q.get("format") === "pdf" ? (q.get("format") as "xlsx" | "pdf") : "csv";
  const rows = templateRows((q.get("batch") ?? "").slice(0, 80));
  const body =
    format === "xlsx"
      ? writeXlsx(rows, [4, 5]) // the two phone columns as text: Excel keeps the 0 in front
      : format === "pdf"
        ? await studentListPdf([], "Instanton Campus: student list", "One student per row. Every student needs a name, a Gmail, the guardian's name, the guardian's Gmail and the guardian's phone.")
        : `﻿${csvText(rows)}`; // the mark that tells Excel the file is UTF-8
  return new Response(typeof body === "string" ? body : new Blob([body as BlobPart]), { headers: { "Content-Type": TYPES[format], "Content-Disposition": `attachment; filename="instanton-students-template.${format}"` } });
}

/**
 * The phone app's "Add students from a file", worked out as the website does it: the file as a table (an Excel or CSV
 * sheet, or a PDF's table found from where its words sit), what each column holds (as the app sends it in `fields`,
 * comma-separated, or filled in from the headings and contents), and every row checked. Nothing is added here: the app
 * then sends addStudent for each good row, which is checked again as usual. The app sends the same file again after
 * the person changes a column. A scanned PDF has no text to read here; the website reads scans on the computer itself.
 */
export async function POST(request: Request) {
  const me = await whoIs(request);
  if (!me || !STAFF_ROLES.includes(me.who.role)) return Response.json({ error: "staff only" }, { status: 403 });
  const busy = limited(request, "import-students", 60, 10 * 60_000, me.who.email); // reading a PDF takes the server's time
  if (busy) return busy;
  const buf = await request.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_BYTES) return Response.json({ error: "size" }, { status: 413 });
  const { students, batches } = await loadPart(me.institute, "students", "batches");
  // A teacher may add students only to their own batches, so only those count (the server refuses the others anyway).
  const names = batches.filter((b) => me.who.role !== "teacher" || b.teacher === me.who.name).map((b) => b.name);
  const type = request.headers.get("content-type") ?? "";
  const q = new URL(request.url).searchParams;
  try {
    let grid: string[][];
    if (type.includes("pdf")) {
      const pieces = await readPieces(new Uint8Array(buf));
      if (pieces.map((p) => p.str).join("").replace(/\s/g, "").length < 30) return Response.json({ error: "scan" }, { status: 422 });
      grid = gridFromPieces(pieces);
    } else grid = type.includes("csv") ? readCsv(new TextDecoder().decode(buf), MAX_ROWS + 1) : await readXlsx(buf, MAX_ROWS + 1); // + 1 for the heading row
    const guess = guessFields(grid, names, q.has("heads") ? q.get("heads") === "1" : undefined);
    const asked = q.get("fields")?.split(",") as Field[] | undefined;
    const fields = asked && asked.length === guess.fields.length && asked.every((f) => f === "" || FIELDS.includes(f)) ? asked : guess.fields;
    const missing = missingFields(fields);
    const batch = q.get("batch") ?? "";
    const records = gridToRecords(grid, fields, guess.heads);
    if (records.length > MAX_ROWS) return Response.json({ error: "tooMany" }, { status: 413 }); // checking a huge list would hold up the server for everyone
    const rows = missing.length ? [] : checkRows(records, names.includes(batch) ? batch : (names[0] ?? ""), names, students, !type.includes("pdf") && guess.heads ? 2 : 1);
    return Response.json({ columns: columnInfo(grid, guess.heads), heads: guess.heads, fields, missing, rows });
  } catch (e) {
    if (e instanceof Error && e.message === TOO_MANY_ROWS) return Response.json({ error: "tooMany" }, { status: 413 });
    return Response.json({ error: "unreadable" }, { status: 422 });
  }
}
