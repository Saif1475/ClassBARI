"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { Icon } from "@/components/Icon";
import { Logo, LangSwitch } from "@/components/Brand";
import { VideoPlayer } from "@/components/VideoPlayer";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtAgo } from "@/lib/dates";
import { useLms } from "@/lib/lms-store";

export default function WatchPage({ params }: PageProps<"/student/watch/[id]">) {
  const { id } = use(params);
  const { t, lang } = useLang();
  const lms = useLms();
  const video = lms.exploreVideos.find((v) => String(v.id) === id);
  if (!video) notFound();

  // Batch-only videos play for students whose batch is taught by the video's teacher.
  const me = lms.students.find((s) => s.id === lms.meId);
  const myBatch = me?.batch;
  const locked = !video.free && !lms.batches.some((b) => b.name === myBatch && b.teacher === video.teacher);
  const more = lms.exploreVideos.filter((v) => v.id !== video.id && (v.subject === video.subject || v.teacher === video.teacher)).slice(0, 6);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="glass-header flex items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Logo href="/" />
        <LangSwitch compact />
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:px-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Link href="/student" className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary">
            <Icon name="back" size={18} /> {t.video.back}
          </Link>
          {locked ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl bg-deep p-6 text-center text-primary-container">
              <span className="text-lg font-bold text-white">{t.video.locked}</span>
              <span className="text-sm">{t.video.lockedSub}</span>
            </div>
          ) : (
            <VideoPlayer url={video.url} title={video.title} viewer={me && `${me.name} · ${me.email || me.phone}`} />
          )}
          <h1 className="text-2xl font-bold">{video.title}</h1>
          <p className="text-sm text-on-surface-variant">
            {video.teacher} · {video.subject} · {video.level} · {t.student.views(video.views)} · {fmtAgo(video.postedAt, lang)}
          </p>
        </div>
        <aside className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t.video.more}</h2>
          {more.map((v) => (
            <Link key={v.id} href={`/student/watch/${v.id}`} className="flex gap-3 rounded-xl p-2 hover:bg-surface-container">
              <span className="flex aspect-video w-32 shrink-0 items-center justify-center rounded-[10px] bg-primary-container p-1 text-center text-xs font-bold text-on-primary-container">{v.thumb}</span>
              <span className="flex min-w-0 flex-col">
                <span className="line-clamp-2 text-sm font-semibold">{v.title}</span>
                <span className="text-xs text-on-surface-variant">{v.teacher} · {v.length}</span>
              </span>
            </Link>
          ))}
        </aside>
      </main>
    </div>
  );
}
