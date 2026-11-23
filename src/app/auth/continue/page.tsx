"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Brand";
import { homeFor } from "@/lib/access";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { logOut } from "@/lib/logout";
import { setRole } from "@/lib/role";
import { forgetView } from "@/lib/lms-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { currentApp } from "@/lib/app-lock";
import { getInstitute, setInstitute } from "@/lib/institute-choice";
import { APPS, roleIn } from "@/lib/apps";

const WANTED = "classbari-wanted-role"; // the button picked on the login page

/**
 * After any login: ask the database who this is and open the right panel.
 * A teacher's first confirmed login also creates their institute (they signed up with signup_kind = "institute").
 */
export default function Continue() {
  const { t } = useLang();
  const A = t.auth;
  const router = useRouter();
  const [problem, setProblem] = useState<"" | "notEnrolled" | "failed" | "wrongApp" | "notAtInstitute">("");
  const [app, setApp] = useState<keyof typeof APPS | null>(null);

  useEffect(() => {
    forgetView(); // a new sign-in never opens with what the person before had on screen
    (async () => {
      const sb = supabaseBrowser();
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return router.replace("/login");
      const inApp = currentApp();
      const picked = sessionStorage.getItem(WANTED);
      const wanted = inApp ? roleIn(inApp, picked) : (picked ?? undefined); // in an app: one of its roles (Campus: teacher or institute)
      // Students, guardians and teachers picked an institute: only their place there counts (owners: any of theirs).
      const inst = wanted && wanted !== "institute" ? getInstitute() : null;
      const roles = async () =>
        (((await sb.rpc("my_access")).data ?? []) as { role: string; institute_id: string }[]).filter((r) => !inst || r.institute_id === inst.id).map((r) => r.role);
      let mine = await roles();
      const meta = auth.user.user_metadata ?? {};
      if (!mine.length && meta.signup_kind === "institute") {
        const { error } = await sb.rpc("create_institute", { p_name: meta.institute || meta.full_name || "My institute", p_branch: "Main", p_owner_name: meta.full_name || auth.user.email });
        if (error) return setProblem("failed");
        // Their first batch, from the sign-up form (kept with the account until the email was confirmed).
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "signUpTeacher",
            base: Date.now(),
            args: [{ institute: String(meta.institute || ""), name: String(meta.full_name || ""), phone: String(meta.phone || ""), batch: String(meta.batch || "Batch 1"), days: String(meta.days || ""), classDays: Array.isArray(meta.classDays) ? meta.classDays : [], subject: String(meta.subject || ""), fee: Number(meta.fee) || 0 }],
          }),
        });
        if (!res.ok) return setProblem("failed");
        mine = await roles();
      }
      setApp(inApp);
      const home = homeFor(mine, wanted);
      if (!home) return setProblem(inst ? "notAtInstitute" : "notEnrolled");
      if (inApp && !APPS[inApp].roles.includes(home.uiRole)) return setProblem("wrongApp"); // e.g. a student's account in the Guardian app
      if (home.uiRole === "institute") setInstitute(null); // an owner is not tied to an institute picked earlier on this browser (as a student, say)
      setRole(home.uiRole); // UI hint only; access is checked by the database on every page
      location.replace(home.path); // a full load, so the app fetches this person's data
    })().catch(() => setProblem("failed"));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      {!problem ? (
        <p className="text-lg font-semibold text-on-surface-variant">{A.signingIn}</p>
      ) : (
        <div className="flex max-w-md flex-col items-center gap-4 rounded-[18px] border border-outline-variant bg-white p-6">
          <p role="alert" className="text-lg font-semibold">{problem === "notAtInstitute" ? A.notAtInstitute(getInstitute()?.name ?? "") : problem === "notEnrolled" ? A.notEnrolled : problem === "wrongApp" && app ? A.wrongApp(APPS[app].name) : A.failed}</p>
          <button type="button" onClick={async () => { await logOut(); router.replace("/login"); }} className="h-12 rounded-full bg-primary px-6 font-bold text-on-primary">{A.tryOther}</button>
          <Link href="/support" className="text-sm font-bold text-primary">{t.support.link}</Link>
        </div>
      )}
    </div>
  );
}
