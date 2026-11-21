"use client";

import Link from "next/link";
import { use } from "react";
import { Logo, LangSwitch } from "@/components/Brand";
import { FeatureOff } from "@/components/Platform";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { averagePct, useLms } from "@/lib/lms-store";
import { taka } from "@/lib/mock-data";

/** A teacher's own public page. shortcut: reads this browser's demo data; with Supabase it reads the teacher's published profile. */
function TeacherSite({ params }: PageProps<"/t/[slug]">) {
  const { slug } = use(params);
  const { t } = useLang();
  const W = t.website;
  const lms = useLms();
  if (!lms.ready) return null;
  const site = lms.site;
  const found = site.published && site.slug === slug;
  const batches = lms.batches.filter((b) => b.public);
  // Real accounts: the server sends the two totals. Demo: counted here from the sample data.
  const avg = lms.publicStats ? lms.publicStats.average : averagePct(lms.modules, lms.students.map((s) => s.id));
  const studentCount = lms.publicStats ? lms.publicStats.students : lms.students.length;

  return (
    <div className="min-h-dvh bg-surface px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><Logo /><LangSwitch compact /></div>
        {!found ? (
          <p className="rounded-xl bg-error-container p-4 text-on-error-container">{W.notFound}</p>
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-[20px] bg-white p-6">
              <h1 className="text-4xl font-bold">{lms.teacherName}</h1>
              {site.bio && <p className="whitespace-pre-wrap text-lg leading-relaxed">{site.bio}</p>}
              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                <span className="rounded-full bg-primary-container px-4 py-2 text-on-primary-container">{W.students(studentCount)}</span>
                {avg !== null && <span className="rounded-full bg-secondary-container px-4 py-2 text-on-secondary-container">{W.average(avg)}</span>}
              </div>
            </section>
            <h2 className="text-2xl font-bold">{W.courses}</h2>
            {batches.length === 0 && <p className="text-on-surface-variant">{t.courses.none}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {batches.map((b) => (
                <Link key={b.id} href={`/courses/${b.id}`} className="flex flex-col gap-2 rounded-[18px] bg-white p-5">
                  <b className="text-xl">{b.name}</b>
                  <span className="text-on-surface-variant">{b.days}</span>
                  <span className="font-extrabold">{t.courses.perMonth(taka(b.fee))}</span>
                  <span className="font-bold text-primary">{W.join} →</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/t/[slug]">) {
  return <FeatureOff flag="publicCourses"><TeacherSite {...props} /></FeatureOff>;
}
