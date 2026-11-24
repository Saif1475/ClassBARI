"use client";

import { useState } from "react";
import { clashes } from "@/lib/centre";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import type { ToolProps } from "./ToolsPage";
import { box, card, label, primary } from "./ui";

/** Weekly class routine: day × time × room, with a warning when a teacher, room or batch is booked twice. */
export function RoutineTool({ batchNames }: ToolProps) {
  const { t } = useLang();
  const R = t.routine;
  const lms = useLms();
  const slots = lms.routine.filter((s) => batchNames.includes(s.batch));
  const problems = clashes(lms.routine, batchNames); // the whole routine, so a room or teacher double-booked with a colleague's batch is caught too
  const [f, setF] = useState({ day: "6", start: "16:00", end: "17:30", batch: batchNames[0] ?? "", teacher: lms.staff[0]?.name ?? "", room: "Room 1" });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="flex flex-col gap-4">
      {problems.map((p, i) => (
        <p key={i} role="alert" className="rounded-xl bg-error-container px-4 py-3 font-semibold text-on-error-container">
          ⚠ {R.clash(t.att.weekdays[p.a.day], `${p.a.start}–${p.a.end}`, `${p.b.start}–${p.b.end}`, p.why.map((w) => R.why[w]).join(", "))}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[6, 0, 1, 2, 3, 4, 5].map((d) => (
          <section key={d} className="flex flex-col gap-2 rounded-[14px] bg-white p-4">
            <h2 className="font-bold">{t.att.weekdays[d]}</h2>
            {slots.filter((s) => s.day === d).sort((a, b) => a.start.localeCompare(b.start)).map((s) => (
              <div key={s.id} className={`rounded-[10px] px-3 py-2 text-sm ${problems.some((p) => p.a.id === s.id || p.b.id === s.id) ? "bg-error-container" : "bg-surface-container"}`}>
                <b>{s.start}–{s.end}</b> · {s.room}
                <span className="block">{s.batch}</span>
                <span className="flex justify-between text-xs text-on-surface-variant">{s.teacher}
                  <button type="button" onClick={() => lms.removeSlot(s.id)} aria-label={`${t.common.remove} ${s.batch} ${s.start}`} className="font-bold text-error">✕</button>
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); lms.addSlot({ ...f, day: Number(f.day) }); }} className={card}>
        <h2 className="text-lg font-bold">{R.add}</h2>
        <div className="flex flex-wrap gap-2">
          <label className={label}>{R.day}<select value={f.day} onChange={up("day")} className={box}>{t.att.weekdays.map((w, i) => <option key={w} value={i}>{w}</option>)}</select></label>
          <label className={label}>{R.start}<input type="time" required value={f.start} onChange={up("start")} className={box} /></label>
          <label className={label}>{R.end}<input type="time" required value={f.end} onChange={up("end")} className={box} /></label>
          <label className={label}>{R.batch}<select value={f.batch} onChange={up("batch")} className={box}>{batchNames.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label className={label}>{R.teacher}<select value={f.teacher} onChange={up("teacher")} className={box}>{lms.staff.map((s) => <option key={s.name}>{s.name}</option>)}</select></label>
          <label className={label}>{R.room}<input required value={f.room} onChange={up("room")} className={box} /></label>
        </div>
        <button type="submit" disabled={f.end <= f.start} className={`self-start ${primary}`}>{R.addBtn}</button>
      </form>
    </div>
  );
}

/** A batch's weekly routine, for the student and guardian panels. */
export function RoutineCard({ batch }: { batch: string }) {
  const { t } = useLang();
  const lms = useLms();
  const slots = lms.routine.filter((s) => s.batch === batch).sort((a, b) => ((a.day + 1) % 7) - ((b.day + 1) % 7) || a.start.localeCompare(b.start)); // week starts Saturday
  if (!slots.length) return null;
  return (
    <section className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{t.routine.title}</h2>
      {slots.map((s) => (
        <div key={s.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-surface-container px-4 py-2.5">
          <b>{t.att.weekdays[s.day]} · {s.start}–{s.end}</b>
          <span className="text-sm text-on-surface-variant">{s.room} · {s.teacher}</span>
        </div>
      ))}
    </section>
  );
}
