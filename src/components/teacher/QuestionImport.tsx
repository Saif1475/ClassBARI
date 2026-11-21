"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { parseLooseMcq, rowsToMcq, toQuizText, type Imported } from "@/lib/question-import";
import { readCsv, readDocxText, readXlsx } from "@/lib/sheet";

/**
 * "Import questions": Excel/CSV, Word (.docx), text, or a PDF/photo of a printed paper (OCR, on this device).
 * The questions are put into the question box as text, so the teacher checks and fixes them before publishing.
 */
export function QuestionImport({ onText }: { onText: (text: string) => void }) {
  const { t } = useLang();
  const Q = t.qimport;
  const [state, setState] = useState<{ busy?: string; done?: { n: number; problems: number[] }; error?: string }>({});

  const read = async (file: File): Promise<Imported> => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx")) return rowsToMcq(await readXlsx(await file.arrayBuffer()));
    if (name.endsWith(".csv")) return rowsToMcq(readCsv(await file.text()));
    if (name.endsWith(".docx")) return parseLooseMcq(await readDocxText(await file.arrayBuffer()));
    if (name.endsWith(".txt")) return parseLooseMcq(await file.text());
    // PDF or photo: typed PDFs use their text; scans and photos are read with OCR (English + Bangla)
    const { readDocument } = await import("@/lib/read-document");
    const { text } = await readDocument(file, (p) => setState({ busy: p.step === "ocr" ? Q.ocrPage(p.page ?? 1, p.pages ?? 1) : p.step === "loadingOcr" ? Q.loadingOcr : Q.reading }));
    return parseLooseMcq(text);
  };

  const pick = async (file: File) => {
    setState({ busy: Q.reading });
    try {
      const r = await read(file);
      if (!r.questions.length) return setState({ error: Q.none });
      onText(toQuizText(r.questions));
      setState({ done: { n: r.questions.length, problems: r.problems } });
    } catch {
      setState({ error: Q.failed });
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-outline-variant bg-surface-container/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full bg-secondary-container px-4 py-2 text-sm font-bold text-on-secondary-container">
          {state.busy ?? Q.button}
          <input type="file" accept=".xlsx,.csv,.docx,.txt,.pdf,image/*" disabled={!!state.busy} aria-label={Q.button} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
        </label>
        <span className="text-xs font-normal text-on-surface-variant">{Q.formats}</span>
      </div>
      {state.done && (
        <p role="status" className="text-sm font-semibold text-primary">
          {Q.done(state.done.n)} {state.done.problems.length > 0 && <span className="text-error">{Q.noAnswer(state.done.problems.join(", "))}</span>}
        </p>
      )}
      {state.error && <p role="alert" className="text-sm font-semibold text-error">{state.error}</p>}
    </div>
  );
}
