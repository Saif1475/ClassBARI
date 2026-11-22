"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { taka } from "@/lib/mock-data";
import { useLms } from "@/lib/lms-store";

/** One student's fees: record a full or partial (installment) payment, set a discount, open the invoice. */
export function FeeDialog({ studentId, onClose, onDone }: { studentId: number; onClose: () => void; onDone: (msg: string) => void }) {
  const { t } = useLang();
  const F = t.fees;
  const lms = useLms();
  const s = lms.students.find((x) => x.id === studentId);
  const [amount, setAmount] = useState(String(s?.feeDue ?? 0));
  const [method, setMethod] = useState<"cash" | "bkash">("cash");
  const [discount, setDiscount] = useState(String(s?.discount ?? 0));
  if (!s) return null;
  const box = "h-11 rounded-xl border border-outline bg-white px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()} aria-labelledby="fee-title" onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-white p-5 shadow-2xl sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 id="fee-title" className="text-xl font-bold">{F.title(s.name)}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-tertiary-container px-4 py-3 text-on-tertiary-container">
          <span className="font-semibold">{F.due}{s.late ? ` · ${t.fee.late}` : ""}</span>
          <span className="text-2xl font-extrabold">{taka(s.feeDue)}</span>
        </div>

        {s.feeDue > 0 && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lms.payFee(s.id, method, Number(amount));
              onDone(F.recorded);
              onClose();
            }}
          >
            <span className="font-bold">{F.record}</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
                {F.amount}
                <input type="number" min={1} max={s.feeDue} required value={amount} onChange={(e) => setAmount(e.target.value)} className={box} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
                {F.method}
                <select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "bkash")} className={box}>
                  <option value="cash">{t.parent.methods.cash}</option>
                  <option value="bkash">{t.parent.methods.bkash}</option>
                </select>
              </label>
            </div>
            <span className="text-xs text-on-surface-variant">{F.installmentHint}</span>
            <button type="submit" className="h-11 rounded-full bg-primary text-sm font-bold text-on-primary">{F.record}</button>
          </form>
        )}

        <form
          className="flex flex-col gap-2 border-t border-outline-variant pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            lms.setDiscount(s.id, Number(discount) || 0);
            onDone(F.discountSaved);
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {F.discount}
            <span className="flex gap-2">
              <input type="number" min={0} max={lms.batches.find((b) => b.name === s.batch)?.fee ?? 0} value={discount} onChange={(e) => setDiscount(e.target.value)} onInvalid={(e) => e.currentTarget.setCustomValidity(F.discountTooBig)} onInput={(e) => e.currentTarget.setCustomValidity("")} className={`${box} flex-1`} />
              <button type="submit" className="h-11 rounded-full border border-outline-variant px-4 text-sm font-bold">{t.common.save}</button>
            </span>
          </label>
          <span className="text-xs text-on-surface-variant">{F.discountHint}</span>
        </form>

        <Link href={`/teacher/invoice/${s.id}`} className="self-start text-sm font-bold text-primary underline">{F.invoice}</Link>
      </div>
    </div>
  );
}
