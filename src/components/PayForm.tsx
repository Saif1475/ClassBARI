"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { MONTHS } from "@/lib/pay";

type Method = { method: "bkash" | "nagad"; number: string };
type Mine = { id: string; created_at: string; kind: string; item: string; months: number; amount: number; method: string; trx_id: string; status: "pending" | "approved" | "rejected" | "refunded"; reason?: string };
const tk = (n: number) => `৳${n.toLocaleString("en-IN")}`;
const field = "flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant";
const box = "h-12 rounded-xl border border-outline bg-white px-4 text-base text-on-surface";
const chip = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-bold ${on ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface"}`;

/**
 * Pay Instanton Campus by bKash or Nagad "Send Money": choose what and for how long, send the money to the number shown,
 * type the number paid from and the TrxID. Instanton Campus's staff check it and switch it on; the payer is notified.
 */
export function PayForm({ kind, studentId }: { kind: "ai_pack" | "plan" | "ai_credit"; studentId?: number }) {
  const { t } = useLang();
  const P = t.pay;
  const [info, setInfo] = useState<{ methods: Method[]; packs: number[]; plans: Record<string, number>; credit?: { min: number; max: number }; mine: Mine[]; running?: { pack: number; until: string } | null } | null>(null);
  const [item, setItem] = useState("");
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState<Method["method"]>("bkash");
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () =>
    fetch("/api/pay")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setInfo(d);
        setMethod((m) => (d.methods.some((x: Method) => x.method === m) ? m : d.methods[0]?.method ?? "bkash"));
        setItem((i) => (kind === "ai_pack" && d.running ? String(d.running.pack) : i) || String(kind === "ai_credit" ? d.credit?.min ?? 50 : kind === "ai_pack" ? d.packs[1] ?? d.packs[0] : Object.keys(d.plans)[0] ?? ""));
      })
      .catch(() => {});
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return null;

  const credit = kind === "ai_credit";
  const range = info.credit ?? { min: 50, max: 5000 };
  const running = kind === "ai_pack" ? info.running : null; // a pack still on: only more months of the same one, or the new level would count for months already paid
  const options = credit ? [[item, Number(item)] as const] : kind === "ai_pack" ? info.packs.filter((p) => !running || p === running.pack).map((p) => [String(p), p] as const) : Object.entries(info.plans);
  const monthly = options.find(([k]) => k === item)?.[1] ?? 0;
  const amountOk = /^\d+$/.test(item) && Number(item) >= range.min && Number(item) <= range.max; // the server checks again
  const to = info.methods.find((m) => m.method === method);
  const mine = info.mine.filter((m) => m.kind === kind);
  const total = credit ? (amountOk ? Number(item) : 0) : monthly * months;
  if (!info.methods.length || (!credit && !options.length)) return <p className="rounded-xl bg-surface-container px-4 py-3 text-sm">{P.none}</p>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (credit && !amountOk) return setMsg({ ok: false, text: P.creditBad });
    const res = await fetch("/api/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, item, months, method, sender, trxId: trx, studentId }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      setMsg({ ok: true, text: P.sent });
      setTrx("");
      void load();
    } else setMsg({ ok: false, text: d.error === "used" ? P.used : d.error === "pack running" ? P.packRunning(tk(d.pack), d.until) : credit && d.error === "bad item" ? P.creditBad : res?.status === 400 ? P.bad : P.error });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[18px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{credit ? P.buyCredit : kind === "ai_pack" ? P.buyPack : P.payPlan}</h2>
      {credit && (
        <>
          <p className="text-sm text-on-surface-variant">{P.creditInfo}</p>
          <label className={field}>{P.creditAmount}<input type="number" required min={range.min} max={range.max} step={1} inputMode="numeric" value={item} onChange={(e) => setItem(e.target.value.trim())} className={box} /></label>
        </>
      )}
      {running && <p className="text-sm text-on-surface-variant">{P.packRunning(tk(running.pack), running.until)}</p>}
      {!credit && <div role="group" aria-label={P.choose} className="flex flex-wrap gap-2">
        {options.map(([k, price]) => (
          <button key={k} type="button" aria-pressed={item === k} onClick={() => setItem(k)} className={chip(item === k)}>
            {kind === "ai_pack" ? tk(price) : `${k} · ${tk(price)}`}
            {P.perMonth}
          </button>
        ))}
      </div>}
      {!credit && <div role="group" aria-label={P.months} className="flex flex-wrap gap-2">
        {MONTHS.map((m) => (
          <button key={m} type="button" aria-pressed={months === m} onClick={() => setMonths(m)} className={chip(months === m)}>{P.monthN(m)}</button>
        ))}
      </div>}
      {info.methods.length > 1 && (
        <div role="group" aria-label="bKash / Nagad" className="flex flex-wrap gap-2">
          {info.methods.map((m) => (
            <button key={m.method} type="button" aria-pressed={method === m.method} onClick={() => setMethod(m.method)} className={chip(method === m.method)}>{P[m.method]}</button>
          ))}
        </div>
      )}
      {to && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-container p-4">
          <p className="text-sm font-bold">{P.how}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>{P.step1(tk(total), to.number, P[method])}</li>
            <li>{P.step2}</li>
            <li>{P.step3}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-extrabold tracking-wide">{to.number}</span>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(to.number).then(() => setCopied(true))} className="min-h-10 rounded-full bg-white px-4 text-sm font-bold text-primary">{copied ? P.copied : P.copy}</button>
            <span className="ml-auto text-2xl font-extrabold text-primary">{tk(total)}</span>
          </div>
        </div>
      )}
      <label className={field}>{P.sender}<input type="tel" required inputMode="numeric" placeholder="01XXXXXXXXX" value={sender} onChange={(e) => setSender(e.target.value)} className={box} /></label>
      <label className={field}>{P.trx}<input required autoCapitalize="characters" autoComplete="off" placeholder="9A1B2C3D4E" value={trx} onChange={(e) => setTrx(e.target.value.toUpperCase())} className={`${box} font-mono tracking-wider`} /></label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>}
      <button type="submit" className="h-12 self-start rounded-full bg-primary px-6 font-bold text-on-primary">{P.send}</button>
      <p className="text-xs text-on-surface-variant">{P.note}</p>
      {mine.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-outline-variant pt-3">
          <p className="text-sm font-bold">{P.yours}</p>
          {mine.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{new Date(m.created_at).toLocaleDateString()} · {credit ? `${tk(m.amount)}` : `${kind === "ai_pack" ? tk(Number(m.item)) : m.item} · ${P.monthN(m.months)} · ${tk(m.amount)}`} · {m.trx_id}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${m.status === "approved" ? "bg-primary-container text-on-primary-container" : m.status === "rejected" ? "bg-error-container text-on-error-container" : "bg-tertiary-container text-on-tertiary-container"}`}>
                {P[m.status]}{m.reason ? `: ${m.reason}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
