"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import type { ToolProps } from "./ToolsPage";
import { box } from "./ui";

/** How much of each video every student has actually played, and who hasn't started. */
export function WatchTool({ batchNames }: ToolProps) {
  const { t } = useLang();
  const W = t.watch;
  const lms = useLms();
  const [batch, setBatch] = useState(batchNames[0] ?? "");
  const videos = lms.modules.filter((m) => m.batch === batch).flatMap((m) => m.items.filter((it) => it.kind === "video" && it.url));
  const students = lms.students.filter((s) => s.batch === batch);
  return (
    <div className="flex flex-col gap-4">
      <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label={t.roster.batch} className={`${box} self-start`}>{batchNames.map((b) => <option key={b}>{b}</option>)}</select>
      <p className="text-sm text-on-surface-variant">{W.how}</p>
      {videos.length === 0 && <p className="text-on-surface-variant">{W.none}</p>}
      {videos.map((v) => {
        const w = lms.watch[v.id] ?? {};
        const rows = students.map((s) => ({ s, pct: w[s.id]?.dur ? Math.min(100, Math.round((w[s.id].sec / w[s.id].dur) * 100)) : 0 }));
        const notStarted = rows.filter((r) => r.pct === 0);
        return (
          <section key={v.id} aria-label={v.title} className="flex flex-col gap-2 rounded-[16px] bg-white p-5">
            <h2 className="text-lg font-bold">{v.title}</h2>
            <p className="text-sm font-semibold">{W.summary(rows.filter((r) => r.pct >= 90).length, students.length)}{notStarted.length > 0 && ` · ${W.notStarted}: ${notStarted.map((r) => r.s.name).join(", ")}`}</p>
            {rows.filter((r) => r.pct > 0).map(({ s, pct }) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate">{s.name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                <b className="w-12 text-right">{pct}%</b>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
