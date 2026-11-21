"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { downloadCsv } from "@/lib/files";
import { useLms } from "@/lib/lms-store";
import { readSheetFile, rowsToRecords, TEMPLATE_HEADER } from "@/lib/sheet";
import { validateStudent, type StudentContact } from "@/lib/site";

type Row = { line: number; input: StudentContact & { batch: string; school?: string; address?: string }; problems: string[] };

// Excel drops the leading 0 of phone numbers stored as numbers (1711234511 -> 01711234511).
const fixPhone = (p = "") => (/^1[3-9]\d{8}$/.test(p.replace(/\D/g, "")) ? `0${p.replace(/\D/g, "")}` : p);

/** Import many students from Excel/CSV: every row is checked with the same rules as the enrol form before anything is added. */
export function ImportStudents({ batchNames, notify }: { batchNames: string[]; notify: (msg: string) => void }) {
  const { t } = useLang();
  const R = t.roster;
  const I = t.importer;
  const lms = useLms();
  const [batch, setBatch] = useState(batchNames[0] ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const load = async (file: File) => {
    setError("");
    try {
      const { records, missing } = rowsToRecords(await readSheetFile(file));
      if (missing.length) return setError(I.missing(missing.map((f) => I.cols[f]).join(", ")));
      const accepted: { id: number; email: string; guardianEmail: string }[] = [...lms.students];
      setRows(
        records.map((r, i) => {
          const input = { name: r.name ?? "", email: r.email ?? "", guardianName: r.guardianName ?? "", guardianEmail: r.guardianEmail ?? "", phone: fixPhone(r.phone), studentPhone: fixPhone(r.studentPhone) || undefined, batch: r.batch && batchNames.includes(r.batch) ? r.batch : batch, school: r.school, address: r.address };
          const problems = Object.values(validateStudent(input, accepted)).map((e) => R.errors[e!]);
          if (r.batch && !batchNames.includes(r.batch)) problems.push(I.unknownBatch(r.batch));
          if (!problems.length) accepted.push({ id: -1 - i, email: input.email, guardianEmail: input.guardianEmail }); // catches duplicates inside the file too
          return { line: i + 2, input, problems };
        }),
      );
    } catch {
      setError(I.unreadable);
    }
  };
  const good = rows?.filter((r) => !r.problems.length) ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{I.title}</h2>
      <p className="text-sm text-on-surface-variant">{I.sub}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => downloadCsv("classbari-students-template.csv", [TEMPLATE_HEADER, ["Nusrat Jahan", "nusrat@gmail.com", "Kamal Jahan", "kamal@gmail.com", "01711234511", "", batch, "", ""]])} className="rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary">
          {I.template}
        </button>
        <label className="flex items-center gap-2 text-sm font-semibold">{I.defaultBatch}
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className="h-10 rounded-full border border-outline-variant px-3">{batchNames.map((b) => <option key={b}>{b}</option>)}</select>
        </label>
        <label className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary">
          {I.choose}
          <input type="file" accept=".xlsx,.csv" className="sr-only" aria-label={I.choose} onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      {rows && (
        <>
          <p className="font-semibold">{I.summary(good.length, rows.length - good.length)}</p>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.line} className={`rounded-[10px] px-3 py-2 text-sm ${r.problems.length ? "bg-error-container text-on-error-container" : "bg-surface-container"}`}>
                <b>{I.row(r.line)}</b> {r.input.name || "—"} · {r.input.email || "—"} · {r.input.batch}
                {r.problems.length > 0 && <span className="block font-semibold">{r.problems.join(" · ")}</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!good.length}
              onClick={() => {
                good.forEach((r) => lms.addStudent({ ...r.input, mode: "offline", feePaid: false }));
                notify(I.done(good.length));
                setRows(null);
              }}
              className="h-11 rounded-full bg-primary px-5 font-bold text-on-primary disabled:opacity-50"
            >
              {I.import(good.length)}
            </button>
            <button type="button" onClick={() => setRows(null)} className="h-11 rounded-full bg-surface-container px-5 font-bold">{t.common.cancel}</button>
          </div>
        </>
      )}
    </section>
  );
}
