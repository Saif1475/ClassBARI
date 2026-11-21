"use client";

import { useEffect, useRef, useState } from "react";
import { usePoll } from "@/components/game/usePoll";
import { LivePollBanner, PollLauncher, useVoterId } from "@/components/LivePollBanner";
import { notifyBatch } from "@/components/PushToggle";
import { saveFile } from "@/lib/file-store";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { dayKey } from "@/lib/dates";
import { REACTIONS, type viewOf } from "@/lib/live-class";
import { useLms } from "@/lib/lms-store";

type View = ReturnType<typeof viewOf> & { live: true };
const post = (body: Record<string, unknown>) => fetch("/api/class", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const card = "flex flex-col gap-3 rounded-[16px] border border-outline-variant bg-white p-4";
const pill = "rounded-full px-4 py-2 text-sm font-bold";

/** Live class state for a batch (polls the server every 2 s; the board picture only when it changed). */
function useLiveClass(batch: string, voter: string) {
  const [boardAt, setBoardAt] = useState(0);
  const [board, setBoard] = useState<string>();
  const { data } = usePoll<{ live: false } | View>(batch && voter ? `/api/class?batch=${encodeURIComponent(batch)}&voter=${voter}&board=${boardAt}` : null, 2000);
  const v = data?.live ? data : null;
  useEffect(() => {
    if (v?.board) {
      setBoard(v.board);
      setBoardAt(v.boardAt);
    } else if ((!v || v.boardAt === 0) && board) {
      setBoard(undefined);
      setBoardAt(0);
    }
  }, [v?.boardAt, !!v]);
  return { v, board };
}

const clock = (from: number) => {
  const s = Math.max(0, Math.floor((Date.now() - from) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The video. With our own Jitsi server (NEXT_PUBLIC_JITSI_DOMAIN) it's built into the page; otherwise the public
 * meet.jit.si room opens in its own tab (it can't be embedded). Each batch has its own secret room name.
 */
function VideoRoom({ room, batch, topic, userName, teacher }: { room: string; batch: string; topic: string; userName: string; teacher: boolean }) {
  const { t } = useLang();
  const L = t.liveRoom;
  const own = process.env.NEXT_PUBLIC_JITSI_DOMAIN;
  const cfg = (audioOnly: boolean) =>
    `#userInfo.displayName=${encodeURIComponent(JSON.stringify(userName))}&config.subject=${encodeURIComponent(JSON.stringify(`${batch} · ${topic}`))}${audioOnly ? "&config.startAudioOnly=true&config.startWithVideoMuted=true" : ""}`;
  const url = (audioOnly: boolean) => `https://${own ?? "meet.jit.si"}/${room}${cfg(audioOnly)}`;
  return own ? (
    <iframe title={L.room} src={url(false)} allow="camera; microphone; fullscreen; display-capture; autoplay" className="aspect-video w-full rounded-xl border border-outline-variant bg-black" />
  ) : (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-container/60 p-4">
      <p className="text-sm">{teacher ? L.teacherHow : L.studentHow}</p>
      <div className="flex flex-wrap gap-2">
        <a href={url(false)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-bold text-on-primary">📹 {L.join}</a>
        <a href={url(true)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-full bg-secondary-container px-6 font-bold text-on-secondary-container">🎧 {L.audioOnly}</a>
      </div>
      <p className="text-xs text-on-surface-variant">{L.privacy}</p>
    </div>
  );
}

/** Teacher's lecture recorder: camera or screen + mic, recorded in the browser, saved straight into a lesson. */
function Studio({ batch, notify }: { batch: string; notify: (m: string) => void }) {
  const { t } = useLang();
  const L = t.liveRoom;
  const lms = useLms();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [on, setOn] = useState<"camera" | "screen" | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [rec, setRec] = useState<{ url: string; blob: Blob } | null>(null);
  const [err, setErr] = useState("");
  const modules = lms.modules.filter((m) => m.batch === batch);
  const [moduleId, setModuleId] = useState(modules[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  };
  const stop = () => {
    stopRecording();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(null);
  };
  useEffect(() => () => stop(), []);
  useEffect(() => () => void (rec && URL.revokeObjectURL(rec.url)), [rec]);

  const start = async (kind: "camera" | "screen") => {
    setErr("");
    try {
      stop();
      const s = kind === "camera" ? await navigator.mediaDevices.getUserMedia({ video: true, audio: true }) : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setMicMuted(false);
      setOn(kind);
      s.getVideoTracks()[0]?.addEventListener("ended", stop);
    } catch {
      setErr(kind === "camera" ? L.noCamera : L.noScreen);
    }
  };
  const toggleRecord = () => {
    if (recording) return stopRecording();
    if (!streamRef.current) return setErr(L.startFirst);
    chunksRef.current = [];
    const r = new MediaRecorder(streamRef.current);
    r.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRec({ url: URL.createObjectURL(blob), blob });
    };
    r.start(1000);
    recorderRef.current = r;
    setRecording(true);
  };
  const btn = "h-10 rounded-full px-4 text-sm font-bold";

  return (
    <section className={card}>
      <h3 className="font-bold">{L.studio}</h3>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        {!on && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/80">
            <span className="text-base font-bold">{L.studioTitle}</span>
            <span className="text-sm">{L.studioHelp}</span>
          </div>
        )}
        {recording && <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold text-white">● REC</span>}
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => start("camera")} className={`${btn} bg-primary text-on-primary`}>{on === "camera" ? L.restartCamera : L.camera}</button>
        <button type="button" onClick={() => start("screen")} className={`${btn} bg-secondary-container text-on-secondary-container`}>{on === "screen" ? L.switchScreen : L.screen}</button>
        {on && (
          <>
            <button type="button" onClick={() => { const a = streamRef.current?.getAudioTracks()[0]; if (a) { a.enabled = !a.enabled; setMicMuted(!a.enabled); } }} className={`${btn} bg-surface-container`}>{micMuted ? L.unmute : L.mute}</button>
            <button type="button" onClick={toggleRecord} className={`${btn} ${recording ? "bg-error text-white" : "bg-tertiary-container text-on-tertiary-container"}`}>{recording ? `■ ${L.stopRec}` : `● ${L.record}`}</button>
            <button type="button" onClick={stop} className={`${btn} bg-error-container text-on-error-container`}>{L.stop}</button>
          </>
        )}
      </div>
      {rec && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl bg-surface-container/60 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const url = await saveFile(new File([rec.blob], `${title || "lecture"}.webm`, { type: "video/webm" }));
              lms.addModuleItem(moduleId, { kind: "video", title: title.trim() || L.recordingTitle, meta: L.recordedLive, url });
              notify(L.savedToLesson);
              setRec(null);
              setTitle("");
            } catch {
              setErr(L.saveFailed);
            }
            setSaving(false);
          }}
        >
          <video src={rec.url} controls className="h-28 rounded-[10px] bg-black" />
          <label className="flex flex-col gap-1 text-sm font-semibold">{L.recTitle}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L.recordingTitle} className="h-10 rounded-[10px] border border-outline bg-transparent px-3" /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">{L.recLesson}
            <select value={moduleId} onChange={(e) => setModuleId(Number(e.target.value))} className="h-10 rounded-[10px] border border-outline bg-transparent px-3">
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving || !moduleId} className={`${btn} bg-primary text-on-primary disabled:opacity-50`}>{saving ? L.saving : L.saveToLesson}</button>
          <a href={rec.url} download={`classbari-lecture-${Date.now()}.webm`} className={`${btn} inline-flex items-center bg-white text-primary`}>⬇ {L.download}</a>
        </form>
      )}
    </section>
  );
}

