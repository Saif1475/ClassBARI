"use client";

import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { shrinkImage } from "@/lib/image";
import { itemScores, useLms } from "@/lib/lms-store";
import type { ToolProps } from "./ToolsPage";

const btn = "rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary";

/** ID cards, admit cards and certificates: pick a batch, add photos, open the print page. */
export function CardsTool({ batchNames }: ToolProps) {
  const { t } = useLang();
  const C = t.cards;
  const lms = useLms();
  const [batch, setBatch] = useState(batchNames[0] ?? "");
  const students = lms.students.filter((s) => s.batch === batch);
  const exams = lms.modules.filter((m) => m.batch === batch).flatMap((m) => m.items.filter((it) => it.kind === "quiz" || it.kind === "exam"));
  const [exam, setExam] = useState("");
  const examId = exam || String(exams[0]?.id ?? "");
  const marked = exams.filter((it) => Object.keys(itemScores(it)).length > 0);
  const [meritItem, setMeritItem] = useState("");
  const meritId = meritItem || String(marked[0]?.id ?? "");
  const q = (s: string) => encodeURIComponent(s);

  return (
    <div className="flex flex-col gap-4">
      <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label={t.roster.batch} className="h-12 self-start rounded-xl border border-outline bg-white px-4">
        {batchNames.map((b) => <option key={b}>{b}</option>)}
      </select>

      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{C.idTitle}</h2>
        <p className="text-sm text-on-surface-variant">{C.idSub}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {students.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.photo ? <img src={s.photo} alt="" className="h-12 w-10 rounded object-cover" /> : <span className="flex h-12 w-10 items-center justify-center rounded bg-white font-bold">{s.name.charAt(0)}</span>}
              <span className="flex-1 text-sm font-semibold">{s.name}</span>
              <label className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-xs font-bold text-primary">
                {s.photo ? C.changePhoto : C.addPhoto}
                <input type="file" accept="image/*" aria-label={C.photoOf(s.name)} className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) lms.setStudentPhoto(s.id, await shrinkImage(f)); e.target.value = ""; }} />
              </label>
            </li>
          ))}
        </ul>
        <Link href={`/teacher/print?kind=idcards&batch=${q(batch)}`} target="_blank" className={`self-start ${btn}`}>{C.printId(students.length)}</Link>
      </section>

      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{C.admitTitle}</h2>
        {exams.length === 0 ? <p className="text-sm text-on-surface-variant">{C.noExams}</p> : (
          <>
            <select value={examId} onChange={(e) => setExam(e.target.value)} aria-label={C.exam} className="h-11 rounded-[10px] border border-outline px-3">
              {exams.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
            </select>
            <Link href={`/teacher/print?kind=admit&item=${examId}`} target="_blank" className={`self-start ${btn}`}>{C.printAdmit}</Link>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[16px] bg-white p-5">
        <h2 className="text-lg font-bold">{C.certTitle}</h2>
        <Link href={`/teacher/print?kind=certificate&type=completion&batch=${q(batch)}`} target="_blank" className={`self-start ${btn}`}>{C.printCompletion}</Link>
        {marked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={meritId} onChange={(e) => setMeritItem(e.target.value)} aria-label={C.exam} className="h-11 rounded-[10px] border border-outline px-3">
              {marked.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
            </select>
            <Link href={`/teacher/print?kind=certificate&type=merit&item=${meritId}`} target="_blank" className={btn}>{C.printMerit}</Link>
          </div>
        )}
      </section>
    </div>
  );
}
