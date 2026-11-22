"use client";

import { REAL_AUTH } from "@/lib/auth-mode";
import Link from "next/link";
import { useState } from "react";
import { LangSwitch, TextSize } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtDayNum, fmtMonth, fmtTime, fmtWeekday, liveLabel, toDate } from "@/lib/dates";
import { taka } from "@/lib/mock-data";
import { useChild } from "./child";
import { gradedResults, useLms } from "@/lib/lms-store";
import { StoryFeed } from "@/components/dojo/StoryFeed";
import { PushToggle } from "@/components/PushToggle";
import { RoutineCard } from "@/components/teacher/tools/RoutineTool";
import { BookMeeting } from "@/components/teacher/tools/MeetingsTool";

export default function ParentView() {
  const { t, lang } = useLang();
  const P = t.parent;
  const lms = useLms();
  const { child } = useChild();
  const [amount, setAmount] = useState(""); // empty = pay the full due

  if (!child) return <p className="p-8 text-on-surface-variant">{t.teacher.noMatch}</p>;

  const att = lms.attendanceOf(child.id);
  const lastPayment = lms.payments.find((p) => p.studentId === child.id);
  const upcoming = lms.calendar.filter((e) => e.batch === child.batch && toDate(e.start).getTime() > Date.now() - 90 * 60000).slice(0, 3);

  const last = gradedResults(lms.modules, child.id).at(-1); // the newest marked quiz, exam or homework
  // A part payment must be whole taka from 1 to what is due; anything else is refused, not quietly turned into ৳1.
  const part = Number(amount);
  const partOk = amount.trim() === "" || (Number.isInteger(part) && part >= 1 && part <= child.feeDue);
  const toPay = amount.trim() === "" ? child.feeDue : part;
  const pay = () => {
    if (!partOk || !window.confirm(P.confirmPay(taka(toPay)))) return;
    lms.payFee(child.id, "bkash", toPay);
    setAmount("");
  };

  const teacher = lms.staff.find((x) => x.name === lms.batches.find((b) => b.name === child.batch)?.teacher);
  const row = "flex items-center gap-3 rounded-xl bg-surface-container px-4 py-3 text-lg";

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-13 w-13 items-center justify-center rounded-[18px_18px_18px_6px] bg-tertiary-container text-xl font-bold text-on-tertiary-container">{child.name.charAt(0)}</span>
        <div className="flex min-w-40 flex-1 flex-col">
          <span className="text-sm text-on-surface-variant">{P.parentView} · {child.batch}</span>
          <span className="text-[22px] font-bold">{child.name}</span>
        </div>
        <TextSize />
        <div className="flex items-center gap-2 md:hidden">
          <LangSwitch compact />
        </div>
        <Link href="/settings" className="rounded-full px-3 py-2 text-base font-semibold text-primary hover:bg-surface-container">
          ⚙ {t.settings.title}
        </Link>
      </header>

      {/* The three questions a guardian asks first, in plain sentences */}
      <section className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
        <h2 className="text-xl font-bold">{t.glance.title}</h2>
        <Link href="/parent/results" className={row}>
          <span aria-hidden>📅</span>
          <span className="flex-1">{att.held ? t.glance.attended(att.present, att.held) : P.noClasses}</span>
          <Icon name="chevronRight" size={20} />
        </Link>
        <div className={row}>
          <span aria-hidden>💳</span>
          <span className={`flex-1 ${child.feeDue > 0 ? "font-bold text-error" : ""}`}>{child.feeDue > 0 ? t.glance.feeDue(taka(child.feeDue)) : t.glance.feePaid}</span>
          {child.feeDue === 0 && lastPayment && (
            <Link href={`/parent/receipt/${lastPayment.id}`} className="text-base font-bold text-primary underline">{P.receipt}</Link>
          )}
        </div>
        <Link href="/parent/report" className={row}>
          <span aria-hidden>📝</span>
          <span className="flex-1">{last ? t.glance.lastTest(`${last.score}/${last.points}`) : REAL_AUTH ? t.app.noTest : t.glance.lastTest(`${child.ch4Score}/30`)}</span>
          <Icon name="chevronRight" size={20} />
        </Link>
      </section>

      {child.feeDue > 0 && (
        <section id="pay" className="flex flex-col gap-2 rounded-[18px] bg-tertiary-container p-5 text-on-tertiary-container">
          <span className="text-base">{P.feeFor(fmtMonth(new Date().toISOString(), lang))}</span>
          <span className="text-4xl font-extrabold">{taka(child.feeDue)}{child.late ? ` · ${t.fee.late}` : ""}</span>
          {REAL_AUTH ? (
            // shortcut: online payment is still being built; the institute records fees it receives.
            <p className="text-base font-semibold">{t.auth.payAtInstitute}</p>
          ) : (
          <>
          <button type="button" onClick={pay} disabled={!partOk} className="mt-1 flex h-14 disabled:opacity-50 items-center justify-center rounded-full bg-bkash text-lg font-bold text-white">
            {P.payBkash} · {taka(toPay)}
          </button>
          <details className="text-base">
            <summary className="cursor-pointer font-semibold underline">{t.glance.payPart}</summary>
            <label className="mt-2 flex flex-wrap items-center gap-2 font-semibold">
              {t.fees.payAmount}
              <input
                type="number"
                min={1}
                max={child.feeDue}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(child.feeDue)}
                className="h-11 w-36 rounded-[10px] border border-on-tertiary-container/30 bg-white px-3 text-on-surface"
              />
            </label>
            <span className="text-sm">{t.fees.installmentHint}</span>
          </details>
          </>
          )}
          {!REAL_AUTH && <span className="text-center text-sm">{P.demoPay}</span>}
          <Link href="/parent/invoice" className="self-start text-base font-bold underline">{t.fees.invoice}</Link>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
        <h2 className="text-xl font-bold">{t.glance.talk}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {teacher?.phone && (
            <a href={`tel:${teacher.phone.replace(/[^\d+]/g, "")}`} className="flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-lg font-bold text-on-primary">
              📞 {t.glance.call(teacher.name)}
            </a>
          )}
          <Link href="/parent/messages" className="flex h-14 items-center justify-center gap-2 rounded-full bg-secondary-container text-lg font-bold text-on-secondary-container">
            <Icon name="message" size={20} /> {t.glance.message}
          </Link>
        </div>
      </section>

      <span className="text-xl font-bold">{P.upcoming}</span>
      {upcoming.length === 0 && <span className="text-on-surface-variant">{P.noUpcoming}</span>}
      {upcoming.map((e) => (
        <div key={e.id} className="flex items-center gap-3 rounded-[14px] border border-outline-variant bg-white p-3">
          <span className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-primary leading-tight text-on-primary">
            <span className="text-lg font-bold">{fmtDayNum(e.start, lang)}</span>
            <span className="text-xs">{fmtWeekday(e.start, lang)}</span>
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-base font-semibold">{e.title}</span>
            <span className="text-sm text-on-surface-variant">{e.allDay ? t.kinds[e.kind] : `${fmtTime(e.start, lang)} · ${t.kinds[e.kind]}`}</span>
          </span>
          {e.id === "live" && (
            <span className="rounded-full bg-primary-container px-2.5 py-1 text-sm font-semibold text-on-primary-container">{liveLabel(t, lang, e.start)}</span>
          )}
        </div>
      ))}

      <BookMeeting childId={child.id} batch={child.batch} />
      <RoutineCard batch={child.batch} />
      <PushToggle role="parent" batches={[...new Set(lms.students.filter((s) => lms.parentChildren.includes(s.id)).map((s) => s.batch))]} />
      <StoryFeed batch={child.batch} />
    </div>
  );
}
