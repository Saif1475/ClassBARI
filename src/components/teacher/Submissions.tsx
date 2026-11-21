"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtWhen } from "@/lib/dates";
import { openDataUrl } from "@/lib/files";
import { useLms, type ModuleItem, type RubricCriterion, type Submission } from "@/lib/lms-store";

/** Assignment hand-ins for one task, with a grade + comment per student. */
export function Submissions({ moduleId, item, onSaved }: { moduleId: number; item: ModuleItem; onSaved: (msg: string) => void }) {
  const { t } = useLang();
  const lms = useLms();
  const subs = Object.entries(item.submissions ?? {});
  if (subs.length === 0) return <p className="px-1 text-xs text-on-surface-variant">{t.sub.none}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {subs.map(([id, sub]) => (
        <Row
          key={id}
          name={lms.students.find((s) => s.id === Number(id))?.name ?? "—"}
          sub={sub}
          points={item.points ?? 20}
          rubric={item.rubric}
          onSave={(grade, comment, rubricScores) => {
            lms.gradeSubmission(moduleId, item.id, Number(id), grade, comment, rubricScores);
            onSaved(t.sub.saved);
          }}
        />
      ))}
    </ul>
  );
}

function Row({ name, sub, points, rubric, onSave }: { name: string; sub: Submission; points: number; rubric?: RubricCriterion[]; onSave: (grade: number, comment: string, rubricScores?: number[]) => void }) {
  const { t, lang } = useLang();
  const [grade, setGrade] = useState(sub.grade?.toString() ?? "");
  // With a rubric the grade is the sum of the criterion marks.
  const [marks, setMarks] = useState<string[]>(() => rubric?.map((_, i) => sub.rubricScores?.[i]?.toString() ?? "") ?? []);
  const rubricTotal = marks.reduce((s, m) => s + (Number(m) || 0), 0);
  const [comment, setComment] = useState(sub.comment ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container px-3 py-2.5 text-sm">
      <span className="flex min-w-36 flex-1 flex-col">
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-on-surface-variant">{sub.fileName} · {t.sub.submitted(fmtWhen(sub.at, lang))}</span>
      </span>
      {sub.file && (
        <button type="button" onClick={() => openDataUrl(sub.file!)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-primary">
          {t.sub.view}
        </button>
      )}
      {rubric?.length ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {rubric.map((c, i) => (
            <label key={c.name} className="flex items-center gap-1 text-xs font-semibold">
              {c.name}
              <input
                type="number"
                min={0}
                max={c.max}
                value={marks[i]}
                onChange={(e) => setMarks(marks.map((m, j) => (j === i ? e.target.value : m)))}
                aria-label={`${name} — ${c.name} (${c.max})`}
                placeholder={`/${c.max}`}
                className="h-9 w-16 rounded-[10px] border border-outline bg-white px-1 text-center font-bold"
              />
            </label>
          ))}
          <span className="text-xs font-bold">{t.rubric.total(rubricTotal)}</span>
        </span>
      ) : (
      <input
        type="number"
        min={0}
        max={points}
        value={grade}
        onChange={(e) => setGrade(e.target.value)}
        aria-label={`${t.sub.grade} (${points})`}
        placeholder={`/${points}`}
        className="h-9 w-20 rounded-[10px] border border-outline bg-white px-2 text-center font-bold"
      />
      )}
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.sub.comment} aria-label={t.sub.comment} className="h-9 min-w-40 flex-1 rounded-[10px] border border-outline bg-white px-3" />
      <button
        type="button"
        disabled={rubric?.length ? marks.some((m) => m === "") : grade === ""}
        onClick={() =>
          rubric?.length
            ? onSave(rubricTotal, comment.trim(), marks.map((m, i) => Math.max(0, Math.min(rubric[i].max, Number(m) || 0))))
            : onSave(Math.max(0, Math.min(points, Number(grade))), comment.trim())
        }
        className="h-9 rounded-full bg-primary px-4 text-xs font-bold text-on-primary disabled:opacity-50"
      >
        {t.sub.save}
      </button>
    </li>
  );
}
