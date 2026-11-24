"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Brand";
import { forgetsPickedInstitute, homeFor, needsFirstBatch, needsOwnInstitute } from "@/lib/access";
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
      let wanted = inApp ? roleIn(inApp, picked) : (picked ?? undefined); // in an app: one of its roles (Campus: teacher or institute)
      // Students, guardians and teachers picked an institute: only their place there counts (owners: any of theirs).
      const inst = wanted && wanted !== "institute" ? getInstitute() : null;
      const access = async () => ((await sb.rpc("my_access")).data ?? []) as { role: string; institute_id: string }[];
      const roles = async () => (await access()).filter((r) => !inst || r.institute_id === inst.id).map((r) => r.role);
      let mine = await roles();
      const meta = auth.user.user_metadata ?? {};
      // All their roles, not only at the picked institute: a teacher at B or a guardian somewhere can still open their own centre.
      // One tab at a time (Web Locks): two tabs opening this page together would each create the institute and its first batch.
      const once = <T,>(fn: () => Promise<T>) => (navigator.locks ? navigator.locks.request("own-institute", fn) : fn());
      const made = await once(async () => {
        if (meta.signup_kind !== "institute") return "skip";
        let all = await access();
        const created = needsOwnInstitute(all.map((r) => r.role), meta.signup_kind);
        if (created) {
          setInstitute(null); // an institute picked earlier (B) would send the first batch there, where they aren't the owner
          const { error } = await sb.rpc("create_institute", { p_name: meta.institute || meta.full_name || "My institute", p_branch: "Main", p_owner_name: meta.full_name || auth.user!.email });
          if (error) return "failed";
          all = await access();
        }
        // create_institute hands back an owner's existing centre even when it was switched off (my_access hides it): don't send the batch elsewhere
        const owned = all.find((r) => r.role === "owner");
        if (!owned) return "skip";
        // Asked of their own centre every time, not only right after creating it: a first batch that failed to save once is sent again, one that saved never twice.
        const own = { "x-classbari-institute": owned.institute_id };
        const got = await fetch("/api/data", { headers: own, cache: "no-store" });
        if (!got.ok) return created ? "failed" : "skip"; // an owner who signed up long ago still gets in when this check can't be made
        if (!needsFirstBatch(meta.signup_kind, await got.json())) return "skip";
        // Their first batch, from the sign-up form (kept with the account until the email was confirmed). A name of only spaces was kept as "": the email instead, as for create_institute.
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { ...own, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "signUpTeacher",
            base: Date.now(),
            args: [{ institute: String(meta.institute || ""), name: String(meta.full_name || auth.user!.email || ""), phone: String(meta.phone || ""), batch: String(meta.batch || "Batch 1"), days: String(meta.days || ""), classDays: Array.isArray(meta.classDays) ? meta.classDays : [], subject: String(meta.subject || ""), fee: Number(meta.fee) || 0 }],
          }),
        });
        if (!res.ok) return "failed";
        return "made";
      });
      if (made === "failed") return setProblem("failed");
      if (made === "made") {
        mine = (await access()).map((r) => r.role);
        wanted = "institute"; // they signed up to run their centre: open it, not B's teacher view
      }
      setApp(inApp);
      const home = homeFor(mine, wanted);
      if (!home) return setProblem(inst ? "notAtInstitute" : "notEnrolled");
      if (inApp && !APPS[inApp].roles.includes(home.uiRole)) return setProblem("wrongApp"); // e.g. a student's account in the Guardian app
      if (forgetsPickedInstitute(home.uiRole, wanted)) setInstitute(null); // an owner, anyone who chose "Institute", or who chose nothing (roles not checked against it), is not tied to an institute picked earlier on this browser (as a student, say)
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
