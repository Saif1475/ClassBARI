"use client";

import { useState } from "react";
import { dayKey } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { monthKey, useLms } from "@/lib/lms-store";
import type { ToolProps } from "./ToolsPage";
import { box, card, label, primary } from "./ui";

/** Staff attendance (today) and leave requests. Only the centre owner ("all" view) approves leave. */
export function StaffTool({ notify }: ToolProps) {
  const { t } = useLang();
  const S = t.staffTool;
  const lms = useLms();
  const owner = lms.viewer === "all";
  const today = dayKey();
  const absentToday = lms.staffAbsent[today] ?? [];
  const month = monthKey();
  const absentDays = (name: string) => Object.entries(lms.staffAbsent).filter(([d, names]) => d.startsWith(month) && names.includes(name)).length;
  const [f, setF] = useState({ name: owner ? lms.staff[0]?.name ?? "" : lms.viewer, from: today, to: today, reason: "" });

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h2 className="text-lg font-bold">{S.today}</h2>
        {lms.staff.map((s) => {
          const present = !absentToday.includes(s.name);
          return (
            <div key={s.name} className="flex items-center gap-3 rounded-[10px] bg-surface-container px-3 py-2">
              <span className="flex-1 font-semibold">{s.name}<span className="block text-xs font-normal text-on-surface-variant">{S.absentThisMonth(absentDays(s.name))}</span></span>
              <button type="button" disabled={!owner} aria-pressed={present} aria-label={`${s.name}: ${present ? S.present : S.absent}`} onClick={() => lms.toggleStaffAbsent(s.name)} className={`h-10 rounded-full px-4 text-sm font-bold ${present ? "bg-secondary-container text-on-secondary-container" : "bg-error text-white"}`}>
                {present ? S.present : S.absent}
              </button>
            </div>
          );
        })}
        <p className="text-xs text-on-surface-variant">{S.payrollNote}</p>
      </section>

      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          lms.requestLeave({ ...f, reason: f.reason.trim() });
          notify(S.requested);
          setF({ ...f, reason: "" });
        }}
      >
        <h2 className="text-lg font-bold">{S.ask}</h2>
        <div className="flex flex-wrap gap-2">
          <label className={label}>{S.who}
            <select value={f.name} disabled={!owner} onChange={(e) => setF({ ...f, name: e.target.value })} className={box}>{lms.staff.map((s) => <option key={s.name}>{s.name}</option>)}</select>
          </label>
          <label className={label}>{S.from}<input type="date" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={box} /></label>
          <label className={label}>{S.to}<input type="date" required min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={box} /></label>
          <label className={`${label} flex-1`}>{S.reason}<input required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={box} /></label>
        </div>
        <button type="submit" className={`self-start ${primary}`}>{S.send}</button>
      </form>

      <section className={card}>
        <h2 className="text-lg font-bold">{S.requests}</h2>
        {lms.staffLeave.length === 0 && <p className="text-sm text-on-surface-variant">{S.none}</p>}
        {lms.staffLeave.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-container px-3 py-2 text-sm">
            <b>{l.name}</b>
            <span className="flex-1">{l.from === l.to ? l.from : `${l.from} → ${l.to}`} · {l.reason}</span>
            {l.status === "pending" && owner ? (
              <>
                <button type="button" onClick={() => lms.decideLeave(l.id, "approved")} className="rounded-full bg-primary px-3 py-1.5 font-bold text-on-primary">{S.approve}</button>
                <button type="button" onClick={() => lms.decideLeave(l.id, "rejected")} className="rounded-full bg-white px-3 py-1.5 font-bold text-error">{S.reject}</button>
              </>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${l.status === "approved" ? "bg-secondary-container" : l.status === "rejected" ? "bg-error text-white" : "bg-white"}`}>{S.status[l.status]}</span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
