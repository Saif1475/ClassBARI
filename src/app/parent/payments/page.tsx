"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { taka } from "@/lib/mock-data";
import { useChild } from "./../child";
import { useLms } from "@/lib/lms-store";

export default function ParentPayments() {
  const { t, lang } = useLang();
  const P = t.parent;
  const lms = useLms();
  const { child } = useChild();
  if (!child) return <p className="p-8 text-on-surface-variant">{t.teacher.noMatch}</p>;
  const payments = lms.payments.filter((p) => p.studentId === child.id);

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 md:px-8">
      <h1 className="text-3xl font-bold">{P.paymentsTitle}</h1>

      {child.feeDue > 0 && (
        <Link href="/parent#pay" className="flex items-center justify-between rounded-[18px] bg-tertiary-container p-5 font-bold text-on-tertiary-container">
          <span>{P.feeFor(fmtMonth(new Date().toISOString(), lang))}</span>
          <span className="text-2xl">{taka(child.feeDue)}</span>
        </Link>
      )}

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{P.history}</h2>
          <Link href="/parent/invoice" className="text-sm font-bold text-primary underline">{t.fees.invoice}</Link>
        </div>
        {payments.length === 0 && <p className="text-sm text-on-surface-variant">{P.noPayments}</p>}
        {payments.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-[14px] border border-outline-variant bg-white p-4">
            <span className="flex flex-1 flex-col">
              <span className="font-bold">{taka(p.amount)}</span>
              <span className="text-xs text-on-surface-variant">{fmtDate(p.at, lang)} · {P.methods[p.method]}</span>
            </span>
            <Link href={`/parent/receipt/${p.id}`} className="rounded-full bg-secondary-container px-4 py-2 text-sm font-bold text-on-secondary-container">
              {P.receipt}
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
