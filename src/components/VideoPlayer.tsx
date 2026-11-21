"use client";

import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "./Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useFileUrl } from "@/lib/file-store";

const youtubeId = (url: string) => url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1];
const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Bookmark = { id: number; time: number; note: string };

/**
 * Smart + Anti-Piracy Video Player.
 * Plays YouTube links or direct video files; when `viewer` is set, overlays a dynamic moving
 * student watermark, blocks download / PiP / right-click, and provides playback speed,
 * auto-resume, and timestamped bookmarks.
 */
export function VideoPlayer({ url, title, viewer, onProgress }: { url?: string; title: string; viewer?: string; onProgress?: (sec: number, duration: number) => void }) {
  const w = useRef({ last: 0, watched: 0, reported: 0, saved: 0 });
  const storageKey = url ? `edunest-vid-${url.slice(0, 64)}` : "";

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const r = w.current;
    const step = v.currentTime - r.last;
    r.last = v.currentTime;
    if (step > 0 && step < 2) r.watched += step;
    if (storageKey && v.currentTime > 3 && Math.abs(v.currentTime - r.saved) >= 5) {
      r.saved = v.currentTime;
      try {
        localStorage.setItem(`${storageKey}-pos`, String(Math.floor(v.currentTime)));
      } catch {
        /* ignore */
      }
    }
    if (!onProgress || !v.duration || r.watched < r.reported + 5) return;
    r.reported = r.watched;
    onProgress(Math.min(r.watched, v.duration), v.duration);
  };
  const onEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => onProgress?.(Math.min(w.current.watched, e.currentTarget.duration), e.currentTarget.duration);
  const { t } = useLang();
  const src = useFileUrl(url);
  const yt = url && youtubeId(url);
  const box = "aspect-video w-full overflow-hidden rounded-2xl bg-black";

  if (yt) {
    return viewer ? (
      <ProtectedYoutube yt={yt} title={title} viewer={viewer} className={box} />
    ) : (
      <iframe
        className={box}
        src={`https://www.youtube-nocookie.com/embed/${yt}`}
        title={title}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  }
  if (src && /^(https?:\/\/|blob:|\/)/.test(src)) {
    return (
      <SmartVideo
        src={src}
        title={title}
        viewer={viewer}
        storageKey={storageKey}
        className={box}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />
    );
  }
  return (
    <div className={`${box} flex flex-col items-center justify-center gap-3 bg-deep text-center text-primary-container`}>
      <PlayIcon size={40} />
      <span className="px-6 text-sm">{t.video.notUploaded}</span>
    </div>
  );
}

function useMovingWatermark() {
  const [pos, setPos] = useState({ x: 8, y: 10 });
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const move = () => {
      setPos({ x: 4 + Math.random() * 56, y: 6 + Math.random() * 76 });
      id = setTimeout(move, 4000 + Math.random() * 6000);
    };
    id = setTimeout(move, 4000);
    return () => clearTimeout(id);
  }, []);
  return pos;
}

