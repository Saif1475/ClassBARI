"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, LangSwitch } from "@/components/Brand";
import { PasswordInput } from "@/components/PasswordInput";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { subjects } from "@/lib/mock-data";
import { useLms } from "@/lib/lms-store";
import { setRole } from "@/lib/role";
import { isBdMobile } from "@/lib/site";
import { useFlag } from "@/components/Platform";
import { REAL_AUTH } from "@/lib/auth-mode";
import { supabaseBrowser } from "@/lib/supabase/client";
import { strongPassword } from "@/components/auth/StepLogin";
import { emailAlreadyTaken, openOwnCentre, ownsInstitute } from "@/lib/access";

const field = "flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant";
const box = "h-12 rounded-xl border border-outline bg-white px-4 text-base text-on-surface";

export default function SignUp() {
  const { t } = useLang();
  const G = t.signup;
  const T = t.teacher;
  const lms = useLms();
  const router = useRouter();
  const [f, setF] = useState({ name: "", institute: "", phone: "", batch: "", subject: "Physics", days: "Sat, Mon, Wed · 4:30 PM", fee: "1000" });
  const [classDays, setClassDays] = useState<number[]>([6, 1, 3]);
  const [badPhone, setBadPhone] = useState(false);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const signupsOn = useFlag("signups");
  const [signedIn, setSignedIn] = useState(false); // already logged in (a teacher at B, a guardian): open the institute on this account, no new one
  useEffect(() => { if (REAL_AUTH) supabaseBrowser().auth.getUser().then(({ data }) => setSignedIn(!!data.user)).catch(() => {}); }, []);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="min-h-dvh bg-surface px-5 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LangSwitch compact />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{G.title}</h1>
          <p className="mt-1 text-on-surface-variant">{G.sub}</p>
        </div>
        {!signupsOn ? (
          <p role="status" className="rounded-[20px] bg-white p-6 font-semibold">
            {t.platform.signupsClosed}{" "}
            <Link href="/support" className="text-primary underline">{t.support.link}</Link>
          </p>
        ) : (
        <form
          className="flex flex-col gap-4 rounded-[20px] bg-white p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isBdMobile(f.phone)) return setBadPhone(true);
            if (REAL_AUTH) {
              // read by /auth/continue (after the email link, or right away when logged in): it creates their institute
              const data = { signup_kind: "institute", full_name: f.name.trim(), institute: f.institute.trim(), phone: f.phone.trim(), batch: f.batch.trim(), days: f.days, classDays, subject: f.subject, fee: Math.max(0, Number(f.fee) || 0) };
              if (signedIn) {
                setBusy(true);
                // Already owns a centre: open it, without overwriting their name and phone or listing a second one in the admin panel
                const { data: roles } = await supabaseBrowser().rpc("my_access");
                if (ownsInstitute(roles)) return location.assign(openOwnCentre(sessionStorage));
                const { error } = await supabaseBrowser().auth.updateUser({ data });
                setBusy(false);
                if (error) return setMsg({ ok: false, text: t.auth.signupFailed });
                fetch("/api/platform/institutes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.institute.trim(), owner: f.name.trim(), phone: f.phone.trim(), firstBatch: f.batch.trim() }), keepalive: true }).catch(() => {});
                return location.assign("/auth/continue");
              }
              if (!strongPassword(login.password)) return setMsg({ ok: false, text: t.auth.passwordRule });
              setBusy(true);
              const { data: made, error } = await supabaseBrowser().auth.signUp({ email: login.email.trim(), password: login.password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/auth/continue`, data } });
              setBusy(false);
              if (error) return setMsg({ ok: false, text: t.auth.signupFailed });
              if (emailAlreadyTaken(made.user)) return setMsg({ ok: false, text: t.auth.alreadyRegistered }); // Supabase kept the old account as it was and sent nothing
            }
            // Lists the new teacher in our admin panel. shortcut: the demo still runs if this fails; with Supabase, sign-up itself happens on the server.
            fetch("/api/platform/institutes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.institute.trim(), owner: f.name.trim(), phone: f.phone.trim(), firstBatch: f.batch.trim() }), keepalive: true }).catch(() => {});
            if (REAL_AUTH) return setMsg({ ok: true, text: t.auth.checkEmail }); // their institute is set up after they confirm the email
            lms.signUpTeacher({ institute: f.institute.trim(), name: f.name.trim(), phone: f.phone.trim(), batch: f.batch.trim(), days: f.days, classDays, subject: f.subject, fee: Math.max(0, Number(f.fee) || 0) });
            setRole("teacher");
            router.push("/teacher");
          }}
        >
          <label className={field}>{G.name}<input required autoComplete="name" value={f.name} onChange={up("name")} className={box} /></label>
          <label className={field}>{G.institute}<input required maxLength={80} autoComplete="organization" value={f.institute} onChange={up("institute")} placeholder={G.institutePh} className={box} /><span className="font-normal">{G.instituteHelp}</span></label>
          <label className={field}>
            {G.phone}
            <input required type="tel" autoComplete="tel" value={f.phone} onChange={(e) => { up("phone")(e); setBadPhone(false); }} placeholder="01XXXXXXXXX" aria-invalid={badPhone} className={box} />
            {badPhone && <span role="alert" className="text-error">{T.phoneInvalid}</span>}
          </label>
          {REAL_AUTH && !signedIn && (
            <>
              <label className={field}>{t.auth.email}<input required type="email" autoComplete="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} className={box} /></label>
              <label className={field}>{t.auth.password}<PasswordInput required minLength={8} autoComplete="new-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} className={box} /><span className="font-normal">{t.auth.passwordRule}</span></label>
            </>
          )}
          <label className={field}>{G.batch}<input required value={f.batch} onChange={up("batch")} placeholder={G.batchPh} className={box} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={field}>{T.subject}<select value={f.subject} onChange={up("subject")} className={box}>{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className={field}>{T.monthlyFee}<input type="number" min={0} value={f.fee} onChange={up("fee")} className={box} /></label>
          </div>
          <label className={field}>{T.schedule}<input value={f.days} onChange={up("days")} className={box} /></label>
          <fieldset className="flex flex-wrap gap-1.5 text-sm font-semibold text-on-surface-variant">
            <legend className="mb-1.5">{t.att.classDays}</legend>
            {t.att.weekdays.map((n, d) => (
              <button
                key={n}
                type="button"
                aria-pressed={classDays.includes(d)}
                onClick={() => setClassDays(classDays.includes(d) ? classDays.filter((x) => x !== d) : [...classDays, d])}
                className={`h-9 min-w-11 rounded-full px-2 ${classDays.includes(d) ? "bg-primary text-on-primary" : "border border-outline-variant"}`}
              >
                {n}
              </button>
            ))}
          </fieldset>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>}
          <button type="submit" disabled={busy || msg?.ok} className="h-14 rounded-full bg-primary text-[17px] font-bold text-on-primary disabled:opacity-60">{G.submit}</button>
        </form>
        )}
        <p className="text-center text-sm text-on-surface-variant">
          {G.have} <Link href="/login" className="font-bold text-primary">{t.common.logIn}</Link>
        </p>
      </div>
    </div>
  );
}
