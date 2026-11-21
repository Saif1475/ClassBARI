"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";

/** Photo of handwritten notes -> editable text -> My notes. Recognition runs on the OCR service. */
export function HandwritingToText() {
  const { t } = useLang();
  const H = t.hw;
  const lms = useLms();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [done, setDone] = useState("");

  const read = async (file: File) => {
    setBusy(true);
    setError("");
    setDone("");
    setText(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/handwriting", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503) setError(H.offline);
      else if (!res.ok) setError(H.failed);
      else if (!body.text) setError(H.nothing);
      else setText(body.text);
    } catch {
      setError(H.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container p-4">
      <div>
        <h3 className="font-bold">{H.title}</h3>
        <p className="text-xs text-on-surface-variant">{H.sub}</p>
      </div>
      <label className={`inline-flex h-10 cursor-pointer items-center self-start rounded-full bg-primary px-4 text-sm font-bold text-on-primary ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {H.choose}
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      </label>
      {busy && <p role="status" className="text-sm font-semibold text-primary">{H.reading}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
      {text !== null && (
        <>
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {H.check}
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} className="rounded-xl border border-outline bg-white p-3 text-sm font-normal text-on-surface" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!text.trim()} onClick={() => { lms.addNote(H.noteTitle, text.trim()); setDone(t.kp.saved); }} className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-on-primary disabled:opacity-50">
              {t.kp.save}
            </button>
            <button type="button" disabled={!text.trim()} onClick={() => navigator.clipboard.writeText(text).then(() => setDone(t.kp.copied))} className="h-10 rounded-full border border-outline-variant bg-white px-5 text-sm font-bold disabled:opacity-50">
              {t.kp.copy}
            </button>
            {done && <span role="status" className="text-sm font-semibold text-primary">{done}</span>}
          </div>
        </>
      )}
    </section>
  );
}