function Chat({ v, batch, voter, name, teacher }: { v: View; batch: string; voter: string; name: string; teacher: boolean }) {
  const { t } = useLang();
  const L = t.liveRoom;
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = box.current;
    if (b) b.scrollTop = b.scrollHeight; // newest message in view, without scrolling the page
  }, [v.chat.length]);
  return (
    <section className={card} aria-label={L.chat}>
      <h3 className="font-bold">{L.chat}</h3>
      <div ref={box} className="flex max-h-72 min-h-24 flex-col gap-1.5 overflow-y-auto">
        {v.chat.length === 0 && <p className="text-sm text-on-surface-variant">{L.noChat}</p>}
        {v.chat.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 rounded-[10px] px-3 py-1.5 text-sm ${m.teacher ? "bg-primary-container" : m.mine ? "bg-secondary-container" : "bg-surface-container/60"}`}>
            <span className="flex-1"><b>{m.name}{m.teacher && ` · ${L.teacherTag}`}</b> {m.text}</span>
            {teacher && <button type="button" onClick={() => post({ action: "deleteChat", batch, id: m.id })} aria-label={L.deleteMsg} className="text-xs font-bold text-error">✕</button>}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await post({ action: "chat", batch, voter, name, text });
          if (r.status === 429) return setErr(L.tooFast);
          setErr("");
          if (r.ok) setText("");
        }}
      >
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder={L.chatPh} aria-label={L.chatPh} className="h-10 flex-1 rounded-full border border-outline bg-transparent px-4 text-sm" />
        <button type="submit" disabled={!text.trim()} className={`${pill} bg-primary text-on-primary disabled:opacity-50`}>{L.send}</button>
      </form>
      {err && <p role="alert" className="text-xs font-semibold text-error">{err}</p>}
    </section>
  );
}

function Questions({ v, batch, voter, name, teacher }: { v: View; batch: string; voter: string; name: string; teacher: boolean }) {
  const { t } = useLang();
  const L = t.liveRoom;
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  return (
    <section className={card} aria-label={L.qa}>
      <h3 className="font-bold">{L.qa}</h3>
      {!teacher && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await post({ action: "ask", batch, voter, name, text });
            setErr(r.status === 429 ? L.tooManyQ : "");
            if (r.ok) setText("");
          }}
        >
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder={L.askPh} aria-label={L.askPh} className="h-10 flex-1 rounded-full border border-outline bg-transparent px-4 text-sm" />
          <button type="submit" disabled={!text.trim()} className={`${pill} bg-primary text-on-primary disabled:opacity-50`}>{L.ask}</button>
        </form>
      )}
      {err && <p role="alert" className="text-xs font-semibold text-error">{err}</p>}
      {v.questions.length === 0 && <p className="text-sm text-on-surface-variant">{L.noQuestions}</p>}
      {v.questions.map((q) => (
        <div key={q.id} className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm ${q.answered ? "opacity-55" : "bg-surface-container/60"}`}>
          <button type="button" disabled={teacher} aria-pressed={q.myVote} aria-label={L.upvote(q.text)} onClick={() => post({ action: "vote", batch, voter, id: q.id })} className={`flex min-w-11 flex-col items-center rounded-lg px-2 py-1 font-bold ${q.myVote ? "bg-primary text-on-primary" : "bg-white"}`}>
            ▲<span className="text-xs">{q.votes}</span>
          </button>
          <span className="flex-1"><b>{q.name}:</b> {q.text}</span>
          {teacher && <button type="button" onClick={() => post({ action: "answered", batch, id: q.id })} className={`${pill} bg-white text-primary`}>{q.answered ? L.reopen : `✓ ${L.answered}`}</button>}
          {!teacher && q.answered && <span className="text-xs font-bold text-primary">✓ {L.answered}</span>}
        </div>
      ))}
    </section>
  );
}

