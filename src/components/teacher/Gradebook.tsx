"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { usePaged } from "@/components/Pager";
import { itemScores, type CourseModule, type ModuleItem } from "@/lib/lms-store";

const outOf = (it: ModuleItem) => it.points ?? (it.kind === "quiz" ? 30 : 20);

/** Marks per student from real work: the latest quizzes, homework and written exams that have marks. */
export function Gradebook({ students, modules }: { students: { id: number; name: string }[]; modules: CourseModule[] }) {
  const { t } = useLang();
  const T = t.teacher;
  const items = modules.flatMap((m) => m.items).filter((it) => Object.keys(itemScores(it)).length > 0).slice(-6);
  const { shown, pager } = usePaged(students);
  if (!items.length) return <p className="rounded-[18px] border border-outline-variant bg-white p-6 text-on-surface-variant">{T.noMarksYet}</p>;
  return (
    <>
      <p className="text-sm text-on-surface-variant">{T.gradesHelpReal}</p>
      <div className="overflow-x-auto rounded-[18px] border border-outline-variant bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/70 bg-surface-container/60 text-xs font-bold uppercase text-on-surface-variant">
            <tr>
              <th className="px-5 py-3.5">{T.gStudent}</th>
              {items.map((it) => (
                <th key={it.id} className="max-w-40 px-4 py-3.5">{it.title} ({outOf(it)})</th>
              ))}
              <th className="px-4 py-3.5">{T.gAvg}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const parts = items.flatMap((it) => (itemScores(it)[s.id] === undefined ? [] : [itemScores(it)[s.id] / outOf(it)]));
              return (
                <tr key={s.id} className="border-t border-white/60">
                  <td className="px-5 py-3 font-bold">
                    {t.common.roll} {s.id} · {s.name}
                    <Link href={`/teacher/report/${s.id}`} className="ml-2 rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-primary">{t.report.open}</Link>
                  </td>
                  {items.map((it) => (
                    <td key={it.id} className="px-4 py-3 font-semibold">{itemScores(it)[s.id] ?? "—"}</td>
                  ))}
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-extrabold text-on-secondary-container">
                      {parts.length ? `${Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100)}%` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pager}
    </>
  );
}
