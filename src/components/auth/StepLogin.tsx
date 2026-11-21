"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PasswordInput } from "@/components/PasswordInput";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { Role } from "@/lib/role";
import { supabaseBrowser } from "@/lib/supabase/client";

export const WANTED = "classbari-wanted-role"; // read by /auth/continue to open the panel they asked for
const box = "h-14 rounded-xl border border-outline bg-white px-4 text-base text-on-surface outline-primary";
const main = "flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[17px] font-bold text-on-primary disabled:opacity-60";
const link = "text-sm font-bold text-primary";
/** The project's password rule: a small letter, a capital, a digit and a symbol. */
/** Why a new password wasn't saved, in plain words. */
export const passwordProblem = (code: string | undefined, A: { passwordRule: string; resendSoon: string; passwordNotSaved: string }) =>
  code === "weak_password" ? A.passwordRule : code === "over_request_rate_limit" ? A.resendSoon : A.passwordNotSaved;
export const strongPassword = (p: string) => p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);

/**
 * Students and guardians, one step at a time: their Gmail first, then either their password (they've been here
 * before) or "create a password" confirmed by a code sent to that Gmail (first time).
 */
export function StepLogin({ role }: { role: Role }) {
  const { t } = useLang();
  const A = t.auth;
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password" | "create" | "code">("email");
  const [state, setState] = useState<"password" | "google" | "new" | "unknown">("unknown");
  const [kind, setKind] = useState<"signup" | "recovery">("signup"); // recovery: the account exists (Google) and only needs a password
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sb = supabaseBrowser;
  const mail = email.trim().toLowerCase();
  const back = () => `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/continue")}`;
  const go = (next: typeof step) => (setStep(next), setMsg(null), setPassword(""), setAgain(""), setCode(""));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch {
      setMsg({ ok: false, text: A.failed });
    } finally {
      setBusy(false);
    }
  };

  const checkEmail = () =>
    run(async () => {
      const res = await fetch("/api/auth/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mail }) });
      const s = res.ok ? ((await res.json()) as { state: typeof state }).state : "unknown";
      setState(s);
      setKind(s === "google" ? "recovery" : "signup");
      go(s === "new" || s === "google" ? "create" : "password"); // unknown: the password form, which also offers "first time here"
    });

  const signIn = () =>
    run(async () => {
      sessionStorage.setItem(WANTED, role);
      const { error } = await sb().auth.signInWithPassword({ email: mail, password });
      if (!error) return router.push("/auth/continue");
      setMsg({ ok: false, text: /confirm/i.test(error.message) ? A.confirmFirst : A.wrongPassword });
    });

  const sendCode = (k = kind) =>
    run(async () => {
      if (k === "recovery") await sb().auth.resetPasswordForEmail(mail, { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset")}` });
      else {
        const { data, error } = await sb().auth.signUp({ email: mail, password, options: { emailRedirectTo: back() } });
        if (error) return setMsg({ ok: false, text: /password/i.test(error.message) ? A.passwordRule : A.signupFailed });
        // An address that already has a confirmed account gets no email from sign-up: set its password by a reset code instead.
        if (data.user && !data.user.identities?.length) {
          setKind("recovery");
          await sb().auth.resetPasswordForEmail(mail, { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset")}` });
        }
      }
      setStep("code");
      setCode("");
    });

  const create = () => {
    if (!strongPassword(password)) return setMsg({ ok: false, text: A.passwordRule });
    if (password !== again) return setMsg({ ok: false, text: A.passwordsDiffer });
    void sendCode();
  };

  const verify = () =>
    run(async () => {
      sessionStorage.setItem(WANTED, role);
      const { error } = await sb().auth.verifyOtp({ email: mail, token: code.trim(), type: kind });
      if (error) return setMsg({ ok: false, text: A.wrongCode });
      if (kind === "recovery") {
        // The code proved the Gmail is theirs; now set the password. Typing the password they already had is fine: they're in.
        const { error: e } = await sb().auth.updateUser({ password });
        if (e && e.code !== "same_password") return setMsg({ ok: false, text: passwordProblem(e.code, A) });
      }
      router.push("/auth/continue");
    });

  const forgot = () =>
    run(async () => {
      await sb().auth.resetPasswordForEmail(mail, { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset")}` });
      setMsg({ ok: true, text: A.resetSent });
    });

  const who = step !== "email" && (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="min-w-0 break-all font-semibold">{mail}</span>
      <button type="button" onClick={() => go("email")} className={link}>{A.changeEmail}</button>
    </div>
  );
  const note = msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>;
  const field = "flex flex-col gap-2 text-sm font-semibold text-on-surface-variant";

  if (step === "email")
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), void checkEmail())}>
        <label className={field}>
          {A.step1Help}
          <input required type="email" autoComplete="email" inputMode="email" placeholder="you@gmail.com" value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} className={box} />
        </label>
        {note}
        <button type="submit" disabled={busy} className={main}><Icon name="arrow" size={20} /> {A.next}</button>
      </form>
    );

  if (step === "password")
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), void signIn())}>
        {who}
        <label className={field}>
          {state === "password" ? A.welcomeBack : A.password}
          <PasswordInput required autoFocus autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} className={box} />
        </label>
        {note}
        <button type="submit" disabled={busy} className={main}><Icon name="arrow" size={20} /> {A.signIn}</button>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <button type="button" disabled={busy} onClick={() => void forgot()} className={link}>{A.forgot}</button>
          <button type="button" disabled={busy} onClick={() => go("create")} className={link}>{A.firstTime}</button>
        </div>
      </form>
    );

  if (step === "create")
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), create())}>
        {who}
        <p className="text-sm font-semibold">{state === "google" ? A.usedGoogle : A.firstVisit}</p>
        <label className={field}>
          {A.password}
          <PasswordInput required autoFocus autoComplete="new-password" minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} className={box} />
          <span className="font-normal">{A.passwordRule}</span>
        </label>
        <label className={field}>
          {A.passwordAgain}
          <PasswordInput required autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); setMsg(null); }} className={box} />
        </label>
        {note}
        <button type="submit" disabled={busy} className={main}>{A.sendCode}</button>
      </form>
    );

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), void verify())}>
      {who}
      <label className={field}>
        <span className="text-on-surface">{A.codeSent(mail)}</span>
        {A.codeLabel}
        <input required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setMsg(null); }} className={`${box} text-center text-2xl font-bold tracking-[0.4em]`} />
      </label>
      {note}
      <button type="submit" disabled={busy || code.length < 6} className={main}>{A.verify}</button>
      <button type="button" disabled={busy} onClick={() => void sendCode()} className={`${link} self-center`}>{A.resend}</button>
    </form>
  );
}
