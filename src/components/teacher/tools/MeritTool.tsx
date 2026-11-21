"use client";

import { overTime, quizMinutes } from "@/lib/quiz";
import Link from "next/link";
import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { downloadCsv } from "@/lib/files";
import { itemScores, useLms } from "@/lib/lms-store";
import { meritList } from "@/lib/quiz";
import type { ToolProps } from "./ToolsPage";
import { notifyBatch } from "@/components/PushToggle";

/** Ranked results of one test; the teacher publishes it so each student/guardian sees only their own position. */
export function MeritTool({ batchNames }: ToolProps) {
  const { t } = useLang();
  const M = t.merit;
  const lms = useLms();
  const tests = lms.modules
    .filter((m) => batchNames.includes(m.batch))
    .flatMap((m) => m.items.filter((it) => it.kind !== "video" && it.kind !== "pdf" && Object.keys(itemScores(it)).length > 0).map((it) => ({ m, it })));
  const [pick, setPick] = useState(tests[0] ? `${tests[0].m.id}:${tests[0].it.id}` : "");
  const sel = tests.find(({ m, it }) => `${m.id}:${it.id}` === pick);
  if (!sel) return <p className="text-on-surface-variant">{M.none}</p>;
  const rows = meritList(itemScores(sel.it)).map((r) => ({ ...r, st: lms.studentById.get(r.id) }));
  const total = sel.it.points ?? 30;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {M.pick}
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-12 rounded-xl border border-outline bg-white px-4 text-base">
          {tests.map(({ m, it }) => <option key={`${m.id}:${it.id}`} value={`${m.id}:${it.id}`}>{it.title} · {m.batch}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold">
          <input type="checkbox" checked={!!sel.it.meritPublished} onChange={(e) => {
            lms.setMeritPublished(sel.m.id, sel.it.id, e.target.checked);
            if (e.target.checked) notifyBatch(sel.m.batch, t.push.results, sel.it.title, "/parent/results");
          }} className="h-5 w-5 accent-primary" />
          {M.publish}
        </label>
        <Link href={`/teacher/print?kind=merit&item=${sel.it.id}`} target="_blank" className="rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary">{M.print}</Link>
        <button
          type="button"
          onClick={() => downloadCsv(`merit-${sel.it.id}.csv`, [[M.rank, t.common.roll, M.name, M.marks, M.percentile], ...rows.map((r) => [r.rank, r.id, r.st?.name ?? "—", r.score, r.percentile])])}
          className="rounded-full bg-surface-container px-4 py-2 text-sm font-bold text-primary"
        >
          {M.csv}
        </button>
      </div>
      <p className="text-sm text-on-surface-variant">{M.privacy}</p>
      <ol className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-[14px] bg-white px-4 py-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-extrabold ${r.rank <= 3 ? "bg-tertiary-container text-on-tertiary-container" : "bg-surface-container"}`}>{r.rank}</span>
            <span className="flex flex-1 flex-col">
              <span className="font-bold">{r.st?.name ?? "—"}</span>
              <span className="text-xs text-on-surface-variant">{t.common.roll} {r.id} · {M.beat(r.percentile)}</span>
              {!!sel.it.tabSwitches?.[r.id] && <span className="text-xs font-bold text-error">⚠ {M.tabSwitches(sel.it.tabSwitches[r.id])}</span>}
              {(() => {
                const late = overTime(sel.it, sel.it.took?.[r.id]); // measured by the server's clock
                return late === null ? null : <span className="text-xs font-bold text-error">⏱ {late === "unknown" ? M.noStart : M.tookLong(late, quizMinutes(sel.it))}</span>;
              })()}
            </span>
            <span className="text-lg font-extrabold">{r.score} / {total}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
