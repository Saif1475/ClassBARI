"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { PasswordInput } from "@/components/PasswordInput";
import { SlidingSegmented } from "@/components/SlidingSegmented";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { Role } from "@/lib/role";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAppLock } from "@/lib/app-lock";
import { APPS } from "@/lib/apps";
import { getInstitute, setInstitute, type InstituteCard } from "@/lib/institute-choice";
import { InstitutePicker } from "./InstitutePicker";
import { StepLogin, strongPassword, WANTED } from "./StepLogin";

const box = "h-14 rounded-xl border border-outline bg-white px-4 text-base text-on-surface outline-primary";

/**
 * Real login. Everyone: email + password (the email is confirmed by a link first, which proves they own it).
 * Students and guardians may use Google with the same Gmail instead. Phone + OTP comes later.
 */
export function RealLogin() {
  const { t } = useLang();
  const L = t.login;
  const A = t.auth;
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const error = new URLSearchParams(location.search).get("error");
    if (error) setMsg({ ok: false, text: error === "no-access" ? A.noAccess : A.linkExpired });
  }, []);
  const [busy, setBusy] = useState(false);
  const app = useAppLock(); // inside one of the Android apps: only that app's role
  // Students, guardians and teachers first pick their institute (owners log straight in).
  const [inst, setInst] = useState<InstituteCard | null>(null);
  useEffect(() => setInst(getInstitute()), []);
  const needsInstitute = role !== "institute";
  useEffect(() => {
    if (app) setRole(app);
  }, [app]);
  const staff = role === "teacher" || role === "institute";
  const back = (next: string) => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const google = async () => {
    sessionStorage.setItem(WANTED, role);
    setBusy(true);
    const { error: e } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: back("/auth/continue") } });
    if (e) {
      setBusy(false);
      setMsg({ ok: false, text: A.googleFailed });
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem(WANTED, role);
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!err) return router.push("/auth/continue");
    setMsg({ ok: false, text: /confirm/i.test(err.message) ? A.confirmFirst : A.wrongPassword });
  };

  /** A teacher the owner added by email: first time here, they choose a password (confirmed by email). */
  const firstTime = async () => {
    if (!email.trim()) return setMsg({ ok: false, text: A.emailFirst });
    if (!strongPassword(password)) return setMsg({ ok: false, text: A.passwordRule });
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: back("/auth/continue") } });
    setBusy(false);
    setMsg(err ? { ok: false, text: A.signupFailed } : { ok: true, text: A.checkEmail });
  };

  const forgot = async () => {
    if (!email.trim()) return setMsg({ ok: false, text: A.emailFirst });
    setBusy(true);
    await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo: back("/auth/reset") });
    setBusy(false);
    setMsg({ ok: true, text: A.resetSent }); // same answer whether or not the email has an account
  };

  return (
    <div className="relative z-10 mt-8 flex flex-col gap-5 rounded-[24px] bg-white/80 p-6 shadow-[0_10px_40px_rgba(0,32,28,0.08)] backdrop-blur">
      {app ? (
        <p className="text-center text-lg font-bold" style={{ color: APPS[app].color }}>{APPS[app].name}</p>
      ) : (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-on-surface-variant">{L.iam}</span>
        <SlidingSegmented
          ariaLabel={L.iam}
          value={role}
          onChange={(r) => {
            setRole(r);
            setMsg(null);
          }}
          options={(Object.keys(L.roles) as Role[]).map((r) => ({ value: r, label: L.roles[r] }))}
          className="flex-wrap rounded-xl p-1"
          buttonClassName="h-11 basis-[40%] px-2 text-xs font-bold sm:basis-0 sm:text-sm"
        />
      </div>
      )}

      {needsInstitute && !inst ? (
        <InstitutePicker onPick={setInst} />
      ) : (
      <>
      {needsInstitute && inst && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-4 py-3">
          <span className="font-bold">{inst.name}</span>
          <button type="button" onClick={() => { setInstitute(null); setInst(null); setMsg(null); }} className="text-sm font-bold text-primary">{A.changeInstitute}</button>
        </div>
      )}
      {!staff ? (
        <StepLogin key={role} role={role} />
      ) : (
        <form onSubmit={signIn} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface-variant">
            {A.email}
            <input required type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} className={box} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface-variant">
            {A.password}
            <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} className={box} />
          </label>
          <button type="submit" disabled={busy} className="flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[17px] font-bold text-on-primary disabled:opacity-60">
            <Icon name="arrow" size={20} /> {A.signIn}
          </button>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <button type="button" disabled={busy} onClick={forgot} className="text-sm font-bold text-primary">{A.forgot}</button>
            <button type="button" disabled={busy} onClick={firstTime} className="text-sm font-bold text-primary">{A.firstTime}</button>
          </div>
        </form>
      )}
      {!staff && (
        // Students and guardians may also use Google with the same Gmail: their choice.
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-on-surface-variant">{A.orGoogle}</span>
          <button type="button" disabled={busy} onClick={google} aria-label={A.google} title={A.google} className="flex h-12 w-12 items-center justify-center rounded-full border border-outline bg-white text-xl font-extrabold text-[#4285f4] shadow-sm disabled:opacity-60">
            G
          </button>
        </div>
      )}
      </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>}
    </div>
  );
}
