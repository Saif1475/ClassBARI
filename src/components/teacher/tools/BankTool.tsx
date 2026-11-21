"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { subjects, type BankQuestion } from "@/lib/mock-data";
import { dayFromToday } from "@/lib/dates";
import { useLms } from "@/lib/lms-store";
import { parseQuiz, seededOrder } from "@/lib/quiz";
import type { ToolProps } from "./ToolsPage";
import { QuestionImport } from "../QuestionImport";

const box = "h-11 rounded-[10px] border border-outline bg-white px-3";
const DIFF = ["easy", "medium", "hard"] as const;

/** The teacher's own questions (typed here + every question from their tests); "make a test" picks at random. */
export function BankTool({ batchNames, notify }: ToolProps) {
  const { t } = useLang();
  const B = t.bank;
  const lms = useLms();
  const fromTests: (Omit<BankQuestion, "id"> & { id: string })[] = lms.modules
    .filter((m) => batchNames.includes(m.batch))
    .flatMap((m) => m.items.flatMap((it) => (it.questions ?? []).map((q, i) => ({ ...q, id: `${it.id}-${i}`, subject: "", difficulty: "medium" as const }))));
  const seen = new Set<string>();
  const pool = [...lms.bank.map((q) => ({ ...q, id: String(q.id), own: true })), ...fromTests.map((q) => ({ ...q, own: false }))].filter((q) => !seen.has(q.q) && seen.add(q.q));

  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [diff, setDiff] = useState("all");
  const match = pool.filter((q) => (subject === "all" || q.subject === subject) && (topic === "all" || q.topic === topic) && (diff === "all" || q.difficulty === diff));
  const topics = [...new Set(pool.map((q) => q.topic).filter(Boolean))] as string[];

  const [text, setText] = useState("");
  const [newSubject, setNewSubject] = useState(subjects[0]);
  const [newDiff, setNewDiff] = useState<(typeof DIFF)[number]>("medium");
  const [error, setError] = useState("");

  const modules = lms.modules.filter((m) => batchNames.includes(m.batch));
  const [count, setCount] = useState("10");
  const [title, setTitle] = useState("");
  const [moduleId, setModuleId] = useState(String(modules[0]?.id ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{B.makeTitle}</h2>
        <div className="flex flex-wrap gap-2">
          <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={B.subject} className={box}>
            <option value="all">{B.allSubjects}</option>
            {subjects.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={B.topic} className={box}>
            <option value="all">{B.allTopics}</option>
            {topics.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={diff} onChange={(e) => setDiff(e.target.value)} aria-label={B.difficulty} className={box}>
            <option value="all">{B.allLevels}</option>
            {DIFF.map((d) => <option key={d} value={d}>{B.levels[d]}</option>)}
          </select>
        </div>
        <p className="text-sm font-semibold">{B.matching(match.length)}</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.min(match.length, Math.max(1, Number(count) || 1));
            const questions = seededOrder(match.length, Date.now() % 100000).slice(0, n).map((i) => {
              const { q, options, answer, topic: tp, section } = match[i];
              return { q, options, answer, ...(tp ? { topic: tp } : {}), ...(section ? { section } : {}) };
            });
            lms.addModuleItem(Number(moduleId), { kind: "quiz", title: title.trim(), meta: "", points: n, dueDate: dayFromToday(7), questions });
            notify(B.made(title.trim(), n));
            setTitle("");
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold">{B.testName}<input required value={title} onChange={(e) => setTitle(e.target.value)} className={box} /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">{B.howMany}<input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} className={`${box} w-24`} /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">{B.into}
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={box}>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title} · {m.batch}</option>)}
            </select>
          </label>
          <button type="submit" disabled={match.length === 0 || !moduleId} className="h-11 rounded-full bg-primary px-5 font-bold text-on-primary disabled:opacity-50">{B.make}</button>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{B.addTitle}</h2>
        <p className="text-sm text-on-surface-variant">{t.teacher.questionsHelp} {t.skills.tagHint}</p>
        <QuestionImport onText={(txt) => setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${txt}` : txt))} />
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.teacher.questionsPh} aria-label={B.addTitle} className="rounded-xl border border-outline p-3 font-mono text-sm" />
        <div className="flex flex-wrap gap-2">
          <select value={newSubject} onChange={(e) => setNewSubject(e.target.value)} aria-label={B.subject} className={box}>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={newDiff} onChange={(e) => setNewDiff(e.target.value as (typeof DIFF)[number])} aria-label={B.difficulty} className={box}>{DIFF.map((d) => <option key={d} value={d}>{B.levels[d]}</option>)}</select>
          <button
            type="button"
            onClick={() => {
              const r = parseQuiz(text);
              if (r.badQuestion) return setError(t.teacher.quizError(r.badQuestion));
              if (!r.questions.length) return setError(t.teacher.quizNeedsQuestions);
              lms.addBankQuestions(r.questions.map((q) => ({ ...q, subject: newSubject, difficulty: newDiff })));
              notify(B.added(r.questions.length));
              setText("");
              setError("");
            }}
            className="h-11 rounded-full bg-secondary-container px-5 font-bold text-on-secondary-container"
          >
            {B.add}
          </button>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
        <p className="text-xs text-on-surface-variant">{B.copyright}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{B.list(match.length)}</h2>
        {match.slice(0, 100).map((q) => (
          <div key={q.id} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 text-sm">
            <span className="flex-1">
              <b>{q.q}</b>
              <span className="block text-xs text-on-surface-variant">
                ✓ {q.options[q.answer]} · {[q.subject, q.topic, B.levels[q.difficulty]].filter(Boolean).join(" · ")} {!q.own && `· ${B.fromTest}`}
              </span>
            </span>
            {q.own && <button type="button" onClick={() => lms.deleteBankQuestion(Number(q.id))} className="text-xs font-bold text-error">{t.common.remove}</button>}
          </div>
        ))}
      </section>
    </div>
  );
}
