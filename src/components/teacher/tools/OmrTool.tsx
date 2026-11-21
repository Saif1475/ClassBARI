"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { OPTIONS, parseKey, readSheet, toGray } from "@/lib/omr";
import { markQuiz, scoreQuiz } from "@/lib/quiz";
import type { ToolProps } from "./ToolsPage";

type Sheet = { id: number; file: string; roll: number | null; set: number; answers: (number | null)[]; unclear: number[]; saved?: boolean; failed?: boolean };

async function photoToGray(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return toGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

/** Paper MCQ exams: print sheets, photograph the filled ones, check, save marks to the test (and its merit list). */
export function OmrTool({ batchNames, notify }: ToolProps) {
  const { t } = useLang();
  const O = t.omr;
  const lms = useLms();
  const tests = lms.modules
    .filter((m) => batchNames.includes(m.batch))
    .flatMap((m) => m.items.filter((it) => it.kind === "quiz" && it.questions?.length && it.questions.length <= 100 && it.questions.every((q) => q.options.length <= 4)).map((it) => ({ m, it })));
  const [pick, setPick] = useState(tests[0] ? String(tests[0].it.id) : "");
  const [extraKeys, setExtraKeys] = useState(["", "", ""]); // sets B, C, D
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [busy, setBusy] = useState(false);
  const sel = tests.find((x) => String(x.it.id) === pick);
  if (!sel) return <p className="text-on-surface-variant">{O.noTest}</p>;
  const n = sel.it.questions!.length;
  const keys = [sel.it.questions!.map((q) => q.answer), ...extraKeys.map(parseKey)];
  const roster = lms.students.filter((s) => s.batch === sel.m.batch);
  const points = sel.it.points ?? n;

  const scan = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out: Sheet[] = [];
    for (const f of Array.from(files)) {
      const r = await photoToGray(f).then((g) => readSheet(g, n)).catch(() => null);
      out.push(r ? { id: Math.random(), file: f.name, roll: roster.some((s) => s.id === r.roll) ? r.roll : null, set: r.set ?? 0, answers: r.answers, unclear: r.unclear } : { id: Math.random(), file: f.name, roll: null, set: 0, answers: [], unclear: [], failed: true });
    }
    setSheets((s) => [...out, ...s]);
    setBusy(false);
  };
  const update = (id: number, patch: Partial<Sheet>) => setSheets((all) => all.map((s) => (s.id === id ? { ...s, ...patch, saved: false } : s)));
  const result = (s: Sheet) => {
    const key = keys[s.set];
    if (!key || key.length !== n) return null;
    const qs = key.map((answer) => ({ q: "", options: OPTIONS, answer }));
    return { score: scoreQuiz(qs, s.answers, points, sel.it.negative), marks: markQuiz(qs, s.answers) };
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{O.step1}</h2>
        <select value={pick} onChange={(e) => { setPick(e.target.value); setSheets([]); }} aria-label={O.test} className="h-12 rounded-xl border border-outline px-4">
          {tests.map(({ m, it }) => <option key={it.id} value={it.id}>{it.title} · {m.batch} ({it.questions!.length})</option>)}
        </select>
        <Link href={`/teacher/print?kind=omr&n=${n}&title=${encodeURIComponent(sel.it.title)}`} target="_blank" className="self-start rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary">
          {O.printBlank(n)}
        </Link>
        <details>
          <summary className="cursor-pointer text-sm font-bold text-primary">{O.sets}</summary>
          <p className="my-2 text-sm text-on-surface-variant">{O.setsHelp(n)}</p>
          {extraKeys.map((k, i) => (
            <label key={i} className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {O.setKey(OPTIONS[i + 1])}
              <input value={k} onChange={(e) => setExtraKeys(extraKeys.map((x, j) => (j === i ? e.target.value : x)))} placeholder="ABDC…" className="h-10 flex-1 rounded-[10px] border border-outline px-3 font-mono uppercase" />
              {k && (parseKey(k)?.length === n ? "✓" : <span className="text-error">{O.keyBad(parseKey(k)?.length ?? 0, n)}</span>)}
            </label>
          ))}
        </details>
      </section>

      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{O.step2}</h2>
        <p className="text-sm text-on-surface-variant">{O.photoTips}</p>
        <label className="self-start rounded-full bg-secondary-container px-5 py-3 font-bold text-on-secondary-container">
          {busy ? O.reading : O.addPhotos}
          <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => { scan(e.target.files); e.target.value = ""; }} className="sr-only" />
        </label>
      </section>

      {sheets.map((s) => {
        const r = result(s);
        return (
          <article key={s.id} aria-label={O.sheetOf(s.file)} className={`flex flex-col gap-3 rounded-[16px] p-5 ${s.failed ? "bg-error-container" : "bg-white"}`}>
            <p className="text-sm font-semibold text-on-surface-variant">{s.file}</p>
            {s.failed ? (
              <p role="alert" className="font-bold">{O.notFound}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold">{O.student}
                    <select value={s.roll ?? ""} onChange={(e) => update(s.id, { roll: Number(e.target.value) || null })} className={`h-10 rounded-[10px] border px-2 ${s.roll === null ? "border-error" : "border-outline"}`}>
                      <option value="">{O.pickStudent}</option>
                      {roster.map((st) => <option key={st.id} value={st.id}>{st.id} · {st.name}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold">{O.set}
                    <select value={s.set} onChange={(e) => update(s.id, { set: Number(e.target.value) })} className="h-10 rounded-[10px] border border-outline px-2">
                      {OPTIONS.map((o, i) => <option key={o} value={i}>{o}</option>)}
                    </select>
                  </label>
                </div>
                {s.unclear.length > 0 && <p className="text-sm font-bold text-error">{O.checkThese(s.unclear.map((q) => q + 1).join(", "))}</p>}
                <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                  {s.answers.map((a, q) => (
                    <button
                      key={q}
                      type="button"
                      aria-label={O.answerOf(q + 1, a === null ? O.blank : OPTIONS[a])}
                      onClick={() => update(s.id, { answers: s.answers.map((x, j) => (j === q ? (x === null ? 0 : x === 3 ? null : x + 1) : x)), unclear: s.unclear.filter((u) => u !== q) })}
                      className={`h-10 rounded-lg text-xs font-bold ${s.unclear.includes(q) ? "bg-error text-white" : a === null ? "bg-surface-container text-on-surface-variant" : "bg-primary-container text-on-primary-container"}`}
                    >
                      {q + 1}·{a === null ? "–" : OPTIONS[a]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant">{O.tapToFix}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xl font-extrabold">{r ? `${r.score} / ${points}` : O.noKey}</span>
                  <button
                    type="button"
                    disabled={!r || s.roll === null || s.saved}
                    onClick={() => {
                      lms.submitQuiz(sel.m.id, sel.it.id, s.roll!, r!.score, r!.marks);
                      setSheets((all) => all.map((x) => (x.id === s.id ? { ...x, saved: true } : x)));
                      notify(O.saved(roster.find((st) => st.id === s.roll)?.name ?? ""));
                    }}
                    className="h-11 rounded-full bg-primary px-5 font-bold text-on-primary disabled:opacity-50"
                  >
                    {s.saved ? O.savedBtn : O.save}
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
