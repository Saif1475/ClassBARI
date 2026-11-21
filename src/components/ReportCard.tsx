"use client";

import { REAL_AUTH } from "@/lib/auth-mode";
import { useState } from "react";
import { Logo } from "./Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtMonth } from "@/lib/dates";
import { quizResults, useLms } from "@/lib/lms-store";
import { waLink } from "@/lib/site";

/** Monthly report card for one student. Teachers can write the comment; parents read it. */
export function ReportCard({ studentId, editable }: { studentId: number; editable?: boolean }) {
  const { t, lang } = useLang();
  const R = t.report;
  const lms = useLms();
  const s = lms.students.find((x) => x.id === studentId);
  const [comment, setComment] = useState(lms.reportComments[studentId] ?? "");
  if (!s) return <p className="p-8 text-on-surface-variant">{t.teacher.noMatch}</p>;

  const month = fmtMonth(new Date().toISOString(), lang);
  const modules = lms.modules.filter((m) => m.batch === s.batch && m.published);
  const att = lms.attendanceOf(s.id);
  const quizzes = quizResults(modules, s.id);
  const tasks = modules.flatMap((m) => m.items.filter((it) => it.kind === "task" || it.kind === "exam"));
  const teacherName = lms.batches.find((b) => b.name === s.batch)?.teacher ?? lms.teacherName;
  const saved = lms.reportComments[studentId] ?? "";
  const shareText = R.shareText(s.name, month, att.pct, quizzes.map((q) => `${q.title} ${q.score}/${q.points}`).join(", "), saved);

  const row = (label: string, value: string) => (
    <div key={label} className="flex justify-between gap-3 border-b border-outline-variant/50 py-2 text-sm last:border-0">
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-8">
      <article className="flex flex-col gap-4 rounded-[18px] border border-outline-variant bg-white p-6 print:border-0 print:p-0">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-sm text-on-surface-variant">{teacherName}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold">{R.title}</h1>
          <p className="text-on-surface-variant">{s.name} · {t.common.roll} {s.id} · {s.batch} · {month}</p>
        </div>

        <section>
          <h2 className="font-bold">{R.attendance}</h2>
          {row(att.held ? t.parent.classesOf(att.present, att.held) : t.parent.noClasses, att.held ? `${att.pct}%` : "—")}
        </section>
        {!REAL_AUTH && (
          <section>
            <h2 className="font-bold">{R.exams}</h2>
            {row(t.student.ch4, `${s.ch4Score}/30`)}
            {row(t.student.ch3, `${s.ch3Score}/30`)}
          </section>
        )}
        <section>
          <h2 className="font-bold">{R.quizzes}</h2>
          {quizzes.length === 0 ? <p className="py-2 text-sm text-on-surface-variant">{t.student.noQuizYet}</p> : quizzes.map((q) => row(q.title, `${q.score}/${q.points}`))}
        </section>
        {tasks.length > 0 && (
          <section>
            <h2 className="font-bold">{R.assignments}</h2>
            {tasks.map((it) => {
              const sub = it.submissions?.[s.id];
              return row(it.title, !sub ? R.notSubmitted : sub.grade !== undefined ? `${sub.grade}/${it.points ?? 20}` : t.sub.waiting);
            })}
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="font-bold">{R.comment}</h2>
          {editable ? (
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={() => lms.setReportComment(s.id, comment.trim())}
              placeholder={R.commentPh}
              aria-label={R.comment}
              className="rounded-xl border border-outline bg-white p-3 text-sm print:border-0 print:p-0"
            />
          ) : (
            <p className="text-sm">{saved || R.noComment}</p>
          )}
        </section>
      </article>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="h-12 rounded-full bg-primary px-6 font-bold text-on-primary">{R.print}</button>
        {editable && (
          <a href={waLink(s.phone, shareText)} target="_blank" rel="noreferrer" className="flex h-12 items-center rounded-full bg-[#128c7e] px-6 font-bold text-white">
            {R.share}
          </a>
        )}
      </div>
    </div>
  );
}
