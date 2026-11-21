"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { POINT_KINDS, type PointKind } from "@/lib/mock-data";
import { useLms } from "@/lib/lms-store";

const kinds = Object.keys(POINT_KINDS) as PointKind[];
export const pointTotal = (points: { studentId: number; kind: PointKind }[], id: number) =>
  points.filter((p) => p.studentId === id).reduce((s, p) => s + POINT_KINDS[p.kind], 0);

/** Teacher: tap to give a student a positive or needs-work point; recent feedback with undo. */
export function PointsPanel({ students, onGiven }: { students: { id: number; name: string }[]; onGiven: (msg: string) => void }) {
  const { t } = useLang();
  const D = t.dojo;
  const lms = useLms();
  const ids = students.map((s) => s.id);
  const recent = lms.points.filter((p) => ids.includes(p.studentId)).slice(0, 6);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{D.points}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {students.map((s) => {
          const total = pointTotal(lms.points, s.id);
          return (
            <li key={s.id} className="flex flex-col gap-2 rounded-xl bg-surface-container p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.name}</span>
                <span data-testid={`points-${s.id}`} className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold ${total >= 0 ? "bg-primary-container text-on-primary-container" : "bg-error-container text-on-error-container"}`}>
                  {D.total(total)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      lms.addPoint(s.id, k);
                      onGiven(D.given(D.kinds[k], s.name));
                    }}
                    aria-label={`${D.kinds[k]} — ${s.name}`}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${POINT_KINDS[k] > 0 ? "bg-white text-primary" : "bg-white text-error"}`}
                  >
                    {POINT_KINDS[k] > 0 ? "+" : "−"} {D.kinds[k]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {recent.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold">{D.recent}</h3>
          {recent.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span>{D.given(D.kinds[p.kind], students.find((s) => s.id === p.studentId)?.name ?? "")}</span>
              <button type="button" onClick={() => lms.removePoint(p.id)} className="text-xs font-bold text-primary underline">{D.undo}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Student / parent: total points, this week, recent feedback. */
export function PointsSummary({ studentId }: { studentId: number }) {
  const { t } = useLang();
  const D = t.dojo;
  const lms = useLms();
  const mine = lms.points.filter((p) => p.studentId === studentId);
  const weekAgo = Date.now() - 7 * 86400000;
  const week = mine.filter((p) => new Date(p.at).getTime() > weekAgo);
  return (
    <section className="flex flex-col gap-2 rounded-[20px] border border-outline-variant bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{D.points}</h2>
        <span data-testid="my-points" className="rounded-full bg-primary-container px-3 py-1 text-lg font-extrabold text-on-primary-container">{D.total(pointTotal(lms.points, studentId))}</span>
      </div>
      <span className="text-sm text-on-surface-variant">{D.week(week.filter((p) => POINT_KINDS[p.kind] > 0).length, week.filter((p) => POINT_KINDS[p.kind] < 0).length)}</span>
      {mine.length === 0 && <p className="text-sm text-on-surface-variant">{D.none}</p>}
      {mine.slice(0, 5).map((p) => (
        <span key={p.id} className={`text-sm ${POINT_KINDS[p.kind] > 0 ? "text-primary" : "text-error"}`}>
          {POINT_KINDS[p.kind] > 0 ? "+1" : "−1"} · {D.kinds[p.kind]}
        </span>
      ))}
    </section>
  );
}
