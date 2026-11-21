"use client";

import { useState } from "react";
import { profitAndLoss } from "@/lib/centre";
import { dayKey } from "@/lib/dates";
import { downloadCsv } from "@/lib/files";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { monthKey, useLms } from "@/lib/lms-store";
import { taka } from "@/lib/mock-data";
import type { ToolProps } from "./ToolsPage";
import { box, card, label, primary, soft } from "./ui";

const CATEGORIES = ["rent", "electricity", "internet", "stationery", "marketing", "other"] as const;

/** Expenses and a monthly profit & loss: fees collected − staff pay − other costs. */
export function MoneyTool({ notify }: ToolProps) {
  const { t } = useLang();
  const M = t.money;
  const lms = useLms();
  const [month, setMonth] = useState(monthKey());
  const pl = profitAndLoss(month, lms.payments, lms.staffPayments, lms.expenses);
  const [f, setF] = useState({ date: dayKey(), category: "rent", amount: "", note: "" });
  const list = lms.expenses.filter((e) => e.date.startsWith(month));

  return (
    <div className="flex flex-col gap-4">
      <label className={`${label} self-start`}>{M.month}<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={box} /></label>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[M.income, pl.income], [M.salaries, pl.salaries], [M.other, pl.expenses - pl.salaries], [M.profit, pl.profit]].map(([k, v]) => (
          <div key={k} className="rounded-[14px] bg-white p-4">
            <p className="text-sm text-on-surface-variant">{k}</p>
            <p data-testid={k === M.profit ? "profit" : undefined} className={`text-2xl font-extrabold ${k === M.profit && Number(v) < 0 ? "text-error" : ""}`}>{taka(Number(v))}</p>
          </div>
        ))}
      </div>
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          lms.addExpense({ date: f.date, category: f.category, amount: Math.round(Number(f.amount)), note: f.note.trim() });
          notify(M.added);
          setF({ ...f, amount: "", note: "" });
        }}
      >
        <h2 className="text-lg font-bold">{M.add}</h2>
        <div className="flex flex-wrap gap-2">
          <label className={label}>{M.date}<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={box} /></label>
          <label className={label}>{M.category}<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={box}>{CATEGORIES.map((c) => <option key={c} value={c}>{M.cats[c]}</option>)}</select></label>
          <label className={label}>{M.amount}<input type="number" min={1} required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${box} w-32`} /></label>
          <label className={`${label} flex-1`}>{M.note}<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={box} /></label>
        </div>
        <button type="submit" className={`self-start ${primary}`}>{M.addBtn}</button>
      </form>
      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{M.list}</h2>
          <button type="button" onClick={() => downloadCsv(`expenses-${month}.csv`, [[M.date, M.category, M.amount, M.note], ...list.map((e) => [e.date, M.cats[e.category as (typeof CATEGORIES)[number]] ?? e.category, e.amount, e.note])])} className={soft}>{t.merit.csv}</button>
        </div>
        {list.length === 0 && <p className="text-sm text-on-surface-variant">{M.none}</p>}
        {list.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-[10px] bg-surface-container px-3 py-2 text-sm">
            <span className="w-24">{e.date}</span>
            <b className="flex-1">{M.cats[e.category as (typeof CATEGORIES)[number]] ?? e.category}{e.note && ` · ${e.note}`}</b>
            <b>{taka(e.amount)}</b>
            <button type="button" onClick={() => lms.removeExpense(e.id)} aria-label={t.common.remove} className="font-bold text-error">✕</button>
          </div>
        ))}
      </section>
    </div>
  );
}
