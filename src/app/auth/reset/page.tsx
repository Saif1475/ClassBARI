"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Brand";
import { PasswordInput } from "@/components/PasswordInput";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import { passwordProblem, strongPassword } from "@/components/auth/StepLogin";

/** Opened from the "reset your password" email (the link signs the person in first, via /auth/callback). */
export default function ResetPassword() {
  const { t } = useLang();
  const A = t.auth;
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-[20px] bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!strongPassword(pw)) return setError(A.passwordRule);
          if (pw !== pw2) return setError(A.passwordsDiffer);
          const { error: err } = await supabaseBrowser().auth.updateUser({ password: pw });
          if (err && err.code !== "same_password") return setError(err.code === "session_not_found" || err.code === "bad_jwt" ? A.resetFailed : passwordProblem(err.code, A)); // the same password as before is fine
          router.replace("/auth/continue");
        }}
      >
        <Logo />
        <h1 className="text-2xl font-bold">{A.newPassword}</h1>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">{A.password}<PasswordInput autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-xl border border-outline bg-transparent px-4" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">{A.passwordAgain}<PasswordInput autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12 rounded-xl border border-outline bg-transparent px-4" /></label>
        {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
        <button type="submit" className="h-12 rounded-full bg-primary font-bold text-on-primary">{A.savePassword}</button>
      </form>
    </div>
  );
}
