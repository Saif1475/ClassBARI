"use client";

import { useState } from "react";
import { StudentForm } from "@/components/StudentForm";
import { dayKey } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import type { Admission } from "@/lib/mock-data";
import { waLink } from "@/lib/site";
import type { ToolProps } from "./ToolsPage";
import { box, card, label, primary, soft } from "./ui";

const STAGES: Admission["stage"][] = ["enquiry", "called", "visited", "admitted", "lost"];

/** New-student enquiries: enquiry → called → visited → admitted (creates the student) or lost. */
export function AdmissionsTool({ batchNames, notify }: ToolProps) {
  const { t } = useLang();
  const A = t.admissions;
  const lms = useLms();
  const [f, setF] = useState({ name: "", guardian: "", phone: "", wants: batchNames[0] ?? "", followUp: "", note: "" });
  const [admitting, setAdmitting] = useState<Admission | null>(null);
  const today = dayKey();
  const open = lms.admissions.filter((a) => a.stage !== "admitted" && a.stage !== "lost");
  const due = open.filter((a) => a.followUp && a.followUp <= today);

  return (
    <div className="flex flex-col gap-4">
      {due.length > 0 && <p role="status" className="rounded-xl bg-tertiary-container px-4 py-3 font-bold text-on-tertiary-container">{A.dueToday(due.length)}</p>}
      <div className="flex flex-wrap gap-2 text-sm font-semibold">
        {STAGES.map((s) => <span key={s} className="rounded-full bg-white px-3 py-1.5">{A.stages[s]}: {lms.admissions.filter((a) => a.stage === s).length}</span>)}
      </div>
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          lms.addAdmission({ ...f, name: f.name.trim(), guardian: f.guardian.trim(), phone: f.phone.trim(), followUp: f.followUp || undefined });
          notify(A.added(f.name.trim()));
          setF({ ...f, name: "", guardian: "", phone: "", note: "", followUp: "" });
        }}
      >
        <h2 className="text-lg font-bold">{A.add}</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className={label}>{A.name}<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={box} /></label>
          <label className={label}>{A.guardian}<input value={f.guardian} onChange={(e) => setF({ ...f, guardian: e.target.value })} className={box} /></label>
          <label className={label}>{A.phone}<input required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={box} /></label>
          <label className={label}>{A.wants}<select value={f.wants} onChange={(e) => setF({ ...f, wants: e.target.value })} className={box}>{batchNames.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label className={label}>{A.followUp}<input type="date" value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })} className={box} /></label>
          <label className={label}>{A.note}<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={box} /></label>
        </div>
        <button type="submit" className={`self-start ${primary}`}>{A.addBtn}</button>
      </form>
      {lms.admissions.map((a) => (
        <article key={a.id} aria-label={a.name} className={`${card} ${a.stage === "lost" || a.stage === "admitted" ? "opacity-70" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-lg">{a.name}</b>
            <span className="text-sm text-on-surface-variant">{a.guardian && `${a.guardian} · `}{a.phone} · {a.wants}</span>
            {a.followUp && a.stage !== "admitted" && <span className={`ml-auto rounded-full px-2 text-xs font-bold ${a.followUp <= today ? "bg-error text-white" : "bg-surface-container"}`}>{A.callOn(a.followUp)}</span>}
          </div>
          {a.note && <p className="text-sm">{a.note}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${a.phone}`} className={soft}>{A.call}</a>
            <a href={waLink(a.phone)} target="_blank" rel="noreferrer" className="rounded-full bg-[#128c7e] px-4 py-2 text-sm font-bold text-white">WhatsApp</a>
            <select value={a.stage} onChange={(e) => (e.target.value === "admitted" ? setAdmitting(a) : lms.updateAdmission(a.id, { stage: e.target.value as Admission["stage"] }))} aria-label={A.stageOf(a.name)} className={box}>
              {STAGES.map((s) => <option key={s} value={s}>{A.stages[s]}</option>)}
            </select>
            <input type="date" value={a.followUp ?? ""} onChange={(e) => lms.updateAdmission(a.id, { followUp: e.target.value || undefined })} aria-label={A.followUp} className={box} />
          </div>
        </article>
      ))}
      {admitting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={() => setAdmitting(null)}>
          <div role="dialog" aria-modal="true" aria-label={A.admitTitle(admitting.name)} onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[20px] bg-white p-6 sm:rounded-[20px]">
            <h2 className="mb-1 text-xl font-bold">{A.admitTitle(admitting.name)}</h2>
            <p className="mb-4 text-sm text-on-surface-variant">{A.admitSub}</p>
            <StudentForm
              initial={{ name: admitting.name, guardianName: admitting.guardian, phone: admitting.phone, email: "", guardianEmail: "", batch: admitting.wants, mode: "offline" }}
              batches={batchNames}
              submitLabel={A.admitBtn}
              onSubmit={(input) => {
                lms.addStudent(input);
                lms.updateAdmission(admitting.id, { stage: "admitted" });
                notify(t.roster.added(input.name.trim()));
                setAdmitting(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
