"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { CourseModule } from "@/lib/lms-store";
import type { QuizQuestion } from "@/lib/quiz";

/** Untimed practice from the course's quiz questions, one chapter at a time, with instant feedback. */
export function Practice({ modules, mistakes = [], onCorrect }: { modules: CourseModule[]; mistakes?: QuizQuestion[]; onCorrect?: () => void }) {
  const { t } = useLang();
  const P = t.practice;
  const chapters = [
    // "My mistakes" first: questions this student got wrong in quizzes.
    ...(mistakes.length ? [{ id: -1, title: t.skills.mistakes, questions: mistakes }] : []),
    // Only questions whose answer this student may see (with real accounts: quizzes they've already taken).
    ...modules.map((m) => ({ id: m.id, title: m.title, questions: m.items.flatMap((it) => (it.questions ?? []).filter((q) => q.answer >= 0)) })),
  ].filter((c) => c.questions.length > 0);
  const [chapterId, setChapterId] = useState(chapters[0]?.id ?? 0);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [right, setRight] = useState(0);

  if (chapters.length === 0) return <p className="text-on-surface-variant">{P.empty}</p>;
  const chapter = chapters.find((c) => c.id === chapterId) ?? chapters[0];
  const q = chapter.questions[i];
  const restart = (id = chapter.id) => {
    setChapterId(id);
    setI(0);
    setPick(null);
    setRight(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-on-surface-variant">{P.sub}</p>
      <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
        {P.chapter}
        <select value={chapter.id} onChange={(e) => restart(Number(e.target.value))} className="h-11 rounded-xl border border-outline bg-white px-3 text-sm text-on-surface">
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.questions.length})</option>)}
        </select>
      </label>

      {q ? (
        <div className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
          <span className="text-xs font-semibold text-on-surface-variant">{t.quiz.questionOf(i + 1, chapter.questions.length)}</span>
          <span className="text-lg font-bold">{q.q}</span>
          {q.options.map((opt, oi) => {
            const tone = pick === null ? "border-outline-variant" : oi === q.answer ? "border-primary bg-primary-container" : oi === pick ? "border-error bg-error-container" : "border-outline-variant opacity-60";
            return (
              <button
                key={oi}
                type="button"
                disabled={pick !== null}
                onClick={() => {
                  setPick(oi);
                  if (oi === q.answer) {
                    setRight((r) => r + 1);
                    onCorrect?.();
                  }
                }}
                className={`rounded-xl border px-4 py-3 text-left text-sm ${tone}`}
              >
                {opt}
              </button>
            );
          })}
          {pick !== null && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className={`font-semibold ${pick === q.answer ? "text-primary" : "text-error"}`}>{pick === q.answer ? P.correct : P.wrong(q.options[q.answer])}</span>
              <button type="button" onClick={() => { setI(i + 1); setPick(null); }} className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-on-primary">
                {P.next}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[18px] bg-secondary-container p-5 text-on-secondary-container">
          <span className="text-lg font-bold">{P.done(right, chapter.questions.length)}</span>
          <button type="button" onClick={() => restart()} className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-on-primary">{P.again}</button>
        </div>
      )}
    </div>
  );
}
