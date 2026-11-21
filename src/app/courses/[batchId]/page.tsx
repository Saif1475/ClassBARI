"use client";

import { REAL_AUTH } from "@/lib/auth-mode";
import { publicPost } from "@/lib/public-api";
import { JoinedNotice } from "@/components/JoinedNotice";
import Link from "next/link";
import { FeatureOff } from "@/components/Platform";
import { BuyCourse } from "@/components/BuyCourse";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Logo, LangSwitch } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { VideoPlayer } from "@/components/VideoPlayer";
import { FileLink } from "@/components/FileLink";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { taka } from "@/lib/mock-data";
import { useLms } from "@/lib/lms-store";
import { setRole } from "@/lib/role";
import { StudentForm } from "@/components/StudentForm";


function CoursePage({ params }: PageProps<"/courses/[batchId]">) {
  const { batchId } = use(params);
  const { t } = useLang();
  const C = t.courses;
  const lms = useLms();
  const router = useRouter();
  const [newId, setNewId] = useState<number | null>(null); // set after enrolling: show the pay step
  const [openPreview, setOpenPreview] = useState<number | null>(null);
  const [joined, setJoined] = useState<{ ok: boolean; email: string } | null>(null); // real accounts
  if (!lms.ready) return null;

  const batch = lms.batches.find((b) => b.id === batchId && b.public);
  const modules = lms.modules.filter((m) => batch && m.batch === batch.name && m.published);
  const previews = modules.flatMap((m) => m.items.filter((it) => it.preview));
  const enrolled = newId !== null ? lms.students.find((s) => s.id === newId) : undefined;
  const goStudent = () => {
    setRole("student");
    router.push("/student");
  };

  return (
    <div className="min-h-dvh bg-surface px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LangSwitch compact />
        </div>
        <Link href="/courses" className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary">
          <Icon name="back" size={18} /> {C.title}
        </Link>

        {!batch ? (
          <p className="rounded-xl bg-error-container p-4 text-on-error-container">{t.join.notFound}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-5">
              <div>
                <span className="font-semibold text-primary">{batch.teacher}</span>
                <h1 className="text-4xl font-bold">{batch.name}</h1>
                <p className="mt-1 text-on-surface-variant">{batch.days}</p>
              </div>
              {batch.about && (
                <section>
                  <h2 className="text-lg font-bold">{C.about}</h2>
                  <p className="mt-1 leading-relaxed">{batch.about}</p>
                </section>
              )}
              {modules.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-lg font-bold">{C.syllabus}</h2>
                  {modules.map((m) => (
                    <div key={m.id} className="rounded-xl bg-white px-4 py-3">
                      <span className="font-semibold">{m.title}</span>
                      <span className="ml-2 text-sm text-on-surface-variant">· {m.items.length}</span>
                    </div>
                  ))}
                </section>
              )}
              {previews.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-lg font-bold">{C.preview}</h2>
                  {previews.map((it) => (
                    <div key={it.id} className="flex flex-col gap-2 rounded-xl bg-white p-3">
                      <button type="button" onClick={() => setOpenPreview(openPreview === it.id ? null : it.id)} aria-expanded={openPreview === it.id} className="flex items-center gap-3 text-left">
                        <Icon name={it.kind === "video" ? "video" : "file"} size={20} className="text-primary" />
                        <span className="flex-1 font-semibold">{it.title}</span>
                        <span className="text-xs text-on-surface-variant">{t.kinds[it.kind]}</span>
                      </button>
                      {openPreview === it.id &&
                        (it.kind === "video" ? (
                          <VideoPlayer url={it.url} title={it.title} />
                        ) : it.url ? (
                          <FileLink url={it.url} className="self-start text-sm font-bold text-primary underline">{t.student.openPdf}</FileLink>
                        ) : (
                          <p className="text-sm text-on-surface-variant">{t.student.pdfNoLink}</p>
                        ))}
                    </div>
                  ))}
                </section>
              )}
            </div>

            <aside className="flex h-fit flex-col gap-4 rounded-[20px] bg-white p-6 lg:sticky lg:top-6">
              <span className="text-3xl font-extrabold">{C.perMonth(taka(batch.fee))}</span>
              {lms.site.bkash ? (
                <div className="flex flex-col gap-3">
                  <h2 className="font-bold">{C.enrolTitle}</h2>
                  <BuyCourse batch={batch} />
                </div>
              ) : joined?.ok ? (
                <JoinedNotice email={joined.email} />
              ) : !enrolled ? (
                <div className="flex flex-col gap-3">
                  <h2 className="font-bold">{C.enrolTitle}</h2>
                  <StudentForm
                    batch={batch.name}
                    submitLabel={C.enrol}
                    onSubmit={async (input) => {
                      if (REAL_AUTH) return setJoined({ ok: (await publicPost({ kind: "join", batchId, student: input })).ok, email: input.email });
                      const id = lms.addStudent({ ...input, mode: "online", feePaid: false });
                      lms.setMe(id);
                      setNewId(id);
                    }}
                  />
                  {joined && !joined.ok && <p role="alert" className="text-sm font-semibold text-error">{t.join.failed}</p>}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p role="status" className="font-bold text-primary">✓ {enrolled.name}</p>
                  {enrolled.feeDue > 0 && <p>{C.firstFee(taka(enrolled.feeDue))}</p>}
                  {enrolled.feeDue > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(t.parent.confirmPay(taka(enrolled.feeDue)))) return;
                        lms.payFee(enrolled.id, "bkash");
                        goStudent();
                      }}
                      className="h-13 rounded-full bg-bkash font-bold text-white"
                    >
                      {C.payNow}
                    </button>
                  )}
                  <button type="button" onClick={goStudent} className="h-12 rounded-full border border-outline-variant font-bold">
                    {enrolled.feeDue > 0 ? C.later : C.view}
                  </button>
                </div>
              )}
              {!REAL_AUTH && <p className="text-xs text-on-surface-variant">{t.join.demoNote}</p>}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/courses/[batchId]">) {
  return <FeatureOff flag="publicCourses"><CoursePage {...props} /></FeatureOff>;
}
