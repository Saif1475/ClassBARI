"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { extractKeywords, keySentences } from "@/lib/keywords";
import { useLms } from "@/lib/lms-store";
import { MAX_PAGES, readDocument, type Progress } from "@/lib/read-document";
import { loadFile } from "@/lib/file-store";

type Result = { keywords: string[]; sentences: string[]; truncated: boolean };

/** Read a PDF/photo, show keywords + key sentences, let the student tick what to save to My notes. */
export function KeyPoints({ title, url }: { title: string; url?: string }) {
  const { t } = useLang();
  const K = t.kp;
  const lms = useLms();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set()); // unticked items
  const [done, setDone] = useState("");

  const run = async (file: Blob) => {
    setError("");
    setResult(null);
    setDone("");
    setOff(new Set());
    try {
      const { text, truncated } = await readDocument(file, setProgress);
      const kws = extractKeywords(text);
      if (!text.trim() || kws.length + keySentences(text, kws).length === 0) setError(K.nothing);
      else setResult({ keywords: kws.map((k) => k.term), sentences: keySentences(text, kws), truncated });
    } catch {
      setError(K.failed);
    } finally {
      setProgress(null);
    }
  };

  const fromLink = async () => {
    let file: Blob;
    try {
      file = await loadFile(url!); // uploaded to this device, on this site, or a web link
    } catch {
      return setError(K.linkFailed); // most file hosts (Google Drive…) don't allow reading from another site
    }
    await run(file);
  };

  const chosen = result ? { keywords: result.keywords.filter((k) => !off.has(k)), sentences: result.sentences.filter((s) => !off.has(s)) } : null;
  const noteText = chosen ? [chosen.keywords.length ? `${K.keywords}: ${chosen.keywords.join(", ")}` : "", ...chosen.sentences.map((s) => `• ${s}`)].filter(Boolean).join("\n") : "";
  const toggle = (x: string) => setOff((o) => {
    const n = new Set(o);
    if (n.has(x)) n.delete(x);
    else n.add(x);
    return n;
  });
  const busy = progress !== null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container p-4">
      <div>
        <h3 className="font-bold">{K.title}</h3>
        <p className="text-xs text-on-surface-variant">{K.sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={`inline-flex h-10 cursor-pointer items-center rounded-full bg-primary px-4 text-sm font-bold text-on-primary ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {K.choose}
          <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
        </label>
        {url && (
          <button type="button" disabled={busy} onClick={fromLink} className="h-10 rounded-full border border-outline-variant bg-white px-4 text-sm font-bold text-primary disabled:opacity-50">
            {K.fromTeacher}
          </button>
        )}
      </div>

      {progress && (
        <p role="status" className="text-sm font-semibold text-primary">
          {progress.step === "loadingOcr" ? K.loadingOcr : progress.step === "ocr" ? K.ocr(progress.page!, progress.pages!) : K.reading(progress.page!, progress.pages!)}
        </p>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}

      {result && chosen && (
        <div className="flex flex-col gap-3">
          {result.truncated && <p className="text-xs text-on-surface-variant">{K.truncated(MAX_PAGES)}</p>}
          <p className="text-xs text-on-surface-variant">{K.pickHint}</p>
          {result.keywords.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">{K.keywords}</span>
              <div className="flex flex-wrap gap-1.5">
                {result.keywords.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={!off.has(k)}
                    onClick={() => toggle(k)}
                    className={`rounded-full px-3 py-1 text-sm ${off.has(k) ? "border border-outline-variant text-on-surface-variant line-through" : "bg-primary-container font-semibold text-on-primary-container"}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
          {result.sentences.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">{K.sentences}</span>
              {result.sentences.map((s) => (
                <label key={s} className="flex items-start gap-2 rounded-[10px] bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={!off.has(s)} onChange={() => toggle(s)} className="mt-1 accent-primary" />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!noteText}
              onClick={() => {
                lms.addNote(title, noteText);
                setDone(K.saved);
              }}
              className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-on-primary disabled:opacity-50"
            >
              {K.save}
            </button>
            <button
              type="button"
              disabled={!noteText}
              onClick={() => navigator.clipboard.writeText(noteText).then(() => setDone(K.copied))}
              className="h-10 rounded-full border border-outline-variant bg-white px-5 text-sm font-bold disabled:opacity-50"
            >
              {K.copy}
            </button>
            {done && <span role="status" className="text-sm font-semibold text-primary">{done}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
