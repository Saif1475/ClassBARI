"use client";

import Link from "next/link";
import { FeatureOff } from "@/components/Platform";
import { Logo, LangSwitch } from "@/components/Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { REAL_AUTH } from "@/lib/auth-mode";
import { taka } from "@/lib/mock-data";
import { useLms } from "@/lib/lms-store";

function Courses() {
  const { t } = useLang();
  const C = t.courses;
  const lms = useLms();
  const list = lms.batches.filter((b) => b.public);

  return (
    <div className="min-h-dvh bg-surface px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LangSwitch compact />
        </div>
        <div>
          <h1 className="text-4xl font-bold">{C.title}</h1>
          <p className="mt-1 text-lg text-on-surface-variant">{C.sub}</p>
        </div>
        {lms.ready && list.length === 0 && <p className="text-on-surface-variant">{C.none}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {lms.ready &&
            list.map((b) => (
              <Link key={b.id} href={`/courses/${b.id}`} className="flex flex-col gap-2 rounded-[20px] border border-outline-variant bg-white p-5 transition-transform hover:-translate-y-0.5">
                <span className="text-sm font-semibold text-primary">{b.teacher}</span>
                <span className="text-xl font-bold">{b.name}</span>
                <span className="text-sm text-on-surface-variant">{b.days}</span>
                {b.about && <p className="line-clamp-3 text-sm">{b.about}</p>}
                <span className="mt-auto pt-2 text-lg font-extrabold">{C.perMonth(taka(b.fee))}</span>
              </Link>
            ))}
        </div>
        {!REAL_AUTH && <p className="text-xs text-on-surface-variant">{t.join.demoNote}</p>}
      </div>
    </div>
  );
}

export default function Page() {
  return <FeatureOff flag="publicCourses"><Courses /></FeatureOff>;
}
