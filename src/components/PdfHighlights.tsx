"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { REAL_AUTH } from "@/lib/auth-mode";
import { loadFile } from "@/lib/file-store";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { findInText, type HighlightType } from "@/lib/pdf-insights";

type Shown = { i: number; page: number; text: string; type: HighlightType; hidden?: boolean };
type Insights =
  | { status: "queued" | "processing" | "failed" }
  | { status: "ready"; source: "ai" | "basic"; highlights: Shown[]; scanned: { n: number; text: string }[]; canEdit: boolean; improving?: boolean };
type State = { kind: "loading" } | { kind: "none" } | { kind: "locked" } | { kind: "data"; d: Insights };

const COLOR: Record<HighlightType, string> = { term: "#ffe066", definition: "#b2f2bb", formula: "#a5d8ff", exam: "#ffc078" };

/**
 * Premium: the teacher's PDF with key terms, definitions, formulas and exam points highlighted.
 * Teachers of a premium institute preview it and can hide wrong highlights; students need premium.
 */
export function PdfHighlights({ url, title }: { url: string; title: string }) {
  const { t } = useLang();
  const P = t.pdfhl;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState<"" | "highlights" | "chat">("");

  useEffect(() => {
    if (!REAL_AUTH || !url.startsWith("/api/files/")) return setState({ kind: "none" });
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const res = await fetch(`/api/pdf-insights?file=${encodeURIComponent(url)}`).catch(() => null);
      if (!alive) return;
      if (!res || res.status === 403 || res.status === 404 || res.status === 401) return setState({ kind: "none" }); // institute not premium
      if (res.status === 402) return setState({ kind: "locked" });
      const d = (await res.json()) as Insights;
      setState({ kind: "data", d });
      if (d.status === "queued" || d.status === "processing" || (d.status === "ready" && d.improving)) timer = setTimeout(load, 5000); // still being prepared, or the AI's highlights still to come
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [url]);

  if (state.kind === "none" || state.kind === "loading") return null;
  if (state.kind === "locked")
    return <p className="self-start rounded-xl bg-tertiary-container px-4 py-3 text-sm font-semibold text-on-tertiary-container">⭐ {P.locked}</p>;
  const d = state.d;
  if (d.status !== "ready")
    return <p role="status" className="self-start rounded-xl bg-surface-container px-4 py-3 text-sm font-semibold">{d.status === "failed" ? P.failed : `⏳ ${P.preparing}`}</p>;
  return (
    <>
      <span className="flex flex-wrap gap-2">
        {/* The teacher's own PDF with the highlights written into it: opens in the browser's PDF viewer (download, print). */}
        <a href={`/api/pdf-insights/pdf?file=${encodeURIComponent(url)}`} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-on-primary">
          ✨ {P.open}
        </a>
        <button type="button" onClick={() => setOpen("chat")} className="inline-flex h-11 items-center gap-2 rounded-full bg-secondary-container px-5 text-sm font-bold text-on-secondary-container">
          🤖 {P.ask}
        </button>
      </span>
      {/* Opened on the page itself: inside the lesson sheet (which slides in) a full-screen window was squeezed into the sheet. */}
      {open && createPortal(<Viewer url={url} title={title} data={d} start={open} onClose={() => setOpen("")} />, document.body)}
    </>
  );
}

type Box = { left: number; top: number; width: number; height: number; color: string; hidden?: boolean; key: string };

function Viewer({ url, title, data, start, onClose }: { url: string; title: string; data: Extract<Insights, { status: "ready" }>; start: "highlights" | "chat"; onClose: () => void }) {
  const { t } = useLang();
  const P = t.pdfhl;
  const [tab, setTab] = useState(start);
  const [list, setList] = useState(data.highlights);
  const [pages, setPages] = useState<{ n: number; img: string; w: number; h: number; boxes: Box[] }[]>([]);
  const [error, setError] = useState("");
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await (await loadFile(url)).arrayBuffer()) }).promise;
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          // Same page text the server read, with each text piece's position, to place the highlights.
          const content = await page.getTextContent();
          let text = "";
          const spans: { a: number; b: number; x: number; y: number; w: number; h: number }[] = [];
          for (const it of content.items) {
            if (!("str" in it)) continue;
            const a = text.length;
            text += it.str + (it.hasEOL ? "\n" : " ");
            const h = it.height || Math.hypot(it.transform[2], it.transform[3]);
            spans.push({ a, b: a + it.str.length, x: it.transform[4], y: it.transform[5], w: it.width, h });
          }
          const boxes: Box[] = [];
          for (const hl of data.highlights.filter((x) => x.page === n)) {
            const at = findInText(text, hl.text);
            if (!at) continue;
            for (const s of spans) {
              const from = Math.max(at[0], s.a);
              const to = Math.min(at[1], s.b);
              if (from >= to || s.b === s.a) continue;
              const x0 = s.x + (s.w * (from - s.a)) / (s.b - s.a);
              const x1 = s.x + (s.w * (to - s.a)) / (s.b - s.a);
              const [l, top] = viewport.convertToViewportPoint(x0, s.y + s.h * 0.9) as number[];
              const [r, bottom] = viewport.convertToViewportPoint(x1, s.y - s.h * 0.2) as number[];
              boxes.push({ left: Math.min(l, r), top: Math.min(top, bottom), width: Math.abs(r - l), height: Math.abs(bottom - top), color: COLOR[hl.type], hidden: hl.hidden, key: `${hl.i}-${s.a}` });
            }
          }
          const img = canvas.toDataURL("image/jpeg", 0.85);
          if (!cancelled) setPages((p) => [...p, { n, img, w: viewport.width, h: viewport.height, boxes }]);
        }
      } catch {
        if (!cancelled) setError(P.failed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const toggle = async (h: Shown) => {
    const res = await fetch("/api/pdf-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: url, index: h.i, hidden: !h.hidden }) });
    if (res.ok) setList((l) => l.map((x) => (x.i === h.i ? { ...x, hidden: !h.hidden } : x)));
  };
  const hiddenNow = new Set(list.filter((h) => h.hidden).map((h) => h.i));

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-surface)" }}>{/* solid: the site's "bg-surface" is see-through glass */}
      <header className="flex flex-col gap-2 border-b border-outline-variant px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label={P.close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-lg font-bold">✕</button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
        </div>
        {/* What each colour means: one scrolling row on phones */}
        <span className="-mx-4 flex gap-2 overflow-x-auto px-4 text-xs font-semibold">
          {(Object.keys(COLOR) as HighlightType[]).map((k) => (
            <span key={k} className="shrink-0 rounded-full px-2.5 py-1 text-[#1c1c1c]" style={{ background: COLOR[k] }}>{P.types[k]}</span>
          ))}
          {data.source === "basic" && <span className="shrink-0 self-center text-on-surface-variant">{P.basic}</span>}
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className={`min-w-0 flex-1 overflow-y-auto bg-surface-container p-4 ${tab === "chat" ? "hidden md:block" : ""}`}>
          {error && <p role="alert" className="text-error">{error}</p>}
          {!pages.length && !error && <p role="status">⏳ {P.loading}</p>}
          {pages.map((p) => {
            const scanned = data.scanned.find((s) => s.n === p.n);
            return (
              <div key={p.n} ref={(el) => void (pageRefs.current[p.n] = el)} className="mx-auto mb-6 max-w-[900px]">
                <div className="relative w-full" style={{ aspectRatio: `${p.w} / ${p.h}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.img} alt={P.page(p.n)} className="absolute inset-0 h-full w-full rounded-lg bg-white shadow" />
                  {p.boxes
                    .filter((b) => !hiddenNow.has(Number(b.key.split("-")[0])))
                    .map((b) => (
                      <span key={b.key} aria-hidden className="absolute rounded-sm mix-blend-multiply" style={{ left: `${(b.left / p.w) * 100}%`, top: `${(b.top / p.h) * 100}%`, width: `${(b.width / p.w) * 100}%`, height: `${(b.height / p.h) * 100}%`, background: b.color, opacity: 0.6 }} />
                    ))}
                </div>
                {scanned && (
                  <div className="mt-2 rounded-[10px] bg-white p-3 text-sm leading-relaxed">
                    <p className="mb-1 text-xs font-bold text-on-surface-variant">{P.readFromImage}</p>
                    <Marked text={scanned.text} marks={list.filter((h) => h.page === p.n && !h.hidden)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <aside className={`w-full shrink-0 flex-col overflow-y-auto border-l border-outline-variant p-4 md:flex md:w-96 ${tab === "chat" ? "flex" : "hidden"}`}>
          <div role="tablist" className="mb-3 flex gap-2">
            {(["highlights", "chat"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === k ? "bg-primary text-on-primary" : "bg-surface-container"}`}>
                {k === "chat" ? `🤖 ${P.ask}` : P.list}
              </button>
            ))}
          </div>
          {tab === "chat" ? (
            <AskAi url={url} />
          ) : (
          <>
          {data.canEdit && <p className="mb-3 text-xs text-on-surface-variant">{P.teacherHint}</p>}
          <ul className="flex flex-col gap-2">
            {list.map((h) => (
              <li key={h.i} className={`rounded-[10px] border border-outline-variant p-2 text-sm ${h.hidden ? "opacity-50 line-through" : ""}`}>
                <button type="button" onClick={() => pageRefs.current[h.page]?.scrollIntoView({ behavior: "smooth" })} className="text-left">
                  <span className="mr-1 rounded px-1.5 text-xs font-bold" style={{ background: COLOR[h.type] }}>{P.types[h.type]}</span>
                  <span className="text-xs text-on-surface-variant">{P.page(h.page)}</span>
                  <span className="mt-1 block">{h.text}</span>
                </button>
                {data.canEdit && (
                  <button type="button" onClick={() => void toggle(h)} className="mt-1 block text-xs font-bold text-primary">{h.hidden ? P.show : P.hide}</button>
                )}
              </li>
            ))}
          </ul>
          </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Text read from a scanned page, with its highlights marked. */
function Marked({ text, marks }: { text: string; marks: Shown[] }) {
  const ranges = marks
    .map((m) => ({ at: findInText(text, m.text), m }))
    .filter((x): x is { at: [number, number]; m: Shown } => !!x.at)
    .sort((a, b) => a.at[0] - b.at[0]);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const { at, m } of ranges) {
    if (at[0] < pos) continue; // overlapping highlight: keep the first
    out.push(text.slice(pos, at[0]), <mark key={m.i} style={{ background: COLOR[m.type] }}>{text.slice(at[0], at[1])}</mark>);
    pos = at[1];
  }
  out.push(text.slice(pos));
  return <p className="whitespace-pre-wrap">{out}</p>;
}

type Msg = { role: "user" | "assistant"; content: string };
/** Ask AI about this PDF: answers from the lesson (premium). */
function AskAi({ url }: { url: string }) {
  const { t } = useLang();
  const P = t.pdfhl;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setQ("");
    setBusy(true);
    setNote("");
    const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: url, messages: next }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setMsgs(msgs); // let them try the same question again
      setQ(question);
      return setNote(res?.status === 429 ? P.limit(new Date(d.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) : res?.status === 409 ? P.preparing : res?.status === 503 && d.error === "paused" ? P.paused : P.error);
    }
    setMsgs([...next, { role: "assistant", content: d.declined ? P.declined : d.answer || P.noAnswer }]);
    if (d.source === "basic") setNote(P.basicChat);
    else if (typeof d.left === "number") setNote(P.left(d.left));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto" aria-live="polite">
        {!msgs.length && <p className="text-sm text-on-surface-variant">{P.askHelp}</p>}
        {msgs.map((m, i) => (
          <p key={i} className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "self-end bg-primary text-on-primary" : "self-start bg-surface-container"}`}>{m.content}</p>
        ))}
        {busy && <p role="status" className="self-start text-sm text-on-surface-variant">⏳ {P.thinking}</p>}
      </div>
      {note && <p className="text-xs text-on-surface-variant">{note}</p>}
      <form onSubmit={send} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} placeholder={P.askPh} aria-label={P.askPh} className="h-11 min-w-0 flex-1 rounded-full border border-outline bg-white px-4 text-sm" />
        <button type="submit" disabled={busy || !q.trim()} className="h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-50">{P.send}</button>
      </form>
    </div>
  );
}
