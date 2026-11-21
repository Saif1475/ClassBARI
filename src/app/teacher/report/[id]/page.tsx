"use client";

import Link from "next/link";
import { use } from "react";
import { Icon } from "@/components/Icon";
import { ReportCard } from "@/components/ReportCard";
import { useLang } from "@/lib/i18n/LanguageProvider";

export default function TeacherReport({ params }: PageProps<"/teacher/report/[id]">) {
  const { id } = use(params);
  const { t } = useLang();
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <Link href="/teacher/batch" className="inline-flex items-center gap-1.5 px-4 pt-5 text-sm font-semibold text-primary md:px-8 print:hidden">
        <Icon name="back" size={18} /> {t.common.back}
      </Link>
      <ReportCard studentId={Number(id)} editable />
    </div>
  );
}
