"use client";

import { useEffect, useState } from "react";
import { usePoll } from "@/components/game/usePoll";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { pollView } from "@/lib/live-poll";

type View = ReturnType<typeof pollView>;
const VOTER_KEY = "classbari-poll-voter"; // one random id per device: one vote per device per poll

export function useVoterId() {
  const [id, setId] = useState("");
  useEffect(() => {
    let v = localStorage.getItem(VOTER_KEY);
    if (!v) localStorage.setItem(VOTER_KEY, (v = crypto.randomUUID()));
    setId(v);
  }, []);
  return id;
}

const post = (body: Record<string, unknown>) => fetch("/api/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Student home: the teacher's live poll for my batch, from any device. */
export function LivePollBanner({ batch }: { batch: string }) {
  const { t } = useLang();
  const P = t.poll;
  const voter = useVoterId();
  const { data } = usePoll<{ poll: View | null }>(voter && batch ? `/api/poll?batch=${encodeURIComponent(batch)}&voter=${voter}` : null, 2500);
  const [sent, setSent] = useState<number | null>(null);
  const poll = data?.poll;
  if (!poll) return null;
  const mine = poll.mine ?? (sent !== null ? sent : null);
  const voted = mine !== null;

  return (
    <section aria-label={P.badge} className="flex flex-col gap-3 rounded-[18px] border-2 border-primary bg-white p-5 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-error-container px-3 py-1 text-xs font-extrabold text-on-error-container">● {P.badge}</span>
        <span className="text-xs font-semibold text-on-surface-variant">{P.responses(poll.total)}</span>
      </div>
      <p className="text-base font-bold">{poll.question}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {poll.options.map((opt, i) => {
          const pct = poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0;
          const tone = voted && poll.correct === i ? "border-primary bg-primary-container" : voted && mine === i ? "border-error bg-error-container" : "border-outline-variant bg-surface-container/50";
          return (
            <button
              key={i}
              type="button"
              disabled={voted}
              onClick={async () => {
                setSent(i);
                const r = await post({ action: "vote", batch, pollId: poll.id, voter, option: i });
                if (!r.ok && r.status !== 409) setSent(null);
              }}
              className={`relative overflow-hidden rounded-xl border px-4 py-2.5 text-left text-sm font-semibold ${tone}`}
            >
              {voted && <span className="pointer-events-none absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />}
              <span className="relative flex items-center justify-between gap-2">
                <span><b className="mr-1.5">{String.fromCharCode(65 + i)}.</b>{opt}</span>
                {voted && <span className="text-xs font-extrabold">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Teacher: launch a 1-question poll to a batch and watch the answers come in. */
export function PollLauncher({ batchNames, notify }: { batchNames: string[]; notify: (msg: string) => void }) {
  const { t } = useLang();
  const P = t.poll;
  const [batch, setBatch] = useState(batchNames[0] ?? "");
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [error, setError] = useState("");
  const { data } = usePoll<{ poll: View | null }>(batch ? `/api/poll?batch=${encodeURIComponent(batch)}` : null, 2000);
  const poll = data?.poll;

  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = opts.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
    const right = filled.findIndex((x) => x.i === correct);
    if (right < 0) return setError(P.pickCorrect);
    const r = await post({ action: "start", batch, question: q, options: filled.map((x) => x.o), correct: right });
    if (!r.ok) return setError(P.failed);
    setError("");
    setQ("");
    setOpts(["", "", "", ""]);
    notify(P.launched);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={launch} className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
        <h2 className="text-lg font-bold">{P.launchTitle}</h2>
        <p className="text-sm text-on-surface-variant">{P.launchSub}</p>
        <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label={t.roster.batch} className="h-11 rounded-xl border border-outline bg-white px-4 text-sm">
          {batchNames.map((b) => <option key={b}>{b}</option>)}
        </select>
        <input required value={q} onChange={(e) => setQ(e.target.value)} placeholder={P.questionPh} aria-label={P.question} className="h-11 rounded-xl border border-outline bg-white px-4 text-sm" />
        <div className="grid gap-2 sm:grid-cols-2">
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correctPoll" checked={correct === i} onChange={() => setCorrect(i)} aria-label={P.markCorrect(String.fromCharCode(65 + i))} className="h-5 w-5 accent-primary" />
              <input required={i < 2} value={o} onChange={(e) => setOpts((prev) => prev.map((v, k) => (k === i ? e.target.value : v)))} placeholder={P.option(String.fromCharCode(65 + i))} aria-label={P.option(String.fromCharCode(65 + i))} className="h-10 flex-1 rounded-[10px] border border-outline bg-white px-3 text-sm" />
            </div>
          ))}
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-error">{error}</p>}
        <button type="submit" className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">{P.launch}</button>
      </form>

      <section aria-label={P.resultsTitle} className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{P.resultsTitle}</h2>
          {poll && (
            <button type="button" onClick={async () => { await post({ action: "end", batch }); notify(P.ended); }} className="rounded-full bg-error-container px-3 py-1 text-sm font-bold text-on-error-container">
              {P.end}
            </button>
          )}
        </div>
        {!poll ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">{P.none}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="font-bold">{poll.question}</p>
            <span className="text-sm text-on-surface-variant">{P.responses(poll.total)}</span>
            {poll.options.map((opt, i) => {
              const pct = poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0;
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>{String.fromCharCode(65 + i)}. {opt} {i === poll.correct && "✓"}</span>
                    <span>{poll.counts[i]} ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
