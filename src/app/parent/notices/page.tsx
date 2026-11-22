"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms, noticesFor } from "@/lib/lms-store";
import { fmtWhen } from "@/lib/dates";
import { useChild } from "../child";

/** The notices for the child's batch (and for everyone), newest first: the same list the guardian app shows. */
export default function ParentNotices() {
  const { t, lang } = useLang();
  const T = t.teacher;
  const lms = useLms();
  const { child } = useChild();
  if (!child) return <p className="p-8 text-on-surface-variant">{T.noMatch}</p>;
  const list = noticesFor(lms.announcements, child.batch);
  return (
    <div className="flex flex-col gap-3 px-4 pt-6 pb-10 md:px-8">
      <h1 className="text-2xl font-bold">{t.app.notices}</h1>
      {list.length === 0 && <p className="text-on-surface-variant">{t.app.noNotices}</p>}
      {list.map((a) => (
        <article key={a.id} className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{a.title}</h2>
            {a.pinned && <span className="rounded-full bg-tertiary-container px-3 py-1 text-xs font-bold text-on-tertiary-container">{T.pinned}</span>}
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{a.body}</p>
          <span className="text-xs text-on-surface-variant">{T.postedBy(a.author, a.batch, fmtWhen(a.at, lang))}</span>
        </article>
      ))}
    </div>
  );
}
