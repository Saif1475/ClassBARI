"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { topicMastery, type CourseModule } from "@/lib/lms-store";

const tone = { familiar: "bg-error-container text-on-error-container", proficient: "bg-tertiary-container text-on-tertiary-container", mastered: "bg-primary-container text-on-primary-container" };
const bar = { familiar: "bg-error", proficient: "bg-tertiary", mastered: "bg-primary" };

/** Per-topic mastery from tagged quiz questions (one student, or a whole class). */
export function TopicMastery({ modules, studentIds, title }: { modules: CourseModule[]; studentIds: number[]; title?: string }) {
  const { t } = useLang();
  const K = t.skills;
  const rows = topicMastery(modules, studentIds);
  return (
    <section className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{title ?? K.title}</h2>
      <p className="text-xs text-on-surface-variant">{K.sub}</p>
      {rows.length === 0 && <p className="text-sm text-on-surface-variant">{K.none}</p>}
      {rows.map((r) => (
        <div key={r.topic} className="flex items-center gap-3">
          <span className="w-36 max-w-[38%] shrink-0 truncate text-sm font-semibold" title={r.topic}>{r.topic}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container" role="img" aria-label={`${r.topic}: ${r.pct}%`}>
            <div className={`h-full rounded-full ${bar[r.level]}`} style={{ width: `${r.pct}%` }} />
          </div>
          <span className={`w-24 max-w-[32%] shrink-0 truncate rounded-full px-2 py-0.5 text-center text-xs font-bold ${tone[r.level]}`}>{K.levels[r.level]}</span>
        </div>
      ))}
    </section>
  );
}
