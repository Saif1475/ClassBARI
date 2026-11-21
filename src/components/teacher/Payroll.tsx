"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtMonth } from "@/lib/dates";
import { taka } from "@/lib/mock-data";
import { monthKey, payroll, useLms } from "@/lib/lms-store";

/** Centre owner: what each teacher is owed this month (salary + share of fees collected) and payouts. */
export function Payroll({ onDone }: { onDone: (msg: string) => void }) {
  const { t, lang } = useLang();
  const P = t.payroll;
  const lms = useLms();
  const month = monthKey();
  const rows = payroll(lms, month);
  const num = "h-9 w-20 rounded-[10px] border border-outline bg-white px-2 text-center text-sm font-bold";

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{P.title} · {fmtMonth(`${month}-01`, lang)}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-bold uppercase text-on-surface-variant">
            <tr>
              <th className="py-2 pr-3">{t.centre.teacher}</th>
              <th className="py-2 pr-3">{P.salary}</th>
              <th className="py-2 pr-3">{P.share}</th>
              <th className="py-2 pr-3">{P.collected}</th>
              <th className="py-2 pr-3">{P.payable}</th>
              <th className="py-2 pr-3">{P.paid}</th>
              <th className="py-2">{P.balance}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-outline-variant/50">
                <td className="py-2 pr-3 font-semibold">{r.name}</td>
                <td className="py-2 pr-3">
                  <input type="number" min={0} aria-label={`${r.name} ${P.salary}`} defaultValue={r.salary} key={`s${r.salary}`} onBlur={(e) => lms.updateStaff(r.name, { salary: Math.max(0, Number(e.target.value) || 0) })} className={num} />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" min={0} max={100} aria-label={`${r.name} ${P.share}`} defaultValue={r.share} key={`p${r.share}`} onBlur={(e) => lms.updateStaff(r.name, { share: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} className={num} />
                </td>
                <td className="py-2 pr-3">{taka(r.collected)}</td>
                <td className="py-2 pr-3 font-bold">{taka(r.payable)}</td>
                <td className="py-2 pr-3">{taka(r.paid)}</td>
                <td className="py-2">
                  {r.balance > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(P.confirm(r.name, taka(r.balance)))) return;
                        lms.payStaff(r.name, r.balance);
                        onDone(P.paidOk(r.name));
                      }}
                      className="whitespace-nowrap rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-on-primary"
                    >
                      {P.pay} {taka(r.balance)}
                    </button>
                  ) : (
                    <span className="text-on-surface-variant">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
