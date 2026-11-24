"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { downloadCsv } from "@/lib/files";
import { useLms } from "@/lib/lms-store";
import { readSheetFile } from "@/lib/sheet";
import { assign, checkRows, columnInfo, FIELDS, MAX_ROWS, gridFromPieces, gridToRecords, guessFields, missingFields, rowsToFix, type Field, type ImportProblem } from "@/lib/student-import";

const FORMATS = { xlsx: "Excel", csv: "CSV", pdf: "PDF" }; // the template, made by /api/import-students

type Table = { grid: string[][]; heads: boolean; fields: Field[]; sheet: boolean };

/**
 * Import many students from Excel/CSV, or from a PDF or a photo of a table (read on this device, as "Import questions"
 * does). The person says which column is which (filled in from the headings and contents), and every row is checked
 * with the same rules as the enrol form before anything is added.
 */
export function ImportStudents({ batchNames, notify }: { batchNames: string[]; notify: (msg: string) => void }) {
  const { t } = useLang();
  const R = t.roster;
  const I = t.importer;
  const Q = t.qimport;
  const lms = useLms();
  const [batch, setBatch] = useState(batchNames[0] ?? "");
  const [table, setTable] = useState<Table | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = async (file: File) => {
    setError("");
    setTable(null);
    setBusy(Q.reading);
    try {
      const sheet = /\.(xlsx|csv)$/i.test(file.name);
      let grid: string[][];
      if (sheet) grid = await readSheetFile(file);
      else {
        const { readDocument } = await import("@/lib/read-document");
        const { pieces } = await readDocument(file, (p) => setBusy(p.step === "ocr" ? Q.ocrPage(p.page ?? 1, p.pages ?? 1) : p.step === "loadingOcr" ? Q.loadingOcr : Q.reading), { pieces: true });
        grid = gridFromPieces(pieces);
      }
      const guess = guessFields(grid, batchNames);
      const count = gridToRecords(grid, [], guess.heads).length;
      if (!count) return setError(I.none); // no row with anything in it
      if (count > MAX_ROWS) return setError(I.tooMany);
      setTable({ grid, sheet, ...guess });
    } catch {
      setError(I.unreadable);
    } finally {
      setBusy("");
    }
  };
  const missing = table ? missingFields(table.fields) : [];
  // Checked once per change of the table, batch or students, not on every render (batchNames is a new array each render, so it goes by its text).
  const namesKey = JSON.stringify(batchNames);
  const rows = useMemo(() => (table && !missing.length ? checkRows(gridToRecords(table.grid, table.fields, table.heads), batch, JSON.parse(namesKey) as string[], lms.students, table.sheet && table.heads ? 2 : 1) : null), [table, missing.length, batch, namesKey, lms.students]);
  const good = rows?.filter((r) => !r.problems.length) ?? [];
  const why = (p: ImportProblem) => (typeof p === "string" ? R.errors[p] : I.unknownBatch(p.unknownBatch));

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{I.title}</h2>
      <p className="text-sm text-on-surface-variant">{I.sub}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{I.template}:</span>
        {Object.entries(FORMATS).map(([f, label]) => (
          <a key={f} href={`/api/import-students?format=${f}&batch=${encodeURIComponent(batch)}`} download={`instanton-students-template.${f}`} aria-label={`${I.template} (${label})`} className="rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary no-underline">
            {label}
          </a>
        ))}
        <label className="flex items-center gap-2 text-sm font-semibold">{I.defaultBatch}
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className="h-10 rounded-full border border-outline-variant px-3">{batchNames.map((b) => <option key={b}>{b}</option>)}</select>
        </label>
        <label className={`rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary ${busy ? "opacity-70" : "cursor-pointer"}`}>
          {busy || I.choose}
          <input type="file" accept=".xlsx,.csv,.pdf,image/*" disabled={!!busy} className="sr-only" aria-label={I.choose} onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      {table && (
        <div className="flex flex-col gap-2 rounded-[14px] bg-surface-container p-3">
          <h3 className="font-bold">{I.mapTitle}</h3>
          <p className="text-sm text-on-surface-variant">{I.mapHelp}</p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={table.heads} onChange={(e) => setTable({ ...table, ...guessFields(table.grid, batchNames, e.target.checked) })} className="h-5 w-5 accent-primary" />
            {I.heads}
          </label>
          <ul className="flex flex-col gap-1.5">
            {columnInfo(table.grid, table.heads).map((c, i) => {
              const label = c.heading || I.column(i + 1);
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{label}</b> <span className="text-on-surface-variant">{c.samples.join(" · ") || "—"}</span>
                  </span>
                  <select aria-label={label} value={table.fields[i] ?? ""} onChange={(e) => setTable({ ...table, fields: assign(table.fields, i, e.target.value as Field) })} className="h-10 rounded-full border border-outline-variant bg-white px-3 font-semibold">
                    <option value="">{I.unused}</option>
                    {FIELDS.map((f) => <option key={f} value={f}>{I.cols[f]}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && <p role="alert" className="text-sm font-semibold text-error">{I.unmapped(missing.map((f) => I.cols[f]).join(", "))}</p>}
        </div>
      )}
      {rows && (
        <>
          <p className="font-semibold">{I.summary(good.length, rows.length - good.length)}</p>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.line} className={`rounded-[10px] px-3 py-2 text-sm ${r.problems.length ? "bg-error-container text-on-error-container" : "bg-surface-container"}`}>
                <b>{I.row(r.line)}</b> {[r.input.name, r.input.email, r.input.guardianName, r.input.phone].map((v) => v || "—").join(" · ")} · {r.input.batch}
                {r.problems.length > 0 && <span className="block font-semibold">{r.problems.map(why).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {table && (
        <div className="flex flex-wrap gap-2">
          {rows && (
            <button
              type="button"
              disabled={!good.length}
              onClick={() => {
                good.forEach((r) => lms.addStudent({ ...r.input, mode: "offline", feePaid: false }));
                notify(I.done(good.length));
                setTable(null);
              }}
              className="h-11 rounded-full bg-primary px-5 font-bold text-on-primary disabled:opacity-50"
            >
              {I.import(good.length)}
            </button>
          )}
          {rows && good.length < rows.length && (
            <button type="button" onClick={() => downloadCsv("instanton-students-to-fix.csv", rowsToFix(rows))} className="h-11 rounded-full bg-surface-container px-5 font-bold text-primary">
              {I.toFix}
            </button>
          )}
          <button type="button" onClick={() => setTable(null)} className="h-11 rounded-full bg-surface-container px-5 font-bold">{t.common.cancel}</button>
        </div>
      )}
    </section>
  );
}
