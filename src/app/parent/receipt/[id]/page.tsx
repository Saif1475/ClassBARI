"use client";

import { use } from "react";
import { Logo } from "@/components/Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtDate, fmtTime } from "@/lib/dates";
import { taka } from "@/lib/mock-data";
import { useLms } from "@/lib/lms-store";

export default function Receipt({ params }: PageProps<"/parent/receipt/[id]">) {
  const { id } = use(params);
  const { t, lang } = useLang();
  const P = t.parent;
  const lms = useLms();
  // Parents only see their own children's receipts.
  const payment = lms.payments.find((p) => String(p.id) === id && lms.parentChildren.includes(p.studentId));
  const student = lms.students.find((s) => s.id === payment?.studentId);
  if (!payment) return <p className="p-8 text-on-surface-variant">{P.receiptMissing}</p>;

  const rows: [string, string][] = [
    [P.receiptNo, String(payment.id)],
    [P.student, `${student?.name ?? ""} (${t.common.roll} ${payment.studentId})`],
    [P.batch, payment.batch],
    [P.date, `${fmtDate(payment.at, lang)} ${new Date(payment.at).getFullYear()} · ${fmtTime(payment.at, lang)}`],
    [P.method, P.methods[payment.method]],
  ];

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-8">
      <article className="flex flex-col gap-5 rounded-[18px] border border-outline-variant bg-white p-6 print:border-0 print:p-0">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-sm text-on-surface-variant">{lms.batches.find((b) => b.name === payment.batch)?.teacher}</span>
        </div>
        <h1 className="text-2xl font-bold">{P.receiptTitle}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-on-surface-variant">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between rounded-xl bg-secondary-container px-5 py-4 text-on-secondary-container">
          <span className="font-semibold">{P.amount}</span>
          <span className="text-3xl font-extrabold">{taka(payment.amount)}</span>
        </div>
        <p className="text-xs text-on-surface-variant">{P.receiptNote}</p>
      </article>
      <button type="button" onClick={() => window.print()} className="h-12 self-start rounded-full bg-primary px-6 font-bold text-on-primary print:hidden">
        {P.print}
      </button>
    </div>
  );
}