function Reactions({ v }: { v: View }) {
  return (
    <div aria-hidden className="pointer-events-none fixed bottom-24 right-6 z-40 flex flex-col-reverse items-center gap-1">
      {v.reactions.slice(-12).map((r, i) => (
        <span key={`${r.at}-${i}`} className="reaction-float text-3xl">{r.emoji}</span>
      ))}
    </div>
  );
}

function Board({ board, at }: { board?: string; at: number }) {
  const { t } = useLang();
  const L = t.liveRoom;
  if (!board) return null;
  return (
    <section className={card} aria-label={L.board}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold">📝 {L.board}</h3>
        <span className="text-xs text-on-surface-variant">{L.updated(Math.max(0, Math.round((Date.now() - at) / 1000)))}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={board} alt={L.board} className="w-full rounded-[10px] border border-outline-variant bg-white" />
    </section>
  );
}

/** Teacher: start/end the class, see who joined (and save attendance), hands, Q&A, chat, polls, recorder. */
export function LiveControlRoom({ batch, topic: defaultTopic, teacherName, notify }: { batch: string; topic: string; teacherName: string; notify: (m: string) => void }) {
  const { t } = useLang();
  const L = t.liveRoom;
  const lms = useLms();
  const voter = useVoterId();
  const { v, board } = useLiveClass(batch, voter);
  const [topic, setTopic] = useState(defaultTopic);
  const room = lms.liveRooms[batch];
  useEffect(() => {
    if (!room) lms.ensureLiveRoom(batch); // this batch's secret room, shared with students when the class starts
  }, [room, batch]);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const roster = lms.students.filter((s) => s.batch === batch);
  const joinedIds = new Set(v?.joined?.map((j) => j.studentId).filter((x): x is number => x !== undefined));

  if (!v)
    return (
      <div className="flex flex-col gap-4">
        <form
          className={card}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await post({ action: "start", batch, topic, teacher: teacherName, room });
            if (!r.ok) return notify(L.startFailed);
            notifyBatch(batch, L.startedPush, topic, "/student");
            notify(L.started);
          }}
        >
          <h3 className="text-lg font-bold">{L.startTitle}</h3>
          <label className="flex flex-col gap-1 text-sm font-semibold">{L.topic}<input required value={topic} onChange={(e) => setTopic(e.target.value)} className="h-11 rounded-[10px] border border-outline bg-transparent px-3" /></label>
          <button type="submit" className="h-12 self-start rounded-full bg-error px-6 font-bold text-white">● {L.goLive}</button>
          <p className="text-xs text-on-surface-variant">{L.startHelp}</p>
        </form>
        <Studio batch={batch} notify={notify} />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] bg-error-container px-5 py-3 text-on-error-container">
        <span className="live-dot h-3 w-3 rounded-full bg-error" />
        <b className="flex-1">{L.liveNow(v.topic)} · {clock(v.startedAt)}</b>
        <span className="text-sm font-semibold">{L.inClass(v.joinedCount, roster.length)}</span>
        <button type="button" onClick={async () => { if (!window.confirm(L.endQ)) return; await post({ action: "end", batch }); notify(L.ended); }} className={`${pill} bg-error text-white`}>{L.end}</button>
      </div>
      <VideoRoom room={v.room} batch={batch} topic={v.topic} userName={teacherName} teacher />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-label={L.attendance}>
          <h3 className="font-bold">{L.attendance} · {joinedIds.size}/{roster.length}</h3>
          <div className="flex flex-wrap gap-1.5">
            {roster.map((s) => (
              <span key={s.id} className={`rounded-full px-3 py-1 text-xs font-bold ${joinedIds.has(s.id) ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface-variant"}`}>
                {joinedIds.has(s.id) ? "✓ " : ""}{s.name}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              lms.markAllAbsent(roster.map((s) => s.id), dayKey());
              joinedIds.forEach((id) => lms.markPresent(id, dayKey()));
              notify(L.attendanceSaved(joinedIds.size, roster.length));
            }}
            className={`${pill} self-start bg-primary text-on-primary`}
          >
            {L.saveAttendance}
          </button>
        </section>
        <section className={card} aria-label={L.hands}>
          <h3 className="font-bold">✋ {L.hands} ({v.hands?.length ?? 0})</h3>
          {!v.hands?.length && <p className="text-sm text-on-surface-variant">{L.noHands}</p>}
          {v.hands?.map((h, i) => (
            <div key={h.voter} className="flex items-center gap-3 rounded-[10px] bg-surface-container/60 px-3 py-2 text-sm">
              <b className="w-6">{i + 1}.</b>
              <span className="flex-1">{h.name}</span>
              <button type="button" onClick={() => post({ action: "lowerHand", batch, voter: h.voter })} className={`${pill} bg-white text-primary`}>{L.lower}</button>
            </div>
          ))}
        </section>
        <Questions v={v} batch={batch} voter={voter} name={teacherName} teacher />
        <Chat v={v} batch={batch} voter={voter} name={teacherName} teacher />
      </div>
      <Board board={board} at={v.boardAt} />
      {!board && <p className="text-sm text-on-surface-variant">{L.boardHint}</p>}
      <PollLauncher batchNames={[batch]} notify={notify} />
      <Studio batch={batch} notify={notify} />
      <Reactions v={v} />
    </div>
  );
}

