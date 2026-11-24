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
  const [taken, setTaken] = useState(false);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{C.title}</h2>
      <ul className="flex flex-col gap-2">
        {lms.staff.map((s) => {
          const teaches = lms.batches.filter((b) => b.teacher === s.name).length;
          return (
            <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container px-4 py-2.5 text-sm">
              <span className="font-semibold">{s.name}</span>
              <span className="flex flex-wrap items-center gap-2 text-on-surface-variant">
                {s.email ? `${s.email} · ` : ""}{s.phone} · {C.batchesN(teaches)}
                <button type="button" onClick={() => (teaches ? window.alert(C.stillTeaches(s.name)) : window.confirm(C.removeQ(s.name)) && lms.removeStaff(s.name))} className="rounded-full px-3 py-1 text-xs font-bold text-error hover:bg-error/10">{C.remove}</button>
              </span>
            </li>
          );
        })}
      </ul>
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isBdMobile(phone)) return setBad(true);
          // The server checks the same (another device may have added one meanwhile).
          if (same(name, lms.teacherName) || lms.staff.some((s) => same(s.name, name) || (!!email.trim() && same(s.email ?? "", email))) || lms.batches.some((b) => same(b.teacher, name))) return setTaken(true);
          lms.addStaff(name.trim(), phone.trim(), email.trim() || undefined);
          setName("");
          setEmail("");
          setPhone("");
        }}
      >
        <span className="flex min-w-40 flex-1 flex-col">
          <input required value={name} onChange={(e) => { setName(e.target.value); setTaken(false); }} placeholder={C.name} aria-label={C.name} aria-invalid={taken} className="h-10 rounded-xl border border-outline bg-white px-3 text-sm" />
          {taken && <span role="alert" className="text-xs font-semibold text-error">{C.taken}</span>}
        </span>
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
          <input type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setTaken(false); }} placeholder={t.auth.email} aria-label={t.auth.email} className="h-10 min-w-48 flex-1 rounded-xl border border-outline bg-white px-3 text-sm" />
        )}
        <button type="submit" className="h-10 rounded-full bg-primary px-4 text-sm font-bold text-on-primary">{C.addTeacher}</button>
      </form>
      <LoginHint who="teachers" />
    </section>
  );
}
