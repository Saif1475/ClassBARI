"use client";

import { useState } from "react";
import { dayFromToday, fmtDateTime } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import type { ToolProps } from "./ToolsPage";
import { box, card, label, primary } from "./ui";

/** Parent–teacher meetings: the teacher opens time slots; guardians book one from the parent panel. */
export function MeetingsTool({ batchNames, notify }: ToolProps) {
  const { t, lang } = useLang();
  const M = t.meetings;
  const lms = useLms();
  const [f, setF] = useState({ date: dayFromToday(3), start: "18:00", count: "4", minutes: "15", batch: batchNames[0] ?? "" });
  const list = lms.meetings.filter((m) => batchNames.includes(m.batch));
  const teacher = lms.viewer === "all" ? lms.teacherName : lms.viewer;

  return (
    <div className="flex flex-col gap-4">
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          const first = new Date(`${f.date}T${f.start}`);
          const n = Math.min(20, Math.max(1, Number(f.count) || 1)), mins = Math.max(5, Number(f.minutes) || 15);
          lms.addMeetingSlots([...Array(n).keys()].map((i) => ({ start: new Date(first.getTime() + i * mins * 60000).toISOString(), minutes: mins, teacher, batch: f.batch })));
          notify(M.opened(n));
        }}
      >
        <h2 className="text-lg font-bold">{M.open}</h2>
        <div className="flex flex-wrap gap-2">
          <label className={label}>{M.date}<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={box} /></label>
          <label className={label}>{M.from}<input type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={box} /></label>
          <label className={label}>{M.count}<input type="number" min={1} max={20} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} className={`${box} w-24`} /></label>
          <label className={label}>{M.minutes}<input type="number" min={5} max={120} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} className={`${box} w-24`} /></label>
          <label className={label}>{M.batch}<select value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} className={box}>{batchNames.map((b) => <option key={b}>{b}</option>)}</select></label>
        </div>
        <button type="submit" className={`self-start ${primary}`}>{M.openBtn}</button>
      </form>
      <section className={card}>
        <h2 className="text-lg font-bold">{M.slots}</h2>
        {list.length === 0 && <p className="text-sm text-on-surface-variant">{M.none}</p>}
        {list.map((m) => {
          const child = lms.students.find((s) => s.id === m.bookedBy);
          return (
            <div key={m.id} className={`flex flex-wrap items-center gap-2 rounded-[10px] px-3 py-2 text-sm ${child ? "bg-primary-container" : "bg-surface-container"}`}>
              <b>{fmtDateTime(m.start, lang)}</b>
              <span className="flex-1">{m.minutes} min · {m.batch}</span>
              <span className="font-semibold">{child ? M.bookedBy(child.guardianName, child.name) : M.free}</span>
              <button type="button" onClick={() => lms.removeMeeting(m.id)} aria-label={t.common.remove} className="font-bold text-error">✕</button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** Parent panel: free slots for the child's batch; book one, or cancel. */
export function BookMeeting({ childId, batch }: { childId: number; batch: string }) {
  const { t, lang } = useLang();
  const M = t.meetings;
  const lms = useLms();
  const now = new Date().toISOString();
  const slots = lms.meetings.filter((m) => m.batch === batch && m.start > now && (m.bookedBy === undefined || m.bookedBy === childId));
  const mine = slots.find((m) => m.bookedBy === childId);
  if (!slots.length) return null;
  return (
    <section className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{M.parentTitle}</h2>
      {mine ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary-container px-4 py-3">
          <b className="flex-1">{M.yours(fmtDateTime(mine.start, lang), mine.teacher)}</b>
          <button type="button" onClick={() => lms.cancelMeeting(mine.id)} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-error">{M.cancel}</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">{M.pick}</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((m) => (
              <button key={m.id} type="button" onClick={() => lms.bookMeeting(m.id, childId)} className="rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary">
                {fmtDateTime(m.start, lang)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
