"use client";

import { useRef, useState } from "react";
import { fmtAgo } from "@/lib/dates";
import { readAsDataUrl } from "@/lib/files";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { shrinkImage } from "@/lib/image";
import { useLms } from "@/lib/lms-store";
import type { Doubt } from "@/lib/mock-data";
import type { ToolProps } from "./ToolsPage";
import { card, primary, soft } from "./ui";

const MAX_VOICE_SECONDS = 60;

/** Record a short voice note in the browser; gives back a data URL (kept small: max 60 s). */
function VoiceNote({ onDone }: { onDone: (audio: string) => void }) {
  const { t } = useLang();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        clearTimeout(timer.current);
        setRec(null);
        onDone(await readAsDataUrl(new File(chunks, "voice.webm", { type: r.mimeType })));
      };
      r.start();
      setRec(r);
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), MAX_VOICE_SECONDS * 1000);
    } catch {
      setError(true);
    }
  };
  if (error) return <span className="text-xs text-error">{t.doubts.noMic}</span>;
  return (
    <button type="button" onClick={() => (rec ? rec.stop() : start())} className={rec ? "rounded-full bg-error px-4 py-2 text-sm font-bold text-white" : soft}>
      {rec ? t.doubts.stop : t.doubts.voice}
    </button>
  );
}

/** One doubt with its replies (shared by the teacher tool and the student panel). */
export function DoubtThread({ d, children }: { d: Doubt; children?: React.ReactNode }) {
  const { t, lang } = useLang();
  const lms = useLms();
  const who = lms.students.find((s) => s.id === d.studentId)?.name ?? "—";
  return (
    <article aria-label={d.text.slice(0, 40)} className={card}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b>{who}</b>
        <span className="text-on-surface-variant">{d.batch} · {fmtAgo(d.at, lang)}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${d.solved ? "bg-secondary-container" : "bg-tertiary-container"}`}>{d.solved ? t.doubts.solved : t.doubts.open}</span>
      </div>
      <p className="whitespace-pre-wrap">{d.text}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {d.image && <img src={d.image} alt={t.doubts.photo} className="max-h-72 self-start rounded-[10px]" />}
      {d.replies.map((r, i) => (
        <div key={i} className="ml-4 flex flex-col gap-1 rounded-[10px] bg-primary-container/60 px-3 py-2 text-sm">
          <b>{r.by}</b>
          {r.text && <p className="whitespace-pre-wrap">{r.text}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.image && <img src={r.image} alt={t.doubts.photo} className="max-h-72 self-start rounded-[10px]" />}
          {r.audio && <audio controls src={r.audio} className="max-w-full" />}
        </div>
      ))}
      {children}
    </article>
  );
}

export function DoubtsTool({ batchNames, notify }: ToolProps) {
  const { t } = useLang();
  const D = t.doubts;
  const lms = useLms();
  const [showSolved, setShowSolved] = useState(false);
  const list = lms.doubts.filter((d) => batchNames.includes(d.batch) && d.solved === showSolved);
  const me = lms.viewer === "all" ? lms.teacherName : lms.viewer;
  return (
    <div className="flex flex-col gap-4">
      <div data-slide className="flex gap-2">
        {[false, true].map((v) => (
          <button key={String(v)} type="button" aria-pressed={showSolved === v} onClick={() => setShowSolved(v)} className={`rounded-full px-4 py-2 text-sm font-bold ${showSolved === v ? "bg-primary text-on-primary" : "bg-white"}`}>
            {v ? D.solvedList : D.openList(lms.doubts.filter((d) => batchNames.includes(d.batch) && !d.solved).length)}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-on-surface-variant">{D.none}</p>}
      {list.map((d) => (
        <DoubtThread key={d.id} d={d}>
          <Reply onSend={(r, solved) => { lms.replyDoubt(d.id, { ...r, by: me }, solved); notify(D.replied); }} />
        </DoubtThread>
      ))}
    </div>
  );
}

function Reply({ onSend }: { onSend: (r: { text: string; image?: string; audio?: string }, solved: boolean) => void }) {
  const { t } = useLang();
  const D = t.doubts;
  const [text, setText] = useState("");
  const [image, setImage] = useState<string>();
  const [audio, setAudio] = useState<string>();
  const send = (solved: boolean) => {
    onSend({ text: text.trim(), image, audio }, solved);
    setText(""); setImage(undefined); setAudio(undefined);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-outline-variant pt-3">
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={D.replyPh} aria-label={D.replyPh} className="rounded-[10px] border border-outline p-3 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <label className={`cursor-pointer ${soft}`}>{image ? D.photoAdded : D.addPhoto}
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await shrinkImage(f, 1000, 0.75)); }} />
        </label>
        {audio ? <audio controls src={audio} className="h-10" /> : <VoiceNote onDone={setAudio} />}
        <button type="button" disabled={!text.trim() && !image && !audio} onClick={() => send(true)} className={primary}>{D.sendSolved}</button>
        <button type="button" disabled={!text.trim() && !image && !audio} onClick={() => send(false)} className={soft}>{D.send}</button>
      </div>
    </div>
  );
}

/** Student panel: ask a doubt (text + photo), see my doubts and classmates' solved ones. */
export function StudentDoubts({ studentId, batch }: { studentId: number; batch: string }) {
  const { t } = useLang();
  const D = t.doubts;
  const lms = useLms();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string>();
  const mine = lms.doubts.filter((d) => d.studentId === studentId);
  const classmates = lms.doubts.filter((d) => d.batch === batch && d.studentId !== studentId && d.solved);
  return (
    <div className="flex flex-col gap-4">
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          lms.askDoubt(studentId, batch, text.trim(), image);
          setText(""); setImage(undefined);
        }}
      >
        <h2 className="text-lg font-bold">{D.ask}</h2>
        <textarea required rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={D.askPh} aria-label={D.ask} className="rounded-[10px] border border-outline p-3" />
        <div className="flex flex-wrap gap-2">
          <label className={`cursor-pointer ${soft}`}>{image ? D.photoAdded : D.addPhoto}
            <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await shrinkImage(f, 1000, 0.75)); }} />
          </label>
          <button type="submit" className={primary}>{D.askBtn}</button>
        </div>
      </form>
      {mine.map((d) => <DoubtThread key={d.id} d={d} />)}
      {classmates.length > 0 && <h2 className="text-lg font-bold">{D.classmates}</h2>}
      {classmates.map((d) => <DoubtThread key={d.id} d={d} />)}
    </div>
  );
}
