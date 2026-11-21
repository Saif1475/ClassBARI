"use client";

import { REAL_AUTH } from "@/lib/auth-mode";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtDate, fmtWeekday } from "@/lib/dates";
import Link from "next/link";
import { myRank, quizResults, useLms, writtenResults } from "@/lib/lms-store";
import { useChild } from "../child";
import { TopicMastery } from "@/components/TopicMastery";
import { PointsSummary } from "@/components/dojo/PointsPanel";
import { Portfolio } from "@/components/dojo/Portfolio";
import { streak } from "@/lib/xp";

export default function ParentResults() {
  const { t, lang } = useLang();
  const P = t.parent;
  const lms = useLms();
  const { child } = useChild();
  if (!child) return <p className="p-8 text-on-surface-variant">{t.teacher.noMatch}</p>;

  const att = lms.attendanceOf(child.id);
  const quizItems = lms.modules.filter((m) => m.published && m.batch === child.batch).flatMap((m) => m.items.filter((it) => it.kind === "quiz"));
  const scored = new Map(quizResults(lms.modules, child.id).map((r) => [r.id, r]));
  // Real accounts: marked written exams and homework. Demo: its two sample tests.
  const exams = REAL_AUTH
    ? writtenResults(lms.modules.filter((m) => m.published && m.batch === child.batch), child.id).map((r) => ({ label: r.title, score: r.score, points: r.points }))
    : [{ label: t.student.ch4, score: child.ch4Score, points: 30 }, { label: t.student.ch3, score: child.ch3Score, points: 30 }];

  return (
    <div className="flex flex-col gap-5 px-4 pt-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{P.resultsTitle}</h1>
        <Link href="/parent/report" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary">{t.report.open}</Link>
      </div>

      <section className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
        <h2 className="text-lg font-bold">{P.exams}</h2>
        {exams.length === 0 && <p className="text-sm text-on-surface-variant">{t.app.noTest}</p>}
        {exams.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 rounded-xl bg-surface-container px-4 py-3">
            <span className="font-semibold">{r.label}</span>
            <span className="font-extrabold">{r.score} / {r.points}</span>
          </div>
        ))}
        <h2 className="mt-2 text-lg font-bold">{P.quizzes}</h2>
        {quizItems.map((q) => {
          const r = scored.get(q.id);
          const pos = q.meritPublished ? myRank(q, child.id) : undefined;
          return (
            <div key={q.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-container px-4 py-3">
              <span className="flex flex-col">
                <span className="font-semibold">{q.title}</span>
                {pos && <span className="text-sm font-bold text-primary">{t.exam2.childPosition(pos.rank, pos.of)}</span>}
              </span>
              <span className={r ? "font-extrabold" : "text-sm text-on-surface-variant"}>{r ? `${r.score} / ${r.points}` : P.notTaken}</span>
            </div>
          );
        })}
      </section>

      <div className="flex items-center gap-3 rounded-[18px] bg-white p-4">
        <span aria-hidden className="text-3xl">🔥</span>
        <span className="text-lg font-bold">{t.streak.days(streak(lms.xp[child.id] ?? {}).days)}</span>
      </div>
      <PointsSummary studentId={child.id} />
      <Portfolio studentIds={[child.id]} title={t.dojo.portfolioOf(child.name)} />
      <TopicMastery modules={lms.modules.filter((m) => m.published && m.batch === child.batch)} studentIds={[child.id]} />

      <section className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{P.attendanceLog}</h2>
          {att.held > 0 && <span className="text-sm font-semibold text-primary">{P.classesOf(att.present, att.held)} · {att.pct}%</span>}
        </div>
        {att.held === 0 && <p className="text-sm text-on-surface-variant">{P.noClasses}</p>}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {att.days.map((d) => {
            const absent = lms.attendance[d].includes(child.id);
            return (
              <li key={d} className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm ${absent ? "bg-error-container text-on-error-container" : "bg-secondary-container text-on-secondary-container"}`}>
                <span>{fmtWeekday(d, lang)} {fmtDate(d, lang)}</span>
                <span className="font-bold">{absent ? t.common.absent : t.common.present}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
