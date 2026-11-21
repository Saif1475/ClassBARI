"use client";

import { useEffect, useState } from "react";
import {
  AI_MODELS,
  AI_PLANS,
  canUseModel,
  readAiSub,
  readPdfSummaryCache,
  writeAiSub,
  writePdfSummaryCache,
  type AiModelId,
  type AiSubState,
  type AiTier,
  type PdfAiSummary,
} from "@/lib/ai-plans";
import { taka } from "@/lib/mock-data";

type QaMsg = { id: number; role: "student" | "ai"; text: string; model?: string };

export function AiStudyHub({
  pdfs,
}: {
  pdfs: { id: number; title: string; meta: string }[];
}) {
  const [sub, setSub] = useState<AiSubState>({ tier: "free", day: "", inputUsed: 0, outputUsed: 0 });
  const [showPlans, setShowPlans] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState(pdfs[0]?.title ?? "Formula sheet — Chapter 4");
  const [summary, setSummary] = useState<PdfAiSummary | null>(null);
  const [loadingSum, setLoadingSum] = useState(false);

  const [model, setModel] = useState<AiModelId>("gemini-flash-lite");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<QaMsg[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setSub(readAiSub());
  }, []);

  useEffect(() => {
    const cached = readPdfSummaryCache(selectedPdf);
    setSummary(cached);
  }, [selectedPdf]);

  const activePlan = AI_PLANS.find((p) => p.id === sub.tier);
  const isSubscribed = sub.tier !== "free";

  const activateTier = (tier: AiTier) => {
    const next: AiSubState = { ...sub, tier };
    setSub(next);
    writeAiSub(next);
    setShowPlans(false);
    setError("");
  };

  const generateSummary = async () => {
    if (!isSubscribed) {
      setShowPlans(true);
      return;
    }
    const cached = readPdfSummaryCache(selectedPdf);
    if (cached) {
      setSummary(cached);
      return;
    }
    setLoadingSum(true);
    setError("");
    try {
      const res = await fetch("/api/ai/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "summarize", title: selectedPdf, text: selectedPdf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const entry: PdfAiSummary = {
        summary: data.summary,
        keywords: data.keywords ?? [],
        formulas: data.formulas ?? [],
        cachedAt: new Date().toLocaleTimeString(),
      };
      writePdfSummaryCache(selectedPdf, entry);
      setSummary(entry);
    } catch {
      setError("Could not generate summary right now.");
    } finally {
      setLoadingSum(false);
    }
  };

  const askTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    if (!isSubscribed) {
      setShowPlans(true);
      return;
    }
    if (!canUseModel(sub.tier, model)) {
      setError("Upgrade your plan to use this AI model.");
      setShowPlans(true);
      return;
    }
    if (activePlan && (sub.inputUsed >= activePlan.dailyIn || sub.outputUsed >= activePlan.dailyOut)) {
      setError("Daily token limit reached. Upgrade your plan or wait until midnight reset.");
      return;
    }

    setError("");
    setAsking(true);
    setMessages((prev) => [...prev, { id: Date.now(), role: "student", text: q }]);
    setQuestion("");

    try {
      const res = await fetch("/api/ai/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          title: selectedPdf,
          text: summary ? `${summary.summary} Keywords: ${summary.keywords.join(", ")}` : selectedPdf,
          question: q,
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      const nextSub: AiSubState = {
        ...sub,
        inputUsed: sub.inputUsed + (data.inputTokens || 250),
        outputUsed: sub.outputUsed + (data.outputTokens || 120),
      };
      setSub(nextSub);
      writeAiSub(nextSub);

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "ai", text: data.answer, model: data.modelUsed },
      ]);
    } catch {
      setError("AI tutor could not respond. Try again.");
    } finally {
      setAsking(false);
    }
  };

  const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-outline-variant bg-white p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-container px-3 py-0.5 text-xs font-extrabold text-on-primary-container">
              AI Study Pro
            </span>
            <span className="text-xs font-bold text-on-surface-variant">
              {activePlan ? `${activePlan.name} (${taka(activePlan.price)}/mo)` : "Free Tier (Locked)"}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold">AI PDF Summary & Multi-Model Tutor</h2>
          <p className="text-xs text-on-surface-variant">
            Instant cached summaries, key formulas & Q&A using Gemini, ChatGPT, and Claude.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPlans((v) => !v)}
          className="h-10 rounded-full bg-primary px-5 text-xs font-bold text-on-primary shadow-xs"
        >
          {isSubscribed ? "Change AI Plan" : "Unlock AI Subscription"}
        </button>
      </div>

      {/* 3-Tier Subscription Picker */}
      {(showPlans || !isSubscribed) && (
        <div className="grid gap-3 md:grid-cols-3">
          {AI_PLANS.map((p) => {
            const current = sub.tier === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-2 rounded-[16px] border p-4 ${
                  p.highlight ? "border-primary bg-primary-container/40" : "border-outline-variant bg-surface-container/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold">{p.name}</span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold text-primary">
                    {taka(p.price)}/mo
                  </span>
                </div>
                <p className="text-xs font-semibold text-on-surface">{p.modelsLabel}</p>
                <p className="text-[11px] text-on-surface-variant">
                  Daily: <strong>{fmtK(p.dailyIn)} in / {fmtK(p.dailyOut)} out</strong> tokens
                </p>
                {p.premiumMonthly && (
                  <p className="text-[11px] font-semibold text-primary">{p.premiumMonthly}</p>
                )}
                <button
                  type="button"
                  onClick={() => activateTier(p.id)}
                  className={`mt-auto h-9 rounded-full text-xs font-bold ${
                    current ? "bg-secondary-container text-on-secondary-container" : "bg-primary text-on-primary"
                  }`}
                >
                  {current ? "✓ Active Plan" : `Activate ${p.name} (Demo)`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Subscriber Workspace */}
      {isSubscribed && activePlan && (
        <div className="flex flex-col gap-4">
          {/* Daily Token Quota Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container/60 px-4 py-2.5 text-xs">
            <span className="font-bold text-on-surface-variant">
              Today&apos;s Token Usage: <strong className="text-on-surface">{fmtK(sub.inputUsed)} / {fmtK(activePlan.dailyIn)} in</strong> ·{" "}
              <strong className="text-on-surface">{fmtK(sub.outputUsed)} / {fmtK(activePlan.dailyOut)} out</strong>
            </span>
            <span className="rounded-full bg-secondary-container px-2.5 py-0.5 font-bold text-on-secondary-container">
              PDF Summaries: Cached (0 tokens)
            </span>
          </div>

          {/* PDF Selector + Summary Generator */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Choose teacher PDF"
              value={selectedPdf}
              onChange={(e) => setSelectedPdf(e.target.value)}
              className="h-10 min-w-56 flex-1 rounded-full border border-outline-variant bg-white px-4 text-sm font-semibold outline-none"
            >
              {(pdfs.length ? pdfs : [{ id: 1, title: "Formula sheet — Chapter 4", meta: "PDF" }]).map((p) => (
                <option key={p.id} value={p.title}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={loadingSum}
              onClick={generateSummary}
              className="h-10 rounded-full bg-secondary-container px-5 text-xs font-bold text-on-secondary-container"
            >
              {loadingSum ? "Summarizing…" : summary ? "✓ Cached Summary Loaded" : "Generate AI Summary & Keywords"}
            </button>
          </div>

          {/* Cached Summary & Keywords Display */}
          {summary && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-outline-variant bg-surface-container/35 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-primary">AI Summary — {selectedPdf}</span>
                <span className="text-[11px] text-on-surface-variant">Cached · {summary.cachedAt}</span>
              </div>
              <p className="leading-relaxed text-on-surface">{summary.summary}</p>
              <div className="flex flex-wrap gap-1.5">
                {summary.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-bold text-on-primary-container">
                    #{k}
                  </span>
                ))}
              </div>
              {summary.formulas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {summary.formulas.map((f) => (
                    <span key={f} className="rounded-lg bg-white px-2.5 py-1 font-mono text-xs font-bold text-on-surface">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Multi-Model AI Q&A Tutor */}
          <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">Ask AI Tutor about this PDF</span>
              <select
                aria-label="Choose AI model"
                value={model}
                onChange={(e) => setModel(e.target.value as AiModelId)}
                className="h-9 rounded-full border border-outline-variant bg-white px-3 text-xs font-bold outline-none"
              >
                {AI_MODELS.map((m) => {
                  const unlocked = canUseModel(sub.tier, m.id);
                  return (
                    <option key={m.id} value={m.id}>
                      {unlocked ? "" : "🔒 "}
                      {m.name} ({m.badge})
                    </option>
                  );
                })}
              </select>
            </div>

            {messages.length > 0 && (
              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      m.role === "student"
                        ? "ml-auto bg-primary text-on-primary"
                        : "mr-auto border border-outline-variant bg-white text-on-surface"
                    }`}
                  >
                    {m.model && <div className="mb-0.5 text-[10px] font-extrabold text-primary">{m.model}</div>}
                    {m.text}
                  </div>
                ))}
              </div>
            )}

            {error && <p className="text-xs font-semibold text-error">{error}</p>}

            <form onSubmit={askTutor} className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask any question from this PDF (English or Bangla)…"
                className="h-11 flex-1 rounded-full border border-outline-variant bg-white px-4 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={asking}
                className="h-11 rounded-full bg-primary px-5 text-xs font-bold text-on-primary disabled:opacity-50"
              >
                {asking ? "Thinking…" : "Ask AI"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
