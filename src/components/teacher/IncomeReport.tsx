"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { useMemo } from "react";
import { dayKey, fmtMonth } from "@/lib/dates";
import { downloadCsv } from "@/lib/files";
import { taka } from "@/lib/mock-data";
import { incomeByMonth, useLms } from "@/lib/lms-store";

/** Fees collected per month (last 6) and per batch, plus who still owes. */
export function IncomeReport({ batchNames }: { batchNames: string[] }) {
  const { t, lang } = useLang();
  const I = t.income;
  const lms = useLms();

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return dayKey(d).slice(0, 7);
  });
  const monthsKey = months.join(), namesKey = batchNames.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the two keys stand for the lists
  const sum = useMemo(() => incomeByMonth(lms.payments, months, batchNames), [lms.payments, monthsKey, namesKey]);
  const owing = lms.students.filter((s) => s.feeDue > 0 && batchNames.includes(s.batch));
  const label = (m: string) => fmtMonth(`${m}-01`, lang);

  const exportCsv = () =>
    downloadCsv(`income-${months[0]}.csv`, [
      [I.month, ...batchNames, I.total],
      ...months.map((m) => [m, ...batchNames.map((b) => sum(m, b)), sum(m)]),
      [],
      [I.owes, t.teacher.gStudent, t.common.due],
      ...owing.map((s) => [s.batch, s.name, s.feeDue]),
    ]);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{I.title}</h2>
        <button type="button" onClick={exportCsv} className="rounded-full border border-outline-variant bg-white px-4 py-2 text-xs font-bold text-primary">
          {I.export}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-bold uppercase text-on-surface-variant">
            <tr>
              <th className="py-2 pr-4">{I.month}</th>
              {batchNames.map((b) => <th key={b} className="py-2 pr-4">{b}</th>)}
              <th className="py-2">{I.total}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m} className="border-t border-outline-variant/50">
                <td className="py-2 pr-4 font-semibold">{label(m)}</td>
                {batchNames.map((b) => <td key={b} className="py-2 pr-4">{taka(sum(m, b))}</td>)}
                <td className="py-2 font-extrabold">{taka(sum(m))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {owing.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold">{I.owes}</h3>
          {owing.map((s) => (
            <div key={s.id} className="flex justify-between rounded-[10px] bg-surface-container px-3 py-2 text-sm">
              <span>{s.name} · <span className="text-on-surface-variant">{s.batch}</span></span>
              <span className="font-bold">{taka(s.feeDue)}{s.late ? ` · ${t.fee.late}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
