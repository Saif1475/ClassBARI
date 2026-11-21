"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { taka } from "@/lib/mock-data";
import { waLink } from "@/lib/site";
import { useFlag } from "@/components/Platform";
import { postSms, type SmsResult } from "./SmsButton";

type Due = { id: number; name: string; phone: string; feeDue: number; late: boolean };

/** One WhatsApp button per unpaid student; browsers only allow one new window per tap, so they go one at a time. */
export function RemindDialog({ students, onClose }: { students: Due[]; onClose: () => void }) {
  const { t } = useLang();
  const [opened, setOpened] = useState<number[]>([]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="remind-title" onClick={(e) => e.stopPropagation()} className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-[20px] bg-white p-5 shadow-2xl sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 id="remind-title" className="text-xl font-bold">{t.fee.remindTitle}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container">
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="text-sm text-on-surface-variant">{students.length ? t.fee.remindHint : t.fee.noneDue}</p>
        {students.length > 1 && (
          // One SMS per guardian, each with their own child's amount.
          <SmsAll students={students} />
        )}
        {students.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl bg-surface-container px-4 py-3">
            <span className="flex flex-1 flex-col">
              <span className="font-semibold">{s.name}</span>
              <span className="text-xs text-on-surface-variant">{taka(s.feeDue)}{s.late ? ` · ${t.fee.late}` : ""}</span>
            </span>
            <a
              href={waLink(s.phone, t.teacher.msgFee(s.name, taka(s.feeDue)))}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpened((o) => [...o, s.id])}
              className={`rounded-full px-4 py-2 text-xs font-bold ${opened.includes(s.id) ? "bg-secondary-container text-on-secondary-container" : "bg-[#128c7e] text-white"}`}
            >
              {opened.includes(s.id) ? t.fee.opened : "WhatsApp"}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One SMS per guardian (each with their own child's amount), one after another; stops at the daily limit. */
function SmsAll({ students }: { students: Due[] }) {
  const { t } = useLang();
  const on = useFlag("sms");
  const [done, setDone] = useState<{ ok: number; failed: number; stop?: SmsResult } | null>(null);
  if (!on) return null;
  const run = async () => {
    if (!confirm(t.sms.confirmAll(students.length))) return;
    const r = { ok: 0, failed: 0 } as { ok: number; failed: number; stop?: SmsResult };
    setDone({ ...r });
    for (const s of students) {
      const res = await postSms([s.phone], t.teacher.msgFee(s.name, taka(s.feeDue)));
      if (res === "limit") { r.stop = res; break; }
      if (res === "failed") r.failed++;
      else { r.ok++; r.stop = res; }
      setDone({ ...r });
    }
    setDone({ ...r });
  };
  if (!done)
    return <button type="button" onClick={run} className="h-11 rounded-full bg-primary-container font-bold text-on-primary-container">{t.sms.all(students.length)}</button>;
  return (
    <p role="status" className="rounded-xl bg-surface-container px-4 py-3 text-sm font-semibold">
      {t.sms.progress(done.ok, students.length)}
      {done.failed > 0 && ` · ${t.sms.failed}: ${done.failed}`}
      {done.stop === "limit" && ` · ${t.sms.limit}`}
      {done.stop === "test" && ` · ${t.sms.testMode}`}
    </p>
  );
}
