"use client";

import { LoginHint } from "./LoginHint";
import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { isBdMobile } from "@/lib/site";
import { useLms } from "@/lib/lms-store";
import { REAL_AUTH } from "@/lib/auth-mode";

/** Coaching-centre mode: the owner adds teachers; batches are assigned on each batch card. */
export function CentreCard() {
  const { t } = useLang();
  const C = t.centre;
  const lms = useLms();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bad, setBad] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{C.title}</h2>
      <ul className="flex flex-col gap-2">
        {lms.staff.map((s) => (
          <li key={s.name} className="flex items-center justify-between rounded-xl bg-surface-container px-4 py-2.5 text-sm">
            <span className="font-semibold">{s.name}</span>
            <span className="text-on-surface-variant">{s.email ? `${s.email} · ` : ""}{s.phone} · {C.batchesN(lms.batches.filter((b) => b.teacher === s.name).length)}</span>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isBdMobile(phone)) return setBad(true);
          if (lms.staff.some((s) => s.name === name.trim())) return;
          lms.addStaff(name.trim(), phone.trim(), email.trim() || undefined);
          setName("");
          setEmail("");
          setPhone("");
        }}
      >
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={C.name} aria-label={C.name} className="h-10 min-w-40 flex-1 rounded-xl border border-outline bg-white px-3 text-sm" />
        <span className="flex min-w-36 flex-1 flex-col">
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setBad(false); }}
            placeholder="01XXXXXXXXX"
            aria-label={C.phone}
            aria-invalid={bad}
            className="h-10 rounded-xl border border-outline bg-white px-3 text-sm"
          />
          {bad && <span role="alert" className="text-xs font-semibold text-error">{t.teacher.phoneInvalid}</span>}
        </span>
        {REAL_AUTH && (
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.auth.email} aria-label={t.auth.email} className="h-10 min-w-48 flex-1 rounded-xl border border-outline bg-white px-3 text-sm" />
        )}
        <button type="submit" className="h-10 rounded-full bg-primary px-4 text-sm font-bold text-on-primary">{C.addTeacher}</button>
      </form>
      <LoginHint who="teachers" />
    </section>
  );
}
