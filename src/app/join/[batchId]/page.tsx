"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { REAL_AUTH } from "@/lib/auth-mode";
import { publicPost } from "@/lib/public-api";
import { JoinedNotice } from "@/components/JoinedNotice";
import { Logo, LangSwitch } from "@/components/Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { setRole } from "@/lib/role";
import { StudentForm } from "@/components/StudentForm";


export default function Join({ params }: PageProps<"/join/[batchId]">) {
  const { batchId } = use(params);
  const { t } = useLang();
  const J = t.join;
  const lms = useLms();
  const router = useRouter();
  const [joined, setJoined] = useState<{ ok: boolean; email: string } | null>(null);
  if (!lms.ready) return null;
  const batch = lms.batches.find((b) => b.id === batchId);

  return (
    <div className="min-h-dvh bg-surface px-5 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LangSwitch compact />
        </div>
        {!batch ? (
          <p className="rounded-xl bg-error-container p-4 text-on-error-container">{J.notFound}</p>
        ) : (
          <>
            <div>
              <h1 className="text-3xl font-bold">{J.title(batch.name)}</h1>
              <p className="mt-1 text-on-surface-variant">{batch.teacher} · {batch.days}</p>
              <p className="mt-1 text-on-surface-variant">{J.sub}</p>
            </div>
            <div className="rounded-[20px] bg-white p-6">
              {joined?.ok ? (
                <JoinedNotice email={joined.email} />
              ) : (
              <StudentForm
                batch={batch.name}
                submitLabel={J.submit}
                onSubmit={async (input) => {
                  if (REAL_AUTH) {
                    const r = await publicPost({ kind: "join", batchId, student: input });
                    return setJoined({ ok: r.ok, email: input.email });
                  }
                  const id = lms.addStudent({ ...input, mode: "online", feePaid: false });
                  lms.setMe(id);
                  setRole("student");
                  router.push("/student");
                }}
              />
              )}
              {joined && !joined.ok && <p role="alert" className="mt-3 text-sm font-semibold text-error">{J.failed}</p>}
            </div>
          </>
        )}
        {!REAL_AUTH && <p className="text-center text-xs text-on-surface-variant">{J.demoNote}</p>}
      </div>
    </div>
  );
}

