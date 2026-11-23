"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { taka } from "@/lib/mock-data";
import type { ToolProps } from "./ToolsPage";
import { box, card, label, primary } from "./ui";

/**
 * Selling courses: coupons, and orders paid by bKash "Send Money" to the teacher's own number.
 * The teacher checks the TrxID in their bKash app, then confirms: the student is enrolled. Instanton Campus never holds the money.
 */
export function ShopTool({ notify }: ToolProps) {
  const { t, lang } = useLang();
  const S = t.shop;
  const lms = useLms();
  const [f, setF] = useState({ code: "", percent: "20", batchId: "", maxUses: "50", expires: "" });
  const pending = lms.orders.filter((o) => o.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      {!lms.site.bkash && <p role="status" className="rounded-xl bg-tertiary-container px-4 py-3 font-semibold text-on-tertiary-container">{S.needBkash}</p>}
      <section className={card}>
        <h2 className="text-lg font-bold">{S.orders(pending.length)}</h2>
        <p className="text-sm text-on-surface-variant">{S.ordersHelp}</p>
        {lms.orders.length === 0 && <p className="text-sm text-on-surface-variant">{S.noOrders}</p>}
        {lms.orders.map((o) => {
          const b = lms.batches.find((x) => x.id === o.batchId);
          return (
            <div key={o.id} aria-label={o.student.name} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-container px-3 py-2 text-sm">
              <span className="flex flex-1 flex-col">
                <b>{o.student.name} → {b?.name ?? "—"}</b>
                <span>{taka(o.price)}{o.coupon && ` (${o.coupon})`} · TrxID <b className="font-mono">{o.trxId}</b> · {o.student.phone} · {fmtDateTime(o.at, lang)}</span>
              </span>
              {o.status === "pending" ? (
                <>
                  <button type="button" onClick={() => { lms.decideOrder(o.id, true); notify(S.confirmed(o.student.name)); }} className="rounded-full bg-primary px-3 py-1.5 font-bold text-on-primary">{S.confirm}</button>
                  <button type="button" onClick={() => window.confirm(S.rejectQ) && lms.decideOrder(o.id, false)} className="rounded-full bg-white px-3 py-1.5 font-bold text-error">{S.reject}</button>
                </>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.status === "confirmed" ? "bg-secondary-container" : "bg-error text-white"}`}>{S.status[o.status]}</span>
              )}
            </div>
          );
        })}
      </section>
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          lms.addCoupon({ code: f.code.trim(), percent: Math.min(100, Math.max(1, Number(f.percent))), batchId: f.batchId || undefined, maxUses: Math.max(1, Number(f.maxUses) || 1), expires: f.expires || undefined });
          notify(S.couponAdded(f.code.trim().toUpperCase()));
          setF({ ...f, code: "" });
        }}
      >
        <h2 className="text-lg font-bold">{S.coupons}</h2>
        <div className="flex flex-wrap gap-2">
          <label className={label}>{S.code}<input required pattern="[A-Za-z0-9]{3,20}" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="EID20" className={`${box} uppercase`} /></label>
          <label className={label}>{S.percent}<input type="number" min={1} max={100} required value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} className={`${box} w-24`} /></label>
          <label className={label}>{S.course}<select value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })} className={box}><option value="">{S.anyCourse}</option>{lms.batches.filter((b) => b.public).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className={label}>{S.maxUses}<input type="number" min={1} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} className={`${box} w-24`} /></label>
          <label className={label}>{S.expires}<input type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} className={box} /></label>
        </div>
        <button type="submit" className={`self-start ${primary}`}>{S.addCoupon}</button>
        {lms.coupons.map((c) => (
          <div key={c.code} className="flex items-center gap-3 rounded-[10px] bg-surface-container px-3 py-2 text-sm">
            <b className="font-mono">{c.code}</b>
            <span className="flex-1">−{c.percent}% · {c.batchId ? lms.batches.find((b) => b.id === c.batchId)?.name : S.anyCourse} · {S.used(c.used, c.maxUses)}{c.expires && ` · ${S.until(c.expires)}`}</span>
            <button type="button" onClick={() => lms.removeCoupon(c.code)} aria-label={`${t.common.remove} ${c.code}`} className="font-bold text-error">✕</button>
          </div>
        ))}
      </form>
    </div>
  );
}
