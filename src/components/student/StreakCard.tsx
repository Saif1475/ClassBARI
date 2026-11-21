"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { leagueRank, useLms } from "@/lib/lms-store";
import { streak, weekXp } from "@/lib/xp";

/** Daily streak, this week's XP and the student's own place in the batch's weekly league. */
export function StreakCard({ studentId }: { studentId: number }) {
  const { t } = useLang();
  const X = t.streak;
  const lms = useLms();
  const me = lms.students.find((s) => s.id === studentId);
  if (!me) return null;
  const log = lms.xp[studentId] ?? {};
  const s = streak(log);
  const batch = lms.batches.find((b) => b.name === me.batch);
  // Only their own position: classmates' names and XP are not shown (and with real accounts not even sent).
  const pos = lms.leagueRank[studentId] ?? leagueRank(lms.students, lms.xp, studentId);

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-outline-variant bg-white p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className={`text-5xl ${s.doneToday ? "" : "opacity-50 grayscale"}`}>🔥</span>
        <div className="flex flex-[1_1_11rem] flex-col">
          <span data-testid="streak" className="text-2xl font-extrabold">{X.days(s.days)}</span>
          <span className={`text-sm font-semibold ${s.doneToday ? "text-primary" : "text-tertiary"}`}>{s.doneToday ? X.today : X.notToday}</span>
        </div>
        <span className="rounded-full bg-primary-container px-4 py-2 font-bold text-on-primary-container">{X.xpWeek(weekXp(log))}</span>
      </div>
      {!batch?.hideLeague && (
        <details className="group flex flex-col gap-1.5">
          <summary className="cursor-pointer font-bold text-primary">{t.kid.seeLeague}</summary>
          <h3 className="mt-2 font-bold">{X.league}</h3>
          <p className="text-xs text-on-surface-variant">{X.leagueSub}</p>
          {pos && (
            <p className="flex justify-between rounded-[10px] bg-primary-container px-3 py-2 text-sm font-bold text-on-primary-container">
              <span>{X.yourRank(pos.rank, pos.of)}</span>
              <span>{X.xp(weekXp(log))}</span>
            </p>
          )}
        </details>
      )}
    </section>
  );
}
