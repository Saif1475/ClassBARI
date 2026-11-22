"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { StudentForm } from "@/components/StudentForm";
import { ImportStudents } from "./ImportStudents";
import { LoginHint } from "./LoginHint";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { usePaged } from "@/components/Pager";
import { useLms } from "@/lib/lms-store";
import { REAL_AUTH } from "@/lib/auth-mode";
import { dayKey } from "@/lib/dates";
import { PACKS } from "@/lib/ai-chat";
import { taka } from "@/lib/mock-data";

/** One month after `from` (or after today if it has passed), as YYYY-MM-DD. */
const plusMonth = (from?: string) => {
  const today = dayKey();
  const d = new Date(`${from && from >= today ? from : today}T00:00`);
  d.setMonth(d.getMonth() + 1);
  return dayKey(d);
};

/** Teacher's student directory: enrol with student + guardian Gmail, search, edit, remove. */
export function StudentsPage({ batchNames, notify }: { batchNames: string[]; notify: (msg: string) => void }) {
  const { t } = useLang();
  const R = t.roster;
  const lms = useLms();
  const [q, setQ] = useState("");
  const [batch, setBatch] = useState("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0); // remount to clear the form after enrolling

  const query = q.trim().toLowerCase();
  const waiting = lms.waiting.filter((s) => batchNames.includes(s.batch)); // joined from a link, not accepted yet
  const list = lms.students.filter(
    (s) =>
      batchNames.includes(s.batch) &&
      (batch === "all" || s.batch === batch) &&
      (!query || `${s.name} ${s.email} ${s.guardianName} ${s.guardianEmail} ${s.phone} ${s.studentPhone ?? ""}`.toLowerCase().includes(query)),
  );
  const { shown, pager } = usePaged(list, `${batch}|${query}`);
  const student = lms.students.find((s) => s.id === editing);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-10 md:pt-6 [&>*]:shrink-0">
      <div>
        <h1 className="text-3xl font-bold">{R.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{R.sub}</p>
      </div>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[16px] border-2 border-tertiary bg-tertiary-container p-4 text-on-tertiary-container">
          <h2 className="text-lg font-bold">{R.pendingTitle(waiting.length)}</h2>
          <p className="text-sm">{R.pendingHelp}</p>
          <ul className="flex flex-col gap-2">
            {waiting.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-[12px] bg-white px-4 py-3 text-sm text-on-surface">
                <span className="flex min-w-48 flex-1 flex-col">
                  <b className="[overflow-wrap:anywhere]">{s.name}</b>
                  <span className="text-on-surface-variant">{s.batch} · {s.email} · {s.guardianName} {s.phone}</span>
                </span>
                <button type="button" onClick={() => (lms.approveStudent(s.id), notify(`${s.name} ✓`))} className="h-10 rounded-full bg-primary px-5 font-bold text-on-primary">{R.approve}</button>
                <button type="button" onClick={() => window.confirm(R.rejectQ(s.name)) && lms.removeStudent(s.id)} className="h-10 rounded-full border border-error px-5 font-bold text-error">{R.reject}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-[20px] border border-outline-variant bg-white p-5">
        <h2 className="mb-4 text-lg font-bold">{R.addTitle}</h2>
        <StudentForm
          key={formKey}
          batches={batchNames}
          submitLabel={R.enrol}
          onSubmit={(input) => {
            lms.addStudent(input);
            notify(R.added(input.name.trim()));
            setFormKey((k) => k + 1);
          }}
        />
      </section>

      <ImportStudents batchNames={batchNames} notify={notify} />
      <LoginHint who="students" />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{R.directory} · {R.count(list.length)}</h2>
          <div className="flex flex-wrap gap-2">
            <label className="flex h-10 min-w-64 items-center gap-2 rounded-full border border-outline-variant bg-white px-4">
              <Icon name="search" size={16} className="text-on-surface-variant" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={R.searchPh} aria-label={R.searchPh} className="flex-1 bg-transparent text-sm outline-none" />
            </label>
            <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label={R.batch} className="h-10 rounded-full border border-outline-variant bg-white px-3 text-sm">
              <option value="all">{R.allBatches}</option>
              {batchNames.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        {list.length === 0 && <p className="text-sm text-on-surface-variant">{R.none}</p>}
        <ul className="flex flex-col gap-2">
          {shown.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[16px] border border-outline-variant bg-white px-4 py-3 text-sm">
              <span className="flex min-w-56 flex-1 flex-col">
                <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{s.name} <span className="font-normal text-on-surface-variant">· {t.common.roll} {s.id}</span></span>
                <span className="text-on-surface-variant">{s.email}</span>
              </span>
              <span className="flex min-w-56 flex-1 flex-col">
                <span className="font-semibold">{s.guardianName}</span>
                <span className="text-on-surface-variant">{s.guardianEmail} · {s.phone}</span>
              </span>
              <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold">{s.batch}</span>
              {REAL_AUTH && (
                <span className="flex flex-wrap items-center gap-2">
                  {s.premiumUntil && s.premiumUntil >= dayKey() ? (
                    <>
                      <span className="rounded-full bg-tertiary-container px-3 py-1 text-xs font-bold text-on-tertiary-container">⭐ {R.premiumUntil(s.premiumUntil)}</span>
                      <select aria-label={t.aichat.packLabel} value={s.aiPack ?? 150} onChange={(e) => lms.setStudentPremium(s.id, s.premiumUntil!, Number(e.target.value))} className="h-9 rounded-full border border-outline-variant bg-white px-2 text-xs font-bold">
                        {PACKS.map((p) => <option key={p} value={p}>{t.aichat.packLabel} {taka(p)}</option>)}
                      </select>
                      <button type="button" onClick={() => lms.setStudentPremium(s.id, plusMonth(s.premiumUntil))} className="text-xs font-bold text-primary">{R.premiumExtend}</button>
                      <button type="button" onClick={() => lms.setStudentPremium(s.id, null)} className="text-xs font-bold text-error">{R.premiumStop}</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => (lms.setStudentPremium(s.id, plusMonth()), notify(R.premiumGiven(s.name)))} className="rounded-full border border-outline-variant px-3 py-1 text-xs font-bold text-primary">⭐ {R.premiumGive}</button>
                  )}
                </span>
              )}
              <span className="flex gap-2">
                <button type="button" onClick={() => setEditing(s.id)} className="rounded-full bg-secondary-container px-4 py-1.5 text-xs font-bold text-on-secondary-container" aria-label={`${R.edit} ${s.name}`}>
                  {R.edit}
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm(t.teacher.confirmRemoveStudent(s.name)) && (lms.removeStudent(s.id), notify(t.teacher.toast.studentRemoved(s.name)))}
                  aria-label={`${t.common.remove} ${s.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container"
                >
                  <Icon name="trash" size={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
        {pager}
      </section>

      {student && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={() => setEditing(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-student" onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[20px] bg-white p-5 shadow-2xl sm:rounded-[20px] sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="edit-student" className="text-xl font-bold">{R.editTitle(student.name)}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label={t.common.close} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container">
                <Icon name="close" size={18} />
              </button>
            </div>
            <StudentForm
              initial={student}
              batches={batchNames.includes(student.batch) ? batchNames : [student.batch, ...batchNames]}
              submitLabel={R.save}
              onSubmit={(input) => {
                lms.updateStudent(student.id, input);
                notify(R.updated);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
