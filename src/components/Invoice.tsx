"use client";

import { Logo } from "./Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtMonth } from "@/lib/dates";
import { FEE_DUE_DAY, taka } from "@/lib/mock-data";
import { monthKey, useLms } from "@/lib/lms-store";
import { invoice } from "@/lib/lms-views";

/** This month's invoice for one student: fee, discount, fine, payments, balance. Printable. */
export function Invoice({ studentId }: { studentId: number }) {
  const { t, lang } = useLang();
  const F = t.fees;
  const lms = useLms();
  const s = lms.students.find((x) => x.id === studentId);
  if (!s) return <p className="p-8 text-on-surface-variant">{t.teacher.noMatch}</p>;
  const month = monthKey();
  const batch = lms.batches.find((b) => b.name === s.batch);
  const inv = invoice(s, batch, lms.payments, month);
  const signed = (n: number) => (n < 0 ? `− ${taka(-n)}` : taka(n));
  const rows: [string, string][] = [
    ...(inv.carried ? [[F.carriedLine, signed(inv.carried)] as [string, string]] : []), // owed from earlier months, or a fee or discount changed after the charge
    [F.monthlyFee, taka(inv.fee)],
    ...(inv.discount ? [[F.discountLine, `− ${taka(inv.discount)}`] as [string, string]] : []),
    ...(inv.fine ? [[F.fineLine, `+ ${taka(inv.fine)}`] as [string, string]] : []),
    [F.paidThisMonth, taka(inv.paid)],
  ];

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-8">
      <article className="flex flex-col gap-4 rounded-[18px] border border-outline-variant bg-white p-6 print:border-0 print:p-0">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-sm text-on-surface-variant">{batch?.teacher}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold">{F.invoiceTitle} · {fmtMonth(`${month}-01`, lang)}</h1>
          <p className="text-on-surface-variant">{s.name} · {t.common.roll} {s.id} · {s.batch}</p>
        </div>
        <dl className="flex flex-col">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-outline-variant/50 py-2 text-sm">
              <dt>{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between rounded-xl bg-tertiary-container px-5 py-4 text-on-tertiary-container">
          <span className="font-semibold">{F.balance}</span>
          <span className="text-3xl font-extrabold">{taka(inv.balance)}</span>
        </div>
        <p className="text-xs text-on-surface-variant">{F.invoiceNote(FEE_DUE_DAY)}</p>
      </article>
      <button type="button" onClick={() => window.print()} className="h-12 self-start rounded-full bg-primary px-6 font-bold text-on-primary print:hidden">
        {t.parent.print}
      </button>
    </div>
  );
}
