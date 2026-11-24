"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtWhen } from "@/lib/dates";
import { MAX_UPLOAD_BYTES, isPhoto, openDataUrl, uploadData } from "@/lib/files";
import type { RubricCriterion, Submission } from "@/lib/lms-store";

/** Student hand-in: pick a photo/PDF, submit, then see the grade and comment. */
export function SubmitAssignment({ sub, points, rubric, onSubmit }: { sub?: Submission; points: number; rubric?: RubricCriterion[]; onSubmit: (s: { fileName: string; file: string }) => void }) {
  const { t, lang } = useLang();
  const U = t.sub;
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {sub && (
        <div className="flex flex-col gap-1 rounded-xl bg-secondary-container px-4 py-3 text-sm text-on-secondary-container">
          <span className="font-bold">{sub.fileName} · {U.submitted(fmtWhen(sub.at, lang))}</span>
          <span>{sub.grade !== undefined ? U.graded(sub.grade, points) : U.waiting}</span>
          {rubric && sub.rubricScores && (
            <span className="flex flex-col">
              <b>{t.rubric.breakdown}</b>
              {rubric.map((c, i) => <span key={c.name}>{c.name}: {sub.rubricScores![i]} / {c.max}</span>)}
            </span>
          )}
          {sub.comment && <span>“{sub.comment}”</span>}
          {sub.file && (
            <button type="button" onClick={() => openDataUrl(sub.file!)} className="self-start text-xs font-bold underline">
              {U.view}
            </button>
          )}
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant">
        {U.upload}
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            const fits = !!f && (f.size <= MAX_UPLOAD_BYTES || isPhoto(f)); // big photos are made smaller when sent
            setError(f && !fits ? U.tooBig : "");
            setFile(fits ? f : null);
          }}
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary-container file:px-4 file:py-2 file:font-bold file:text-on-primary-container"
        />
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      <button
        type="button"
        disabled={!file}
        onClick={async () => {
          const data = file && (await uploadData(file));
          if (file && data) onSubmit({ fileName: file.name, file: data });
          else setError(file && isPhoto(file) ? U.badPhoto : U.tooBig); // a photo fails only when the browser can't read it (HEIC in Chrome)
        }}
        className="h-11 self-start rounded-full bg-primary px-6 text-sm font-bold text-on-primary disabled:opacity-50"
      >
        {U.submit}
      </button>
    </div>
  );
}
