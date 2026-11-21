"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { planUsage } from "@/lib/seat-billing";
import { CONTACT_EMAIL, WHATSAPP_NUMBER, waLink } from "@/lib/site";

/** Institute plan size: up to 250 students included; bigger institutes contact us for a price. */
export function SeatBillingCard({ totalStudents }: { totalStudents: number }) {
  const { t } = useLang();
  const B = t.seats;
  const u = planUsage(totalStudents);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{B.title}</h2>
          <p className="text-sm text-on-surface-variant">{B.sub(u.limit)}</p>
        </div>
        <span className="text-2xl font-extrabold">{B.count(u.students, u.limit)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
        <div className={`h-full rounded-full ${u.over ? "bg-error" : u.near ? "bg-tertiary" : "bg-primary"}`} style={{ width: `${u.pct}%` }} />
      </div>
      {(u.near || u.over) && (
        <div role="status" className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ${u.over ? "bg-error-container text-on-error-container" : "bg-tertiary-container text-on-tertiary-container"}`}>
          <p className="flex-1 font-semibold">{u.over ? B.over(u.limit) : B.near(u.limit)}</p>
          {WHATSAPP_NUMBER && <a href={waLink(WHATSAPP_NUMBER, B.waText(u.students))} target="_blank" rel="noreferrer" className="rounded-full bg-[#128c7e] px-4 py-2 text-sm font-bold text-white">WhatsApp</a>}
          {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-primary">{B.email}</a>}
          <Link href="/support" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary">{B.callUs}</Link>
        </div>
      )}
    </section>
  );
}
