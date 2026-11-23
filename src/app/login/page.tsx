"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LangSwitch, Mark } from "@/components/Brand";
import { SlidingSegmented } from "@/components/SlidingSegmented";
import { useFlag } from "@/components/Platform";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { setRole as saveRole, type Role } from "@/lib/role";
import { useLms } from "@/lib/lms-store";
import { isGmail } from "@/lib/site";
import { REAL_AUTH } from "@/lib/auth-mode";
import { RealLogin } from "@/components/auth/RealLogin";
import { useAppLock } from "@/lib/app-lock";

const home: Record<Role, string> = { student: "/student", teacher: "/teacher", institute: "/institute", parent: "/parent" };

export default function LoginPage() {
  const { t } = useLang();
  const L = t.login;
  const signupsOn = useFlag("signups");
  const app = useAppLock(); // Student / Guardian apps: sign-up is for institutes, so no "Create an account"
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [gmail, setGmail] = useState("");
  const [gmailError, setGmailError] = useState("");
  const lms = useLms();
  const G = t.gsign;

  // Demo only: no real OTP yet. Wire this to Supabase Auth (phone OTP) later.
  const enter = (as: Role = role) => {
    saveRole(as);
    // Go back to the page that sent us here if it belongs to the role.
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && (next === home[as] || next.startsWith(home[as] + "/")) ? next : home[as]);
  };
  // Students and guardians: only Gmails registered by the teacher get in; the Gmail decides the role.
  const signInGoogle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGmail(gmail)) return setGmailError(G.invalid);
    const found = lms.signInWithEmail(gmail);
    if (!found) return setGmailError(G.notRegistered);
    enter(found);
  };
  const [phoneProblem, setPhoneProblem] = useState<"" | "notStaff" | "notOwner">("");
  // The number decides what opens: only the owner's number gets the Institute view; any staff number gets
  // that teacher's own batches. (Choosing "Institute" with a teacher's number is refused.)
  const staffFor = (p: string) => lms.staff.find((s) => s.phone.replace(/\D/g, "").slice(-10) === p.replace(/\D/g, "").slice(-10));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "phone" && !/^1[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, "").replace(/^0/, ""))) return setPhoneError(true);
    const st = staffFor(phone);
    if (!st) return setPhoneProblem("notStaff");
    if (role === "institute" && st.name !== lms.teacherName) return setPhoneProblem("notOwner");
    if (step === "phone") return setStep("otp");
    const who = lms.signInTeacher(phone);
    if (!who) return setPhoneProblem("notStaff");
    enter(role === "institute" && who === "owner" ? "institute" : "teacher");
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rotate-[18deg] rounded-[120px_40px_120px_40px] bg-primary-container" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-[40px_120px_40px_120px] bg-secondary-container" />
      <div aria-hidden className="pointer-events-none absolute right-16 top-40 h-16 w-16 rounded-full bg-tertiary-container" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary text-on-primary" aria-label="Instanton Campus home">
            <Mark size={32} />
          </Link>
          <LangSwitch />
        </div>

        <h1 className="text-4xl font-bold leading-tight">{L.title}</h1>
        <p className="mt-2 text-on-surface-variant">{L.sub}</p>

        {REAL_AUTH ? (
          <RealLogin />
        ) : (
        <form onSubmit={role === "teacher" || role === "institute" ? submit : signInGoogle} className="mt-8 flex flex-col gap-5 rounded-[24px] bg-white/80 p-6 shadow-[0_10px_40px_rgba(0,32,28,0.08)] backdrop-blur">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-on-surface-variant">{L.iam}</span>
            <SlidingSegmented
              ariaLabel={L.iam}
              value={role}
              onChange={(r) => {
                setRole(r);
                setStep("phone");
                setPhoneError(false);
                setPhoneProblem("");
                setGmailError("");
              }}
              options={(Object.keys(L.roles) as Role[]).map((r) => ({
                value: r,
                label: L.roles[r],
              }))}
              className="flex-wrap rounded-xl p-1"
              pillClassName="rounded-[10px] bg-secondary-container shadow-[0_4px_14px_rgba(0,106,96,0.16)] ring-1 ring-white/80"
              activeTextClassName="text-on-secondary-container"
              buttonClassName="h-11 basis-[40%] px-2 text-xs font-bold sm:basis-0 sm:text-sm"
            />
          </div>

          {role !== "teacher" && role !== "institute" ? (
            <>
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface-variant">
                {G.gmail}
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={gmail}
                  onChange={(e) => {
                    setGmail(e.target.value);
                    setGmailError("");
                  }}
                  aria-invalid={!!gmailError}
                  placeholder="name@gmail.com"
                  className="h-14 rounded-xl border border-outline bg-white px-4 text-base text-on-surface outline-primary"
                />
                <span className="font-normal">{G.hint}</span>
                {gmailError && <span role="alert" className="text-error">{gmailError}</span>}
              </label>
              <button type="submit" disabled={!lms.ready} className="flex h-14 items-center justify-center gap-2.5 rounded-full bg-primary text-[17px] font-bold text-on-primary disabled:opacity-60">
                <Icon name="globe" size={20} />
                {G.continue}
              </button>
              <p className="text-center text-xs text-on-surface-variant">{G.demo}</p>
            </>
          ) : step === "phone" ? (
            <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface-variant">
              {L.phone}
              <span className="flex h-14 items-center gap-2.5 rounded-xl border border-outline bg-white px-4 focus-within:outline-2 focus-within:outline-primary">
                <span className="font-semibold text-on-surface">+880</span>
                <span className="h-6 w-px bg-outline-variant" />
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneError(false);
                    setPhoneProblem("");
                  }}
                  aria-invalid={phoneError}
                  placeholder="1XXXXXXXXX"
                  className="flex-1 bg-transparent text-base text-on-surface outline-none"
                />
              </span>
              {phoneError && <span role="alert" className="text-error">{L.phoneInvalid}</span>}
              {phoneProblem && <span role="alert" className="text-error">{L[phoneProblem]}</span>}
            </label>
          ) : (
            <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface-variant">
              {L.otpLabel}
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="• • • • • •"
                className="h-14 rounded-xl border border-outline bg-white px-4 text-center text-2xl tracking-[0.5em] text-on-surface outline-primary"
              />
            </label>
          )}

          {(role === "teacher" || role === "institute") && (
            <button type="submit" className="h-14 rounded-full bg-primary text-[17px] font-bold text-on-primary">
              {step === "phone" ? L.sendOtp : L.verify}
            </button>
          )}
        </form>
        )}

        {signupsOn && app !== "student" && app !== "parent" && (
          <p className="mt-6 text-center text-sm text-on-surface-variant">
            {L.newHere}{" "}
            <Link href="/signup" className="font-bold text-primary">
              {L.create}
            </Link>
          </p>
        )}
        <p className="mt-2 text-center text-sm">
          <Link href="/support" className="font-bold text-primary">{t.support.link}</Link>
        </p>
        {!REAL_AUTH && <p className="mt-2 text-center text-xs text-on-surface-variant">{L.note}</p>}
      </div>
    </div>
  );
}