/** Student: join the video (or audio only), see the teacher's board, raise a hand, react, ask, chat. */
export function LiveClassStudent({ batch, studentId, name, nextClass }: { batch: string; studentId: number; name: string; nextClass?: string }) {
  const { t } = useLang();
  const L = t.liveRoom;
  const voter = useVoterId();
  const { v, board } = useLiveClass(batch, voter);
  const joined = useRef(false);
  useEffect(() => {
    // Opening the live class counts as attending (one record per device)
    if (v && voter && !joined.current) {
      joined.current = true;
      post({ action: "join", batch, voter, name, studentId });
    }
  }, [!!v, voter]);

  if (!v)
    return (
      <section className={card}>
        <h3 className="text-lg font-bold">{L.notLive}</h3>
        {nextClass && <p className="text-on-surface-variant">{nextClass}</p>}
      </section>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] bg-error-container px-5 py-3 text-on-error-container">
        <span className="live-dot h-3 w-3 rounded-full bg-error" />
        <b className="flex-1">{L.liveNow(v.topic)} · {v.teacher}</b>
      </div>
      <VideoRoom room={v.room} batch={batch} topic={v.topic} userName={name} teacher={false} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={v.myHand} onClick={() => post({ action: "hand", batch, voter, name, up: !v.myHand })} className={`${pill} ${v.myHand ? "bg-tertiary-container text-on-tertiary-container" : "bg-white"}`}>
          ✋ {v.myHand ? L.handUp : L.raiseHand}
        </button>
        {REACTIONS.map((e) => (
          <button key={e} type="button" aria-label={L.react(e)} onClick={() => post({ action: "react", batch, voter, emoji: e })} className="h-10 w-10 rounded-full bg-white text-xl">
            {e}
          </button>
        ))}
      </div>
      <LivePollBanner batch={batch} />
      <Board board={board} at={v.boardAt} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Questions v={v} batch={batch} voter={voter} name={name} teacher={false} />
        <Chat v={v} batch={batch} voter={voter} name={name} teacher={false} />
      </div>
      <Reactions v={v} />
    </div>
  );
}

/** Whiteboard → students: send a picture of the board while the class is live (used by the whiteboard tool). */
export const shareBoard = (batch: string, img: string) => post({ action: "board", batch, img });