function ProtectedYoutube({ yt, title, viewer, className }: { yt: string; title: string; viewer: string; className: string }) {
  const { t } = useLang();
  const wrap = useRef<HTMLDivElement>(null);
  const pos = useMovingWatermark();
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.());

  return (
    <div ref={wrap} className={`relative ${className}`} onContextMenu={(e) => e.preventDefault()}>
      <iframe
        className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${yt}?modestbranding=1&rel=0`}
        title={title}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
      />
      <span
        data-testid="watermark"
        aria-hidden
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        className="pointer-events-none absolute select-none rounded bg-black/35 px-2 py-0.5 text-xs font-semibold text-white/80 transition-all duration-700 sm:text-sm"
      >
        {viewer}
      </span>
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none whitespace-nowrap text-2xl font-bold text-white/[0.08] sm:text-4xl">
        {viewer}
      </span>
      <button type="button" onClick={fullscreen} aria-label={t.video.fullscreen} className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">
        ⛶ {t.video.fullscreen}
      </button>
    </div>
  );
}

function SmartVideo({
  src,
  title,
  viewer,
  storageKey,
  className,
  ...events
}: { src: string; title: string; viewer?: string; storageKey: string; className: string } & Pick<React.ComponentProps<"video">, "onTimeUpdate" | "onEnded">) {
  const { t } = useLang();
  const wrap = useRef<HTMLDivElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const pos = useMovingWatermark();
  const [speed, setSpeed] = useState(1);
  const [blurred, setBlurred] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [note, setNote] = useState("");
  const [resumedAt, setResumedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!viewer) return; // always on for students: the person it protects against must not be able to switch it off
    const onBlur = () => setBlurred(true);
    const onFocus = () => setBlurred(false);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [viewer]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(`${storageKey}-bm`);
      if (saved) setBookmarks(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const onLoadedMetadata = () => {
    if (!storageKey || !vidRef.current) return;
    try {
      const saved = Number(localStorage.getItem(`${storageKey}-pos`) || 0);
      if (saved > 5 && vidRef.current.duration && saved < vidRef.current.duration - 5) {
        vidRef.current.currentTime = saved;
        setResumedAt(saved);
      }
    } catch {
      /* ignore */
    }
  };

  const changeSpeed = (next: number) => {
    setSpeed(next);
    if (vidRef.current) vidRef.current.playbackRate = next;
  };

  const addBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    const sec = Math.floor(vidRef.current?.currentTime ?? 0);
    const next: Bookmark[] = [...bookmarks, { id: Date.now(), time: sec, note: note.trim() || t.video.bookmarkAt(fmtSec(sec)) }];
    setBookmarks(next);
    setNote("");
    if (storageKey) {
      try {
        localStorage.setItem(`${storageKey}-bm`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const seekTo = (sec: number) => {
    if (!vidRef.current) return;
    vidRef.current.currentTime = sec;
    vidRef.current.play().catch(() => {});
  };

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.());

  return (
    <div className="flex flex-col gap-2.5">
      <div ref={wrap} className={`relative ${className}`} onContextMenu={(e) => e.preventDefault()}>
        <video
          ref={vidRef}
          className={`h-full w-full transition-all duration-200 ${blurred ? "blur-xl" : ""}`}
          src={src}
          controls
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          playsInline
          title={title}
          onLoadedMetadata={onLoadedMetadata}
          {...events}
        >
          <track kind="captions" />
        </video>
        {blurred && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">
            {t.video.blurred}
          </div>
        )}
        {viewer && (
          <>
            <span
              data-testid="watermark"
              aria-hidden
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className="pointer-events-none absolute select-none rounded bg-black/30 px-2 py-0.5 text-xs font-semibold text-white/75 transition-all duration-700 sm:text-sm"
            >
              {viewer}
            </span>
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none whitespace-nowrap text-2xl font-bold text-white/[0.07] sm:text-4xl">
              {viewer}
            </span>
          </>
        )}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <select
            aria-label={t.video.speed}
            value={speed}
            onChange={(e) => changeSpeed(Number(e.target.value))}
            className="rounded-full bg-black/60 px-2.5 py-1.5 text-xs font-bold text-white outline-none"
          >
            {[0.75, 1, 1.25, 1.5, 2].map((r) => (
              <option key={r} value={r} className="text-black">
                {r}x
              </option>
            ))}
          </select>
          <button type="button" onClick={fullscreen} aria-label={t.video.fullscreen} className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">
            ⛶ {t.video.fullscreen}
          </button>
        </div>
      </div>

      {/* Smart Player Bar: Resume badge + Timestamped Bookmarks */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container/70 px-3.5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {resumedAt !== null && (
            <span className="font-semibold text-on-surface-variant">{t.video.resumed(fmtSec(resumedAt))}</span>
          )}
        </div>
        <form onSubmit={addBookmark} className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.video.notePh}
            aria-label={t.video.notePh}
            className="h-8 w-44 rounded-full border border-outline-variant bg-white px-3 text-xs outline-none"
          />
          <button type="submit" className="h-8 rounded-full bg-primary px-3 font-bold text-on-primary">
            + {t.video.bookmark}
          </button>
        </form>
      </div>

      {bookmarks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {bookmarks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => seekTo(b.time)}
              className="rounded-full border border-outline-variant bg-white px-3 py-1 text-xs font-semibold text-on-surface hover:bg-primary-container"
            >
              <span className="font-extrabold text-primary">{fmtSec(b.time)}</span> · {b.note}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
