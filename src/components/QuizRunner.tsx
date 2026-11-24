"use client";

import { REAL_AUTH } from "@/lib/auth-mode";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { ModuleItem } from "@/lib/mock-data";
import { gradeFor, markQuiz, quizOrder, scoreQuiz, sectionResults } from "@/lib/quiz";
import { myRank } from "@/lib/lms-views";
import { openDataUrl } from "@/lib/files";

function useOrder(item: ModuleItem, studentId: number) {
  return useMemo(() => quizOrder(item, studentId), [item, studentId]);
}

/** Timed MCQ attempt: one minute per question, auto-submits when time runs out. */
export function QuizRunner({ item, studentId, onSubmit, onStart }: { item: ModuleItem; studentId: number; onStart?: () => void; onSubmit: (score: number, marks: boolean[], tabSwitches: number, picks: (number | null)[], took: number) => void }) {
  const { t } = useLang();
  const Q = t.quiz;
  const E = t.exam2;
  const questions = item.questions ?? [];
  const points = item.points ?? questions.length;
  const order = useOrder(item, studentId);
  const durationMin = item.timeLimitMin && item.timeLimitMin > 0 ? item.timeLimitMin : questions.length;
  const [started, setStarted] = useState(false);
  // picks are stored by the ORIGINAL question/option index, whatever order the student saw.
  const [picks, setPicks] = useState<(number | null)[]>(() => questions.map(() => null));
  const [left, setLeft] = useState(durationMin * 60);
  const [result, setResult] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const switches = useRef(0);
  const startedAt = useRef(0); // the device's own clock: lets the server spot an answer sheet that was sent late (offline)
  const submitted = useRef(false); // timer, anti-cheat and the button can race: submit exactly once
  // Real accounts: the server marks the quiz, and the right answers only arrive once it's handed in.
  const hidden = questions.some((q) => q.answer < 0);
  const [sent, setSent] = useState(false);
  const taken = item.scores?.[studentId];

  // Real accounts: the first Start on this device is kept, so leaving and coming back carries on the countdown (and the count the server checks).
  const begin = () => {
    const key = `instanton-quiz-${item.id}-${studentId}`;
    let first = Date.now();
    try {
      if (REAL_AUTH) first = Number(localStorage.getItem(key)) || (localStorage.setItem(key, String(first)), first);
    } catch {
      /* storage blocked: counted from now */
    }
    startedAt.current = Math.min(first, Date.now());
    setLeft(Math.max(0, durationMin * 60 - Math.round((Date.now() - startedAt.current) / 1000)));
    setStarted(true);
    onStart?.();
  };

  const finish = () => {
    if (submitted.current) return;
    submitted.current = true;
    const score = hidden ? 0 : scoreQuiz(questions, picksRef.current, points, item.negative);
    if (hidden) setSent(true); // wait for the server's marks
    else setResult(score);
    onSubmit(score, markQuiz(questions, picksRef.current), switches.current, picksRef.current, Math.round((Date.now() - startedAt.current) / 1000));
  };
  useEffect(() => {
    if (sent && result === null && !hidden && taken !== undefined) setResult(taken); // the server's marks have arrived
  }, [sent, result, hidden, taken]);

  useEffect(() => {
    if (!started || result !== null || sent) return;
    if (left <= 0) return finish();
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [started, left, result, sent]);

  // Anti-cheat tab-switch detection: warn on switch, auto-submit on 3rd violation.
  useEffect(() => {
    if (!started || result !== null || sent || !item.antiCheat) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      switches.current += 1;
      setTabSwitches(switches.current);
      if (switches.current >= 3) finish(); // outside any state update, so it runs once
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [started, result, sent, item.antiCheat]);

  const merit = item.meritPublished && item.scores?.[studentId] !== undefined ? myRank(item, studentId) : undefined;

  if (questions.length === 0)
    return (
      <div className="flex flex-col items-start gap-2">
        {item.scores?.[studentId] !== undefined && <span className="rounded-full bg-secondary-container px-3 py-1 text-sm font-bold text-on-secondary-container">{Q.taken(item.scores[studentId], points)}</span>}
        {merit && <span className="rounded-full bg-tertiary-container px-3 py-1 text-sm font-bold text-on-tertiary-container">{E.position(merit.rank, merit.of)}</span>}
        <p className="text-sm text-on-surface-variant">{Q.noQuestions}</p>
      </div>
    );

  if (!started && result === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        {item.scores?.[studentId] !== undefined && (
          <span className="rounded-full bg-secondary-container px-3 py-1 text-sm font-bold text-on-secondary-container">{Q.taken(item.scores[studentId], points)}</span>
        )}
        {merit && <span className="rounded-full bg-tertiary-container px-3 py-1 text-sm font-bold text-on-tertiary-container">{E.position(merit.rank, merit.of)}</span>}
        <p className="text-sm text-on-surface-variant">{Q.intro(questions.length, durationMin, points)}</p>
        {item.paper && <p className="text-sm font-semibold">{t.qimport.paperNote}</p>}
        {!!item.negative && <p className="text-sm font-semibold text-error">{E.negativeNote(item.negative)}</p>}
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-surface-container px-3 py-1 text-on-surface-variant">
            {E.passMark(item.passPct ?? 33)}
          </span>
          {item.shuffle && (
            <span className="rounded-full bg-primary-container px-3 py-1 text-on-primary-container">
              {E.shuffled}
            </span>
          )}
          {item.antiCheat && (
            <span className="rounded-full bg-error-container px-3 py-1 text-on-error-container">
              {E.antiCheatOn}
            </span>
          )}
        </div>
        {/* Real accounts: one attempt (the server keeps the first), so no second start. */}
        {!(REAL_AUTH && taken !== undefined) && (
          <button type="button" onClick={begin} className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">
            {Q.start}
          </button>
        )}
      </div>
    );
  }

  const unanswered = picks.filter((p) => p === null).length;
  const breakdown = result !== null ? sectionResults(questions, picks) : [];
  return (
    <div className="flex flex-col gap-4">
      {item.paper && (
        <button type="button" onClick={() => openDataUrl(item.paper!)} className="self-start rounded-full bg-tertiary-container px-5 py-2.5 text-sm font-bold text-on-tertiary-container">
          📄 {t.qimport.openPaper}
        </button>
      )}
      {sent && result === null ? (
        <p role="status" className="rounded-xl bg-secondary-container px-4 py-3 text-sm font-bold text-on-secondary-container">⏳ {Q.checking}</p>
      ) : result === null ? (
        <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container px-4 py-2 text-sm font-bold" role="timer" aria-live="off">
          <span>{Q.timeLeft}</span>
          <div className="flex items-center gap-3">
            {item.antiCheat && tabSwitches > 0 && (
              <span className="rounded-full bg-error-container px-2.5 py-0.5 text-xs font-bold text-on-error-container">
                {E.tabSwitches(tabSwitches)}
              </span>
            )}
            <span className={left < 30 ? "text-error" : ""}>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
          </div>
        </div>
      ) : (
        (() => {
          const g = gradeFor(result, points, undefined, item.passPct ?? 33);
          return (
            <div role="status" className="flex flex-col gap-1.5 rounded-xl bg-secondary-container px-4 py-3 text-on-secondary-container">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-extrabold">{Q.yourScore(result, points)}</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-extrabold text-on-primary">
                    {E.grade(g.label, g.pct)}
                  </span>
                  <span className={`rounded-full px-3 py-0.5 text-xs font-extrabold ${g.passed ? "bg-primary-container text-on-primary-container" : "bg-error-container text-on-error-container"}`}>
                    {g.passed ? E.pass : E.fail}
                  </span>
                </div>
              </div>
              {breakdown.map((b) => (
                <span key={b.section} className="text-sm font-semibold">
                  {b.section && `${b.section}: `}{E.breakdown(b.right, b.wrong, b.skipped)}
                </span>
              ))}
              {tabSwitches > 0 && (
                <span className="text-xs font-semibold text-error">
                  {E.leftTest(tabSwitches)}
                </span>
              )}
            </div>
          );
        })()
      )}

      {order.questions.map((qi, pos) => {
        const q = questions[qi];
        const newSection = q.section && q.section !== questions[order.questions[pos - 1]]?.section;
        return (
          <div key={qi} className="flex flex-col gap-2">
            {newSection && <h3 className="mt-2 border-b border-outline-variant pb-1 text-base font-extrabold text-primary">{q.section}</h3>}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-bold">
                <span className="block text-xs font-semibold text-on-surface-variant">{Q.questionOf(pos + 1, questions.length)}</span>
                {q.q}
              </legend>
              {order.options[qi].map((oi) => {
                const picked = picks[qi] === oi;
                const reviewTone = result === null ? "" : oi === q.answer ? "border-primary bg-primary-container" : picked ? "border-error bg-error-container" : "";
                return (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${picked && result === null ? "border-primary bg-primary-container/50" : "border-outline-variant"} ${reviewTone}`}
                  >
                    <input
                      type="radio"
                      name={`q${qi}`}
                      checked={picked}
                      disabled={result !== null || sent}
                      onChange={() => setPicks((p) => p.map((v, i) => (i === qi ? oi : v)))}
                      className="accent-primary"
                    />
                    <span className="flex-1">{q.options[oi]}</span>
                    {result !== null && oi === q.answer && <span className="text-xs font-bold">{Q.correct}</span>}
                    {result !== null && picked && oi !== q.answer && <span className="text-xs font-bold">{Q.wrong}</span>}
                  </label>
                );
              })}
            </fieldset>
          </div>
        );
      })}

      {result === null && !sent && (
        <button
          type="button"
          onClick={() => (unanswered === 0 || window.confirm(Q.confirmUnanswered(unanswered))) && finish()}
          className="h-12 rounded-full bg-primary text-sm font-bold text-on-primary"
        >
          {Q.submit}
        </button>
      )}
    </div>
  );
}
