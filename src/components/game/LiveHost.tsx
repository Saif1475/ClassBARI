"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { GameQuestion, GameView } from "@/lib/live-game";
import { LETTERS, OPTION_TONES, usePoll } from "./usePoll";

/** Teacher's big-screen view: PIN, players, questions with timer, answers chart, leaderboard. */
export function LiveHost({ title, questions, onClose }: { title: string; questions: GameQuestion[]; onClose: () => void }) {
  const { t } = useLang();
  const G = t.game;
  const [game, setGame] = useState<{ pin: string; hostKey: string } | null>(null);
  const [error, setError] = useState("");
  const { data: v } = usePoll<GameView>(game ? `/api/live?pin=${game.pin}&host=${game.hostKey}` : null, 800);

  useEffect(() => {
    fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", title, questions }) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setGame)
      .catch(() => setError(G.errors.other));
    // Create once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = (action: "start" | "reveal" | "next" | "end") =>
    game && fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, pin: game.pin, hostKey: game.hostKey }) });
  const btn = "h-14 rounded-full bg-primary px-8 text-lg font-bold text-on-primary disabled:opacity-50";

  return (
    <div role="dialog" aria-modal="true" aria-label={G.title} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface p-6" style={{ backgroundColor: "var(--color-surface)" }}>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">{title}</span>
        <button type="button" onClick={() => { act("end"); onClose(); }} className="inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 font-semibold">
          <Icon name="close" size={18} /> {G.close}
        </button>
      </div>
      {error && <p role="alert" className="mt-6 text-error">{error}</p>}

      {v?.phase === "lobby" && game && (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 text-center">
          <span className="text-xl text-on-surface-variant">{G.joinAt(`${window.location.host}/play`)}</span>
          <span className="text-xl font-semibold">{G.pin}</span>
          <span data-testid="game-pin" className="rounded-2xl bg-white px-10 py-4 text-7xl font-extrabold tracking-widest">{game.pin}</span>
          <span className="text-lg">{v.players ? G.playersN(v.players) : G.waiting}</span>
          <div className="flex flex-wrap justify-center gap-2">
            {v.names?.map((n) => <span key={n} className="rounded-full bg-primary-container px-4 py-2 font-bold text-on-primary-container">{n}</span>)}
          </div>
          <button type="button" disabled={!v.players} onClick={() => act("start")} className={btn}>{G.start}</button>
        </div>
      )}

      {(v?.phase === "question" || v?.phase === "reveal") && v.question && (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6">
          <div className="flex items-center justify-between text-lg font-semibold text-on-surface-variant">
            <span>{G.question(v.index + 1, v.total)}</span>
            {v.phase === "question" ? <span className="text-4xl font-extrabold text-primary">{Math.ceil(v.timeLeftMs / 1000)}</span> : null}
          </div>
          <h2 className="rounded-2xl bg-white p-6 text-center text-3xl font-bold">{v.question.q}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {v.question.options.map((o, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl p-5 text-xl font-bold ${OPTION_TONES[i]} ${v.phase === "reveal" && i !== v.correct ? "opacity-35" : ""}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25">{LETTERS[i]}</span>
                <span className="flex-1">{o}</span>
                {v.phase === "reveal" && <span className="rounded-full bg-white/30 px-3 py-1 text-base">{v.counts?.[i] ?? 0}</span>}
                {v.phase === "reveal" && i === v.correct && <Icon name="check" size={26} strokeWidth={3} />}
              </div>
            ))}
          </div>
          {v.phase === "question" ? (
            <div className="flex items-center justify-between">
              <span className="text-lg">{G.answered(v.answered ?? 0, v.players)}</span>
              <button type="button" onClick={() => act("reveal")} className={btn}>{G.reveal}</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <ol className="flex flex-col gap-1 text-lg">
                {v.top?.map((p, i) => <li key={p.name}><b>{i + 1}.</b> {p.name} · {p.score}</li>)}
              </ol>
              <button type="button" onClick={() => act("next")} className={btn}>{v.index + 1 >= v.total ? G.results : G.next}</button>
            </div>
          )}
        </div>
      )}

      {v?.phase === "end" && (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 text-center">
          <h2 className="text-4xl font-extrabold">{G.podium}</h2>
          <ol className="flex w-full flex-col gap-2">
            {v.top?.map((p, i) => (
              <li key={p.name} className={`flex justify-between rounded-xl px-6 py-4 text-xl font-bold ${i === 0 ? "bg-tertiary-container" : "bg-white"}`}>
                <span>{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {p.name}</span>
                <span>{p.score}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={onClose} className={btn}>{G.close}</button>
        </div>
      )}
    </div>
  );
}
