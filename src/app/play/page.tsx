"use client";

import { FeatureOff } from "@/components/Platform";
import { useEffect, useRef, useState } from "react";
import { Logo, LangSwitch } from "@/components/Brand";
import { LETTERS, OPTION_TINTS, usePoll } from "@/components/game/usePoll";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { GameView } from "@/lib/live-game";
import { useLms } from "@/lib/lms-store";
import { getRole } from "@/lib/role";
import { XP } from "@/lib/xp";

const KEY = "edunest-live-player"; // survive a page reload mid-game

/** Student's phone: join with PIN + name, tap answers, see result after each question. No login needed. */
function Play() {
  const { t } = useLang();
  const G = t.game;
  const lms = useLms();
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [player, setPlayer] = useState<{ pin: string; id: string } | null>(null);
  const [error, setError] = useState("");
  const rewarded = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      if (saved?.pin && saved?.id) setPlayer(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const { data: v, status } = usePoll<GameView>(player ? `/api/live?pin=${player.pin}&player=${player.id}` : null, 800);

  // Logged-in students earn XP for finishing a game (once).
  useEffect(() => {
    if (v?.phase === "end" && !rewarded.current && lms.ready && getRole() === "student") {
      rewarded.current = true;
      lms.earnXp(lms.meId, XP.liveGame);
    }
  }, [v?.phase, lms]);

  const post = (body: object) => fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await post({ action: "join", pin: pin.trim(), name });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(G.errors[body.error as keyof typeof G.errors] ?? G.errors.other);
    const p = { pin: pin.trim(), id: body.playerId as string };
    sessionStorage.setItem(KEY, JSON.stringify(p));
    setPlayer(p);
  };
  const leave = () => {
    sessionStorage.removeItem(KEY);
    setPlayer(null);
    setPin("");
    rewarded.current = false;
  };

  const box = "h-14 rounded-xl border border-outline bg-white px-4 text-center text-xl font-bold";

  return (
    <div className="flex min-h-dvh flex-col bg-surface px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Logo />
        <LangSwitch compact />
      </div>

      {(!player || status === 404) && (
        <form onSubmit={join} className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-4">
          <h1 className="text-center text-3xl font-bold">{G.join}</h1>
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface-variant">
            {G.pin}
            <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={`${box} tracking-[0.3em]`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface-variant">
            {G.name}
            <input required maxLength={20} value={name} onChange={(e) => setName(e.target.value)} className={box} />
          </label>
          {(error || status === 404) && <p role="alert" className="text-center font-semibold text-error">{error || G.errors["not found"]}</p>}
          <button type="submit" className="h-14 rounded-full bg-primary text-lg font-bold text-on-primary">{G.joinBtn}</button>
        </form>
      )}

      {player && v && status !== 404 && (
        <div className="mx-auto mt-6 flex w-full max-w-md flex-1 flex-col gap-5">
          {v.me && <p className="text-center text-sm text-on-surface-variant">{G.playingAs(v.me.name)} · {v.me.score}</p>}

          {v.phase === "lobby" && <p role="status" className="glass-card mt-16 rounded-2xl p-8 text-center text-2xl font-bold">{G.getReady}</p>}

          {v.phase === "question" && v.question && (
            v.me?.answered ? (
              <p role="status" className="glass-card mt-16 rounded-2xl p-8 text-center text-2xl font-bold">{G.answeredWait}</p>
            ) : (
              <>
                <div className="flex justify-between text-sm font-semibold text-on-surface-variant">
                  <span>{G.question(v.index + 1, v.total)}</span>
                  <span>{Math.ceil(v.timeLeftMs / 1000)}</span>
                </div>
                <h2 className="glass-card rounded-2xl px-5 py-4 text-center text-xl font-bold">{v.question.q}</h2>
                <div className="grid flex-1 grid-cols-2 gap-3 pb-3">
                  {v.question.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => post({ action: "answer", pin: player.pin, playerId: player.id, choice: i })}
                      style={{ "--tone": OPTION_TINTS[i] } as React.CSSProperties}
                      className="answer-key flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-lg font-semibold"
                    >
                      <span className="letter flex h-9 w-9 items-center justify-center rounded-full text-base font-bold">{LETTERS[i]}</span>
                      <span>{o}</span>
                    </button>
                  ))}
                </div>
              </>
            )
          )}

          {v.phase === "reveal" && v.me && (
            <div
              role="status"
              style={{ "--tone": v.me.wasCorrect ? OPTION_TINTS[0] : OPTION_TINTS[3] } as React.CSSProperties}
              className="answer-key mt-10 flex flex-col items-center gap-3 rounded-2xl p-8 text-center"
            >
              <span className="text-3xl font-bold">{v.me.choice === null ? G.noAnswer : v.me.wasCorrect ? G.correct : G.wrong}</span>
              {v.me.wasCorrect && <span className="text-xl font-semibold">{G.gained(v.me.gained ?? 0)}</span>}
              <span className="text-lg">{G.rank(v.me.rank)}</span>
            </div>
          )}

          {v.phase === "end" && (
            <div className="mt-6 flex flex-col items-center gap-4 text-center">
              <h2 className="text-3xl font-extrabold">{G.podium}</h2>
              {v.me && <span role="status" className="text-2xl font-bold">{G.rank(v.me.rank)} · {v.me.score}</span>}
              <ol className="flex w-full flex-col gap-2">
                {v.top?.map((p, i) => (
                  <li key={p.name} className="glass-card flex justify-between rounded-xl px-5 py-3 font-semibold">
                    <span>{i + 1}. {p.name}</span>
                    <span>{p.score}</span>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={leave} className="h-12 rounded-full border border-outline-variant px-6 font-bold">{G.playAgain}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <FeatureOff flag="liveGame"><Play /></FeatureOff>;
}
