"use client";

import { useState } from "react";
import { Logo, LangSwitch } from "@/components/Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { WHATSAPP_NUMBER, waLink } from "@/lib/site";

const field = "flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant";
const box = "rounded-xl border border-outline bg-white px-4 text-base text-on-surface";

/** Public "Help & support" form → appears in the admin panel's Support tab. */
export default function Support() {
  const { t } = useLang();
  const S = t.support;
  const [f, setF] = useState({ name: "", contact: "", role: "teacher", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setState(res?.ok ? "sent" : "failed");
  };

  return (
    <div className="min-h-dvh bg-surface px-5 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LangSwitch compact />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{S.title}</h1>
          <p className="mt-1 text-on-surface-variant">{S.sub}</p>
        </div>
        {state === "sent" ? (
          <p role="status" className="rounded-[20px] bg-white p-6 text-lg font-semibold">{S.sent}</p>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-4 rounded-[20px] bg-white p-6">
            <label className={field}>{S.name}<input required maxLength={80} autoComplete="name" value={f.name} onChange={up("name")} className={`${box} h-12`} /></label>
            <label className={field}>{S.contact}<input required maxLength={120} value={f.contact} onChange={up("contact")} placeholder="01XXXXXXXXX" className={`${box} h-12`} /></label>
            <label className={field}>
              {S.role}
              <select value={f.role} onChange={up("role")} className={`${box} h-12`}>
                {(Object.keys(S.roles) as (keyof typeof S.roles)[]).map((r) => <option key={r} value={r}>{S.roles[r]}</option>)}
              </select>
            </label>
            <label className={field}>{S.message}<textarea required maxLength={2000} rows={5} value={f.message} onChange={up("message")} className={`${box} py-3`} /></label>
            {state === "failed" && (
              <p role="alert" className="text-sm font-semibold text-error">
                {S.failed} {WHATSAPP_NUMBER && <a href={waLink(WHATSAPP_NUMBER)} className="underline">WhatsApp</a>}
              </p>
            )}
            <button type="submit" disabled={state === "sending"} className="h-14 rounded-full bg-primary text-[17px] font-bold text-on-primary disabled:opacity-60">{S.send}</button>
          </form>
        )}
      </div>
    </div>
  );
}
