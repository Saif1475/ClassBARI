"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { FILE_TEXT_MAX, modelMenu, PACKS, TRAILER } from "@/lib/ai-chat";
import { topicOf, TOPICS, type Topic } from "@/lib/chat-topics";
import { SAMPLE_STUDENT, sampleChats } from "@/lib/sample-chats";
import { REAL_AUTH } from "@/lib/auth-mode";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { shrinkImage } from "@/lib/image";
import { taka } from "@/lib/mock-data";

type Msg = { role: "user" | "assistant"; content: string; photo?: boolean };
type Doc = { name: string; text: string };
const TOPIC_ICON: Record<Topic, string> = { physics: "⚛️", chemistry: "🧪", math: "📐", biology: "🧬", ict: "💻", english: "🔤", bangla: "অ", business: "📊", plans: "🗓️", other: "💬" };
/** "Add file" choices: each opens the file picker for just that kind. */
const FILE_KINDS = [
  { id: "image", icon: "🖼️", tone: "bg-primary-container", accept: "image/png,image/jpeg,image/webp,image/heic,image/*" },
  { id: "pdf", icon: "📕", tone: "bg-error-container", accept: ".pdf,application/pdf" },
  { id: "word", icon: "📘", tone: "bg-secondary-container", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { id: "sheet", icon: "📗", tone: "bg-primary-container", accept: ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" },
  { id: "text", icon: "📄", tone: "bg-tertiary-container", accept: ".txt,.md,.json,.html,.xml,.py,.js,.ts,.c,.cpp,.java,text/*" },
] as const;
type Chat = { id: number; title: string; msgs: Msg[]; file?: Doc; topic?: Topic; at?: number }; // file: its text goes with every question; topic: its folder; at: last used
type Model = { id: string; label: string; pack: number; locked: boolean; soon: boolean };
const KEEP = 50; // chats kept on the device (the most recently used)

/** The model's light formatting: fenced code, headings, lists and **bold**; everything else as written. */
function Rich({ text }: { text: string }) {
  const bold = (line: string) => line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
    part.startsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith("`") && part.length > 2 ? <code key={i} className="rounded bg-surface-container px-1 text-[0.9em]">{part.slice(1, -1)}</code> : part,
  );
  return (
    <>
      {text.split(/```\w*\n?/).map((block, i) =>
        i % 2 ? (
          <pre key={i} dir="ltr" className="my-2 overflow-x-auto rounded-[10px] bg-deep p-3 text-[13px] text-white"><code>{block.trimEnd()}</code></pre>
        ) : (
          block.split("\n").map((line, k) => {
            const h = line.match(/^#{1,4}\s+(.*)/);
            const li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
            if (h) return <p key={`${i}-${k}`} className="mt-2 font-bold">{bold(h[1])}</p>;
            if (li) return <p key={`${i}-${k}`} className="pl-5 -indent-5">{/^\d/.test(li[1]) ? li[1] : "•"} {bold(li[2])}</p>;
            return line.trim() ? <p key={`${i}-${k}`}>{bold(line)}</p> : <span key={`${i}-${k}`} className="block h-2" />;
          })
        ),
      )}
    </>
  );
}

/** The AI chat section (student AI packs): chats kept on this device, answers streamed from /api/ai/assistant. */
export function AiChat({ meId, name, premium, email }: { meId: number; name: string; premium: boolean; email?: string }) {
  const { t } = useLang();
  const A = t.aichat;
  const storeKey = `edunest-ai-chats-${meId}`;
  // Chat settings, kept on this device: the model picked last, and how the student wants answers (language, length).
  const modelKey = `edunest-ai-model-${meId}`;
  const prefsKey = `edunest-ai-prefs-${meId}`;
  const [prefs, setPrefs] = useState<{ lang: "auto" | "bn" | "en"; length: "normal" | "short" | "long" }>({ lang: "auto", length: "normal" });
  const [usage, setUsage] = useState<{ left: number; resetsAt: string } | null>(null); // this 12-hour allowance
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(prefsKey) ?? "{}") as Partial<typeof prefs>;
      setPrefs({ lang: p.lang === "bn" || p.lang === "en" ? p.lang : "auto", length: p.length === "short" || p.length === "long" ? p.length : "normal" });
    } catch {
      /* unreadable: the defaults */
    }
  }, [prefsKey]);
  const choose = (next: typeof prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(prefsKey, JSON.stringify(next));
    } catch {
      /* storage full: the choice lasts for this visit */
    }
  };
  const pickModel = (id: string) => {
    setModel(id);
    try {
      localStorage.setItem(modelKey, id);
    } catch {
      /* this visit only */
    }
  };
  const [chats, setChats] = useState<Chat[]>([]);
  const [openId, setOpenId] = useState(0); // 0: a new chat not started yet
  const [showList, setShowList] = useState(false); // phones: the chat list is behind a button
  const [q, setQ] = useState("");
  const [photo, setPhoto] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null); // the file attached to the open chat
  const [reading, setReading] = useState(false);
  const [find, setFind] = useState(""); // search in the side panel
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(-1);
  // Every model: the ones a bigger pack unlocks are shown locked. Without the server (demo), the smallest pack's view.
  const [models, setModels] = useState<Model[]>(() => modelMenu(150).map((m) => ({ ...m, soon: false })));
  const [model, setModel] = useState("");
  const [menu, setMenu] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);
  const [addMenu, setAddMenu] = useState(false); // "Add file": the list of file kinds
  const addBox = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!menuBox.current?.contains(e.target as Node)) setMenu(false);
      if (!addBox.current?.contains(e.target as Node)) setAddMenu(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  const stopper = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const chosen = models.find((m) => m.id === model && !m.locked && !m.soon) ?? models.find((m) => !m.locked && !m.soon);
  const chat = chats.find((c) => c.id === openId);
  const msgs = chat?.msgs ?? [];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      // Example chats for the demo site and the test student, until they have chats of their own.
      setChats(saved ? (JSON.parse(saved) as Chat[]) : !REAL_AUTH || email === SAMPLE_STUDENT ? sampleChats() : []);
    } catch {
      /* ignore corrupt storage */
    }
  }, [storeKey]);
  useEffect(() => {
    if (!REAL_AUTH || !premium) return;
    void fetch("/api/ai/assistant")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { models: Model[]; pick: string | null; left?: number; resetsAt?: string } | null) => {
        if (!d?.models) return;
        setModels(d.models);
        let mine: string | null = null; // the model picked last time, if this pack still has it
        try {
          mine = localStorage.getItem(modelKey);
        } catch {
          /* no storage */
        }
        setModel(mine && d.models.some((m) => m.id === mine && !m.locked && !m.soon) ? mine : (d.pick ?? ""));
        if (typeof d.left === "number" && d.resetsAt) setUsage({ left: d.left, resetsAt: d.resetsAt });
      })
      .catch(() => {});
  }, [premium]);
  const save = (next: Chat[], keepNow = true) => {
    setChats(next);
    if (!keepNow) return; // shown on screen only; written to the device a moment later
    try {
      localStorage.setItem(storeKey, JSON.stringify(next.slice(0, KEEP)));
    } catch {
      /* storage full: the chat stays on screen */
    }
  };
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // in braces: newer browsers return a promise here, which React would take for a cleanup
  }, [msgs.length, msgs[msgs.length - 1]?.content.length]);

  const open = (id: number) => (setOpenId(id), setDoc(chats.find((c) => c.id === id)?.file ?? null), setPhoto(""), setShowList(false), setNote(""));
  const ask = async (question: string, before: Msg[], image: string, id: number, fresh = false) => {
    const asked: Msg[] = [...before, { role: "user", content: question, ...(image ? { photo: true } : {}) }];
    // Its folder: picked from the first question (and file name); a chat still in "Other" moves once a later question shows its topic.
    const old = chats.find((c) => c.id === id);
    const topic = old?.topic && old.topic !== "other" ? old.topic : topicOf(`${question} ${doc?.name ?? ""}`);
    const now: Chat = { ...(old ?? { id, title: question.slice(0, 60) }), msgs: asked, file: doc ?? undefined, topic, at: Date.now() };
    let list = [now, ...chats.filter((c) => c.id !== id)]; // most recently used first
    // While an answer streams in, the screen follows every piece, but the chats are written to the device at most
    // once a second (writing all of them for each word made long answers stutter).
    let kept = 0;
    const put = (m: Msg[], streaming = false) => {
      const keepNow = !streaming || Date.now() - kept > 1000;
      if (keepNow) kept = Date.now();
      save((list = list.map((c) => (c.id === id ? { ...c, msgs: m } : c))), keepNow);
    };
    // Nothing came back: take the question out again (and a chat that never started out of the list).
    const undo = () => (before.length ? put(before) : (save((list = list.filter((c) => c.id !== id))), setOpenId(0)), setQ(question));
    save(list);
    setOpenId(id);
    setQ("");
    setPhoto("");
    setNote("");
    setBusy(true);
    stopper.current = new AbortController();
    let answer = "";
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: asked.map(({ role, content }) => ({ role, content })), ...(image ? { image } : {}), ...(doc ? { file: doc } : {}), ...(chosen ? { model: chosen.id } : {}), ...(fresh ? { fresh: true } : {}), ...(prefs.lang !== "auto" || prefs.length !== "normal" ? { prefs: { ...(prefs.lang !== "auto" ? { lang: prefs.lang } : {}), ...(prefs.length !== "normal" ? { length: prefs.length } : {}) } } : {}) }),
        signal: stopper.current.signal,
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: string; resetsAt?: string };
        setNote(res.status === 429 && d.resetsAt ? A.limit(new Date(d.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) : d.error === "paused" ? A.paused : res.status === 404 || d.error === "soon" ? A.soon : A.error);
        undo();
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        put([...asked, { role: "assistant", content: answer.split(TRAILER)[0] }], true);
      }
      const [text, tail] = answer.split(TRAILER);
      const info = (tail ? JSON.parse(tail) : { error: true }) as { left?: number; declined?: boolean; cut?: boolean; error?: boolean };
      put([...asked, { role: "assistant", content: info.declined ? A.declined : (text.trim() || A.error) + (info.cut ? `\n\n${A.cut}` : "") }]);
      setNote(info.error ? A.error : typeof info.left === "number" ? A.left(info.left) : "");
      if (typeof info.left === "number") setUsage((u) => (u ? { ...u, left: info.left! } : u));
    } catch {
      // Stopped by the student, or the connection dropped: keep what arrived.
      if (answer) put([...asked, { role: "assistant", content: answer.split(TRAILER)[0] }]);
      else {
        undo();
        if (!stopper.current?.signal.aborted) setNote(A.error);
      }
    } finally {
      setBusy(false);
    }
  };
  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim() && !busy) void ask(q.trim(), msgs, photo, openId || Date.now());
  };
  const retry = () => {
    const last = msgs.findLast((m) => m.role === "user");
    if (last && !busy) void ask(last.content, msgs.slice(0, msgs.lastIndexOf(last)), "", openId, true); // "try again" always asks the AI afresh
  };
  const copy = (text: string, i: number) => void navigator.clipboard?.writeText(text).then(() => (setCopied(i), setTimeout(() => setCopied(-1), 1500)));
  /** A photo goes as a picture; a PDF, Word, Excel or text file is read here in the browser and its text goes with the chat. */
  const pick = async (file?: File) => {
    if (!file) return;
    setNote("");
    if (file.type.startsWith("image/")) return setPhoto(await shrinkImage(file, 1280, 0.8).catch(() => ""));
    setReading(true);
    try {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      let text = "";
      if (ext === "pdf" || file.type === "application/pdf") text = (await (await import("@/lib/read-document")).readDocument(file, () => {})).text;
      else if (ext === "docx") text = await (await import("@/lib/sheet")).readDocxText(await file.arrayBuffer());
      else if (ext === "xlsx") text = (await (await import("@/lib/sheet")).readXlsx(await file.arrayBuffer())).map((r) => r.join("\t")).join("\n");
      else if (["txt", "md", "csv", "json", "html", "xml", "py", "js", "ts", "c", "cpp", "java"].includes(ext) || file.type.startsWith("text/")) text = await file.text();
      else return setNote(A.fileType);
      text = text.replace(/\u0000/g, "").trim();
      if (!text) return setNote(A.fileEmpty);
      setDoc({ name: file.name.slice(0, 120), text: text.slice(0, FILE_TEXT_MAX) });
      if (text.length > FILE_TEXT_MAX) setNote(A.fileCut);
    } catch {
      setNote(A.fileFailed);
    } finally {
      setReading(false);
    }
  };

  if (REAL_AUTH && !premium)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-8">
        <h1 className="text-3xl font-bold">{A.lockedTitle}</h1>
        <p className="text-on-surface-variant">{A.lockedBody}</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {PACKS.map((p) => (
            <li key={p} className="flex flex-col gap-1 rounded-[16px] border border-outline-variant bg-white p-4">
              <span className="text-2xl font-extrabold">{taka(p)}<span className="text-sm font-semibold text-on-surface-variant">{A.perMonth}</span></span>
              <span className="text-sm text-on-surface-variant">{A.packNote[p]}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  // Folders by topic, the one used most recently first; a search shows only matching chats (title or anything said in them).
  const needle = find.trim().toLowerCase();
  const shown = needle ? chats.filter((c) => c.title.toLowerCase().includes(needle) || c.msgs.some((m) => m.content.toLowerCase().includes(needle)) || !!c.file?.name.toLowerCase().includes(needle)) : chats;
  const byTopic = new Map<Topic, Chat[]>(); // one pass: each chat goes into its folder
  for (const c of shown) {
    const tp = c.topic ?? topicOf(c.title);
    const list = byTopic.get(tp);
    if (list) list.push(c);
    else byTopic.set(tp, [c]);
  }
  const folders = TOPICS.flatMap((tp) => (byTopic.has(tp) ? [{ tp, list: byTopic.get(tp)! }] : []))
    .sort((a, b) => (b.list[0].at ?? b.list[0].id) - (a.list[0].at ?? a.list[0].id));
  const row = (c: Chat) => (
        <div key={c.id} className={`flex items-center gap-1 rounded-[10px] ${c.id === openId ? "bg-surface-container" : ""}`}>
          <button type="button" onClick={() => open(c.id)} className="min-h-11 min-w-0 flex-1 truncate px-3 text-left text-sm font-semibold">{c.title}</button>
          <button type="button" aria-label={A.deleteChat} title={A.deleteChat} onClick={() => window.confirm(A.confirmDelete) && (save(chats.filter((x) => x.id !== c.id)), c.id === openId && open(0))} className="flex h-11 w-11 shrink-0 items-center justify-center text-on-surface-variant">✕</button>
        </div>
  );
  const list = (
    <nav aria-label={A.chats} className="flex flex-col gap-1">
      <button type="button" onClick={() => open(0)} className="mb-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-on-primary">
        <Icon name="plus" size={18} /> {A.newChat}
      </button>
      {chats.length > 0 && (
        <label className="mb-2 flex h-10 items-center gap-2 rounded-[10px] border border-outline-variant bg-white px-3 focus-within:border-primary">
          <span aria-hidden className="text-on-surface-variant"><Icon name="search" size={16} /></span>
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={A.searchChats} aria-label={A.searchChats} className="h-full min-w-0 flex-1 bg-transparent text-sm !outline-none" />
        </label>
      )}
      {!chats.length && <p className="px-2 text-sm text-on-surface-variant">{A.noChats}</p>}
      {chats.length > 0 && !shown.length && <p className="px-2 text-sm text-on-surface-variant">{A.noMatch}</p>}
      {folders.map(({ tp, list: inFolder }) => (
        <details key={tp + (needle ? ":found" : "")} open className="group">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-2 text-sm font-bold hover:bg-surface-container">
            <span aria-hidden className="transition-transform group-open:rotate-90"><Icon name="chevronRight" size={16} /></span>
            <span aria-hidden>{TOPIC_ICON[tp]}</span>
            <span className="min-w-0 flex-1 truncate">{A.topics[tp]}</span>
            <span className="rounded-full bg-surface-container px-2 text-xs font-bold text-on-surface-variant">{inFolder.length}</span>
          </summary>
          <div className="ml-3 flex flex-col gap-0.5 border-l border-outline-variant pl-2">{inFolder.map(row)}</div>
        </details>
      ))}
      {chats.length > 0 && <p className="mt-2 px-2 text-xs text-on-surface-variant">{A.saved}</p>}
      {/* Chat settings: how the AI answers, what is left of the allowance, and clearing the chats on this device. */}
      <details className="group mt-2 rounded-[12px] border border-outline-variant bg-white">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-bold">
          <span aria-hidden className="transition-transform group-open:rotate-90"><Icon name="chevronRight" size={16} /></span>
          <span className="min-w-0 flex-1">{A.settings}</span>
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          {usage && (
            <p className="text-xs text-on-surface-variant">
              <span className="font-bold text-on-surface">{A.usage}:</span> {A.usageLeft(usage.left, new Date(usage.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}
            </p>
          )}
          {([
            [A.answerLang, "lang", [["auto", A.langAuto], ["bn", A.langBn], ["en", A.langEn]]],
            [A.answerLength, "length", [["normal", A.lenNormal], ["short", A.lenShort], ["long", A.lenLong]]],
          ] as const).map(([label, key, options]) => (
            <div key={key} role="group" aria-label={label} className="flex flex-col gap-1">
              <span className="text-xs font-bold text-on-surface-variant">{label}</span>
              <div className="flex flex-wrap gap-1">
                {options.map(([value, text]) => (
                  <button key={value} type="button" aria-pressed={prefs[key] === value} onClick={() => choose({ ...prefs, [key]: value })} className={`min-h-9 rounded-[10px] px-3 text-xs font-bold ${prefs[key] === value ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface"}`}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {chats.length > 0 && (
            <button type="button" onClick={() => window.confirm(A.confirmDeleteAll) && (save([]), open(0))} className="min-h-10 self-start rounded-[10px] bg-error-container px-3 text-xs font-bold text-on-error-container">
              {A.deleteAll} ({chats.length})
            </button>
          )}
        </div>
      </details>
    </nav>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-outline-variant p-3 md:block">{list}</aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 pt-3 md:hidden">
          <button type="button" onClick={() => setShowList((v) => !v)} aria-expanded={showList} className="h-11 rounded-full border border-outline-variant px-4 text-sm font-bold">{A.chats}</button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{chat?.title ?? A.title}</span>
        </header>
        {showList && <div className="border-b border-outline-variant p-3 md:hidden">{list}</div>}

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-8" aria-live="polite">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
            {!msgs.length && (
              <div className="my-auto flex flex-col gap-4 py-6">
                <h1 className="text-2xl font-bold md:text-3xl">✨ {A.hello(name.split(" ")[0])}</h1>
                <div className="grid gap-2 sm:grid-cols-2">
                  {A.ideas.map((idea) => (
                    <button key={idea} type="button" onClick={() => setQ(idea)} className="min-h-11 rounded-xl border border-outline-variant bg-white px-4 py-3 text-left text-sm">{idea}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-[22px_22px_6px_22px] bg-primary px-4 py-2.5 text-on-primary">
                  {m.photo && <span className="block text-xs opacity-85">{A.photo}</span>}
                  {m.content}
                </div>
              ) : (
                <div key={i} className="flex min-w-0 max-w-[92%] flex-col gap-1 self-start">
                  <div className="min-w-0 break-words rounded-[6px_18px_18px_18px] border border-outline-variant bg-white px-4 py-3 leading-relaxed shadow-sm">
                    <Rich text={m.content} />
                  </div>
                  {!(busy && i === msgs.length - 1) && (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => copy(m.content, i)} className="min-h-9 rounded-full px-3 text-xs font-bold text-primary hover:bg-surface-container">{copied === i ? A.copied : A.copy}</button>
                      {i === msgs.length - 1 && <button type="button" onClick={retry} className="min-h-9 rounded-full px-3 text-xs font-bold text-primary hover:bg-surface-container">{A.retry}</button>}
                    </span>
                  )}
                </div>
              ),
            )}
            {busy && msgs[msgs.length - 1]?.role === "user" && <p role="status" className="text-sm text-on-surface-variant">⏳ {A.thinking}</p>}
            <div ref={end} />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 pb-24 md:px-8 md:pb-4">
          {note && <p role="status" className="text-xs text-on-surface-variant">{note}</p>}
          <form onSubmit={send} className="flex flex-col gap-2 rounded-[16px] border border-outline bg-white p-2 focus-within:border-primary">
            {photo && (
              <span className="flex items-center gap-2 px-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" className="h-14 w-14 rounded-[10px] object-cover" />
                <button type="button" onClick={() => setPhoto("")} className="min-h-9 text-xs font-bold text-error">{A.removePhoto}</button>
              </span>
            )}
            {(doc || reading) && (
              <span className="flex items-center gap-2 px-2 text-sm">
                <span className="min-w-0 truncate rounded-[10px] bg-surface-container px-3 py-2 font-semibold">📄 {reading ? A.fileReading : doc!.name}</span>
                {doc && <button type="button" onClick={() => setDoc(null)} className="min-h-9 shrink-0 text-xs font-bold text-error">{A.removeFile}</button>}
              </span>
            )}
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), send())}
              rows={1}
              maxLength={1000}
              placeholder={A.placeholder}
              aria-label={A.placeholder}
              className="max-h-40 w-full resize-none bg-transparent px-3 py-2 !outline-none [field-sizing:content]" // the box around it shows the focus
            />
            <span className="relative flex items-center justify-between gap-2">
              <div ref={addBox} className="shrink-0">
                <button type="button" aria-haspopup="menu" aria-expanded={addMenu} onClick={() => setAddMenu((v) => !v)} className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-primary hover:bg-surface-container">
                  📎 <span className="hidden sm:inline">{A.attach}</span>
                  <span className="sr-only sm:hidden">{A.attach}</span>
                </button>
                {addMenu && (
                  <ul role="menu" aria-label={A.attach} className="picker-drop absolute bottom-full left-0 z-30 mb-2 flex w-64 max-w-[calc(100vw-3rem)] flex-col gap-1 rounded-[14px] border border-outline-variant p-2 shadow-[0_18px_50px_rgba(0,32,28,0.22)]">
                    {FILE_KINDS.map((k) => (
                      <li key={k.id} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAddMenu(false);
                            const input = fileInput.current;
                            if (!input) return;
                            input.accept = k.accept; // the phone's or computer's file picker then shows only this kind
                            input.click();
                          }}
                          className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-sm hover:bg-surface-container"
                        >
                          <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg ${k.tone}`}>{k.icon}</span>
                          <span className="flex min-w-0 flex-col">
                            <span className="font-bold">{A.fileKinds[k.id].label}</span>
                            <span className="text-xs text-on-surface-variant">{A.fileKinds[k.id].hint}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input ref={fileInput} type="file" tabIndex={-1} aria-hidden className="sr-only" onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ""))} />
              </div>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
              <div ref={menuBox} className="min-w-0">
                <button type="button" aria-haspopup="listbox" aria-expanded={menu} aria-label={A.model} onClick={() => setMenu((v) => !v)} className="flex h-11 w-full min-w-0 items-center justify-end gap-1.5 rounded-full px-3 text-sm font-bold text-on-surface-variant hover:bg-surface-container">
                  <span className="truncate">{chosen?.label ?? A.model}</span>
                  <span className={`shrink-0 transition-transform duration-200 ${menu ? "rotate-180" : ""}`}><Icon name="chevronDown" size={16} /></span>
                </button>
                {menu && (
                  <ul role="listbox" aria-label={A.model} className="picker-drop absolute bottom-full right-0 z-30 mb-2 flex max-h-80 w-72 max-w-[calc(100vw-3rem)] flex-col gap-1 overflow-y-auto rounded-[14px] border border-outline-variant p-2 shadow-[0_18px_50px_rgba(0,32,28,0.22)]">
                    {models.map((m) => {
                      const off = m.locked || m.soon;
                      return (
                        <li key={m.id} role="option" aria-selected={m.id === chosen?.id} aria-disabled={off}>
                          <button type="button" disabled={off} onClick={() => (pickModel(m.id), setMenu(false))} className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${m.id === chosen?.id ? "bg-surface-container" : ""} ${off ? "cursor-not-allowed" : "hover:bg-surface-container"}`}>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className={`font-bold ${off ? "text-on-surface-variant" : ""}`}>{m.label}</span>
                              <span className="text-xs text-on-surface-variant">{m.locked ? A.unlockWith(taka(m.pack)) : m.soon ? A.modelSoon : A.inPack(taka(m.pack))}</span>
                            </span>
                            <span aria-hidden className="shrink-0 text-base">{m.locked ? "🔒" : m.id === chosen?.id ? "✓" : ""}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {busy ? (
                <button type="button" onClick={() => stopper.current?.abort()} className="h-11 rounded-full bg-deep px-5 text-sm font-bold text-white">■ {A.stop}</button>
              ) : (
                <button type="submit" disabled={!q.trim() || reading} className="h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-bold text-on-primary disabled:opacity-50">{A.send}</button>
              )}
              </span>
            </span>
          </form>
          <p className="text-center text-[11px] text-on-surface-variant">{A.disclaimer}</p>
        </div>
      </section>
    </div>
  );
}
