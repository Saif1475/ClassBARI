"use client";

import { useState } from "react";
import { StudentForm } from "@/components/StudentForm";
import { applyCoupon } from "@/lib/centre";
import { dayKey } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { REAL_AUTH } from "@/lib/auth-mode";
import { publicPost } from "@/lib/public-api";
import { taka, type Batch } from "@/lib/mock-data";

/**
 * Join a paid course: details -> pay by bKash "Send Money" to the teacher's own number -> type the TrxID.
 * The teacher confirms it in Tools -> Course shop. Nothing about the bKash account (PIN, card) is ever asked here.
 */
export function BuyCourse({ batch }: { batch: Batch }) {
  const { t } = useLang();
  const B = t.buy;
  const lms = useLms();
  const [student, setStudent] = useState<{ name: string; email: string; guardianName: string; guardianEmail: string; phone: string } | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ price: number; code: string } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [trx, setTrx] = useState("");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const price = applied?.price ?? batch.fee;

  if (done) return <p role="status" className="rounded-xl bg-primary-container p-4 font-bold text-on-primary-container">{B.waiting}</p>;
  if (!student)
    return (
      <StudentForm
        batch={batch.name}
        submitLabel={B.next}
        onSubmit={(i) => setStudent({ name: i.name.trim(), email: i.email, guardianName: i.guardianName.trim(), guardianEmail: i.guardianEmail, phone: i.phone.trim() })}
      />
    );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (REAL_AUTH) {
          // The server works out the price itself from the coupon.
          const r = await publicPost({ kind: "order", batchId: batch.id, student, coupon: applied?.code, trxId: trx.trim().toUpperCase() });
          return r.ok ? setDone(true) : setFailed(true);
        }
        lms.placeOrder({ batchId: batch.id, student, price, coupon: applied?.code, trxId: trx.trim().toUpperCase() });
        setDone(true);
      }}
    >
      <div className="flex gap-2">
        <input value={code} onChange={(e) => { setCode(e.target.value); setCouponError(""); }} placeholder={B.coupon} aria-label={B.coupon} className="h-11 flex-1 rounded-[10px] border border-outline px-3 uppercase" />
        <button
          type="button"
          onClick={async () => {
            if (REAL_AUTH) {
              const r = await publicPost({ kind: "coupon", batchId: batch.id, code });
              if (r.price === undefined) return setCouponError(B.couponErrors[(r.error as keyof typeof B.couponErrors) in B.couponErrors ? (r.error as keyof typeof B.couponErrors) : "unknown"]);
              return setApplied({ price: r.price, code: r.code ?? code.toUpperCase() });
            }
            const r = applyCoupon(batch.fee, code, lms.coupons, batch.id, dayKey(), lms.orders);
            if ("error" in r) return setCouponError(B.couponErrors[r.error]);
            setApplied({ price: r.price, code: r.coupon.code });
          }}
          className="h-11 rounded-full bg-surface-container px-4 font-bold text-primary"
        >
          {B.apply}
        </button>
      </div>
      {couponError && <p role="alert" className="text-sm font-semibold text-error">{couponError}</p>}
      {applied && <p className="text-sm font-bold text-primary">{B.saved(applied.code, taka(batch.fee - applied.price))}</p>}
      <ol className="flex list-decimal flex-col gap-1 rounded-xl bg-surface-container py-3 pl-8 pr-4 text-sm">
        <li>{B.step1(taka(price), lms.site.bkash)}</li>
        <li>{B.step2}</li>
      </ol>
      <label className="flex flex-col gap-1 text-sm font-semibold">{B.trx}
        <input required pattern="[A-Za-z0-9]{8,12}" value={trx} onChange={(e) => setTrx(e.target.value)} placeholder="9F4K2LQ8XZ" className="h-12 rounded-[10px] border border-outline px-3 font-mono uppercase" />
      </label>
      <button type="submit" className="h-13 rounded-full bg-bkash font-bold text-white">{B.send(taka(price))}</button>
      {failed && <p role="alert" className="text-sm font-semibold text-error">{t.auth.syncFailed}</p>}
      <p className="text-xs text-on-surface-variant">{B.safety}</p>
    </form>
  );
}
