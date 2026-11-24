"use client";

// One chat (guardian ↔ teacher, student ↔ teacher), WhatsApp-style: bubbles with time and ticks, day dividers,
// replies, photos, reactions, edit, delete for everyone, search, and chat settings (wallpaper, Enter is send, read receipts).
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { canDelete, canEdit, dayOf, preview, REACTIONS, seen, sideOf, TEXT_MAX, type Side } from "@/lib/chat";
import { fmtDate, fmtTime } from "@/lib/dates";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { shrinkImage } from "@/lib/image";
import { useLms } from "@/lib/lms-store";
import type { ChatExtra } from "@/lib/lms-actions";
import type { ChatMessage, ChatThread } from "@/lib/mock-data";

const WALLS = { plain: "#f4f4f2", mint: "#e3f1e7", sky: "#e3eef8", sand: "#f5ecdc", night: "#1e2a2f" } as const;
type Wall = keyof typeof WALLS;
type Prefs = { wall: Wall; enter: boolean; receipts: boolean };
const KEY = "classbari-chat";
const DEFAULTS: Prefs = { wall: "plain", enter: true, receipts: true };

/** This device's chat settings (the same three as in the apps). */
export function useChatPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
      setPrefs({ wall: p.wall && p.wall in WALLS ? p.wall : "plain", enter: p.enter !== false, receipts: p.receipts !== false });
    } catch {
      /* private window: the defaults */
    }
  }, []);
  const change = (p: Partial<Prefs>) =>
    setPrefs((old) => {
      const next = { ...old, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* not kept: fine */
      }
      return next;
    });
  return [prefs, change] as const;
}

const OPENED = "classbari-chat-opened";
/** The newest teacher message this device has opened, per chat: the family side's unread badge, private (never sent, so it works with read receipts off). */
export function chatOpened(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OPENED) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function ChatRoom({ thread, side, title, subtitle, placeholder, empty, onSend, dock = "sticky bottom-18 md:static" }: {
  thread: ChatThread | undefined;
  side: Side;
  title: string;
  subtitle?: string;
  placeholder: string;
  empty: string;
  onSend: (text: string, extra?: ChatExtra) => void;
  dock?: string; // where the writing box sits on a phone (above the page's bottom bar)
}) {
  const { t, lang } = useLang();
  const C = t.chat;
  const lms = useLms();
  const [prefs, setPrefs] = useChatPrefs();
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [query, setQuery] = useState<string | null>(null); // null: the search box is closed
  const [showSettings, setShowSettings] = useState(false);
  const [note, setNote] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const needle = query?.trim().toLowerCase() ?? "";
  const shown = needle ? messages.filter((m) => !m.deleted && m.text.toLowerCase().includes(needle)) : messages;
  const dark = prefs.wall === "night";

  // Opened, or a new message came in while open: read (the teacher's count goes to 0; with read receipts, blue ticks).
  const lastOther = [...messages].reverse().find((m) => sideOf(m) !== side)?.at ?? "";
  useEffect(() => {
    if (!thread) return;
    const readAt = side === "staff" ? thread.readStaff : thread.readFamily;
    const needsCount = side === "staff" && thread.unread > 0;
    const needsTick = prefs.receipts && !!lastOther && (!readAt || readAt < lastOther);
    if (needsCount || needsTick) lms.markChatRead(thread.id, side, prefs.receipts, lastOther || undefined);
    if (side === "family" && lastOther)
      try {
        localStorage.setItem(OPENED, JSON.stringify({ ...chatOpened(), [thread.id]: lastOther }));
      } catch {
        /* not kept: the badge counts from readFamily only */
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the chat or its newest message changes
  }, [thread?.id, lastOther, prefs.receipts]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, thread?.id]);

  const send = () => {
    const text = draft.trim();
    if (editing) {
      if (text && text !== editing.text && thread) lms.editChatMessage(thread.id, editing.id, text.slice(0, TEXT_MAX));
      setEditing(null);
    } else {
      if (!text && !photo) return;
      onSend(text.slice(0, TEXT_MAX), replyTo || photo ? { ...(replyTo ? { reply: replyTo.id } : {}), ...(photo ? { photo } : {}) } : undefined);
    }
    setDraft("");
    setPhoto("");
    setReplyTo(null);
  };
  const startEdit = (m: ChatMessage) => (setEditing(m), setReplyTo(null), setPhoto(""), setDraft(m.text), setMenu(null), box.current?.focus());
  const copy = async (m: ChatMessage) => {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(m.text);
      setNote(C.copied);
      setTimeout(() => setNote(""), 2000);
    } catch {
      /* no clipboard (insecure page): nothing */
    }
  };
  const mark = (text: string) => {
    if (!needle) return text;
    const i = text.toLowerCase().indexOf(needle);
    return i < 0 ? text : <>{text.slice(0, i)}<mark className="rounded bg-tertiary-container px-0.5">{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
  };
  const dayLabel = (iso: string) => {
    const k = dayOf(iso);
    if (k === dayOf(new Date().toISOString())) return C.today;
    if (k === dayOf(new Date(Date.now() - 86_400_000).toISOString())) return C.yesterday;
    return fmtDate(iso, lang);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-white/70 bg-white/50 px-4 py-3 backdrop-blur-xl md:px-6">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary">{title.charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{title}</div>
          {subtitle && <div className="truncate text-xs text-on-surface-variant">{subtitle}</div>}
        </div>
        <button type="button" aria-label={C.search} aria-pressed={query !== null} onClick={() => setQuery(query === null ? "" : null)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="search" size={20} />
        </button>
        <button type="button" aria-label={C.settings} aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="more" size={20} />
        </button>
      </header>

      {query !== null && (
        <div className="flex items-center gap-2 border-b border-outline-variant bg-white px-4 py-2">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={C.search} aria-label={C.search} className="h-10 flex-1 rounded-full border border-outline-variant px-4 text-sm outline-none focus:border-primary" />
          <button type="button" aria-label={C.close} onClick={() => setQuery(null)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container"><Icon name="close" size={18} /></button>
        </div>
      )}

      {showSettings && (
        <div role="dialog" aria-label={C.settings} className="flex flex-col gap-3 border-b border-outline-variant bg-white px-4 py-4 text-sm md:px-6">
          <div className="flex items-center justify-between"><b>{C.settings}</b><button type="button" aria-label={C.close} onClick={() => setShowSettings(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container"><Icon name="close" size={18} /></button></div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{C.wallpaper}</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(WALLS) as Wall[]).map((w) => (
                <button key={w} type="button" aria-pressed={prefs.wall === w} onClick={() => setPrefs({ wall: w })} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${prefs.wall === w ? "border-primary ring-2 ring-primary/30" : "border-outline-variant"}`}>
                  <span aria-hidden className="h-4 w-4 rounded-full border border-outline-variant" style={{ background: WALLS[w] }} />
                  {C.walls[w]}
                </button>
              ))}
            </div>
          </fieldset>
          {([["enter", C.enterSend, C.enterSendHint], ["receipts", C.receipts, C.receiptsHint]] as const).map(([k, label, hint]) => (
            <label key={k} className="flex items-start justify-between gap-4">
              <span><span className="font-semibold">{label}</span><br /><span className="text-xs text-on-surface-variant">{hint}</span></span>
              <input type="checkbox" role="switch" checked={prefs[k]} onChange={(e) => setPrefs({ [k]: e.target.checked })} className="mt-1 h-5 w-5 accent-primary" />
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 px-3 py-4 md:overflow-y-auto md:px-6" style={{ background: WALLS[prefs.wall] }}>
        {!messages.length && <p className={`m-auto rounded-[12px] px-4 py-2 text-center text-sm ${dark ? "bg-white/10 text-white" : "bg-white/80 text-on-surface-variant"}`}>{empty}</p>}
        {needle && !shown.length && <p className="m-auto rounded-[12px] bg-white/80 px-4 py-2 text-sm text-on-surface-variant">{C.noResults}</p>}
        {shown.map((m, i) => {
          const mine = sideOf(m) === side;
          const quoted = m.reply ? byId.get(m.reply) : undefined;
          const newDay = i === 0 || dayOf(shown[i - 1].at) !== dayOf(m.at);
          const reacts = Object.values(m.react ?? {});
          return (
            <div key={m.id} id={`msg-${m.id}`} className="flex flex-col">
              {newDay && <span className={`mx-auto my-2 rounded-[8px] px-3 py-1 text-xs font-semibold shadow-xs ${dark ? "bg-white/15 text-white" : "bg-white/90 text-on-surface-variant"}`}>{dayLabel(m.at)}</span>}
              <div className={`group relative flex max-w-[min(32rem,85%)] flex-col ${mine ? "ml-auto items-end" : "mr-auto items-start"} ${reacts.length ? "mb-3" : ""}`}>
                <div className={`relative rounded-[12px] px-2.5 pb-1.5 pt-1.5 text-sm leading-relaxed shadow-xs [overflow-wrap:anywhere] ${mine ? "rounded-tr-[4px] bg-primary-container text-on-primary-container" : "rounded-tl-[4px] bg-white text-on-surface"}`}>
                  {quoted && (
                    <a href={`#msg-${quoted.id}`} className="mb-1 block rounded-[8px] border-l-4 border-primary bg-black/5 px-2 py-1 text-xs">
                      <b className="block text-primary">{sideOf(quoted) === side ? C.you : quoted.sender}</b>
                      <span className="line-clamp-2 opacity-80">{preview(quoted, C)}</span>
                    </a>
                  )}
                  {m.photo && (
                    <a href={m.photo} target="_blank" rel="noreferrer" className="mb-1 block">
                      <img src={m.photo} alt={C.photo} className="max-h-72 rounded-[8px] object-cover" />
                    </a>
                  )}
                  {m.deleted ? (
                    <span className="italic opacity-70">🚫 {mine ? C.deletedMine : C.deleted}</span>
                  ) : (
                    m.text && <span className="whitespace-pre-wrap">{mark(m.text)}</span>
                  )}
                  <span className="float-right ml-3 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] leading-none opacity-70">
                    {m.edited && !m.deleted && <span>{C.edited}</span>}
                    {fmtTime(m.at, lang)}
                    {mine && !m.deleted && (prefs.receipts && seen(thread!, m) ? <span role="img" aria-label={C.read} className="text-sky-600"><Icon name="checkAll" size={15} strokeWidth={2.2} /></span> : <span role="img" aria-label={C.sent}><Icon name="check" size={15} strokeWidth={2.2} /></span>)}
                  </span>
                  {!m.deleted && (
                    <button type="button" aria-label={C.menu} aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)} className={`absolute top-0.5 ${mine ? "-left-9" : "-right-9"} flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-on-surface-variant opacity-0 shadow-xs transition-opacity focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-70`}>
                      <Icon name="chevronDown" size={16} />
                    </button>
                  )}
                </div>
                {!!reacts.length && <span className={`absolute -bottom-3 ${mine ? "right-2" : "left-2"} rounded-full border border-outline-variant bg-white px-1.5 text-sm shadow-xs`}>{reacts.join("")}</span>}
                {menu === m.id && (
                  <div role="menu" className={`z-10 mt-1 flex w-56 flex-col overflow-hidden rounded-[12px] border border-outline-variant bg-white text-sm shadow-lg ${mine ? "self-end" : "self-start"}`}>
                    <div className="flex justify-between border-b border-outline-variant px-2 py-1.5">
                      {REACTIONS.map((e) => (
                        <button key={e} type="button" role="menuitem" aria-label={e} aria-pressed={m.react?.[side] === e} onClick={() => (lms.reactChatMessage(thread!.id, m.id, side, m.react?.[side] === e ? null : e), setMenu(null))} className={`flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-surface-container ${m.react?.[side] === e ? "bg-primary-container" : ""}`}>{e}</button>
                      ))}
                    </div>
                    <button type="button" role="menuitem" onClick={() => (setReplyTo(m), setEditing(null), setMenu(null), box.current?.focus())} className="flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container"><Icon name="back" size={16} />{C.reply}</button>
                    {m.text && <button type="button" role="menuitem" onClick={() => copy(m)} className="flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container"><Icon name="copy" size={16} />{C.copy}</button>}
                    {mine && canEdit(m) && <button type="button" role="menuitem" onClick={() => startEdit(m)} className="flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container"><Icon name="edit" size={16} />{C.edit}</button>}
                    {mine && canDelete(m) && (
                      <button type="button" role="menuitem" onClick={() => (setMenu(null), window.confirm(C.confirmDelete) && lms.deleteChatMessage(thread!.id, m.id))} className="flex items-center gap-2 px-3 py-2.5 text-left text-error hover:bg-surface-container"><Icon name="trash" size={16} />{C.delete}</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => (e.preventDefault(), send())} className={`glass-header ${dock} flex flex-col gap-2 border-t border-white/70 px-3 py-2.5 md:bg-white/60 md:px-6`}>
        {note && <p role="status" className="text-xs text-on-surface-variant">{note}</p>}
        {(replyTo || editing) && (
          <div className="flex items-center gap-2 rounded-[10px] border-l-4 border-primary bg-surface-container px-3 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <b className="block text-primary">{editing ? C.editing : sideOf(replyTo!) === side ? C.you : replyTo!.sender}</b>
              <span className="line-clamp-1 opacity-80">{preview((editing ?? replyTo)!, C)}</span>
            </div>
            <button type="button" aria-label={C.cancel} onClick={() => (editing && setDraft(""), setReplyTo(null), setEditing(null))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white"><Icon name="close" size={16} /></button>
          </div>
        )}
        {photo && (
          <div className="relative w-fit">
            <img src={photo} alt={C.photo} className="h-20 w-20 rounded-[10px] object-cover" />
            <button type="button" aria-label={C.removePhoto} onClick={() => setPhoto("")} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow"><Icon name="close" size={14} /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {!editing && (
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container focus-within:ring-2 focus-within:ring-primary">
              <Icon name="image" size={22} />
              <span className="sr-only">{C.attach}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPhoto(await shrinkImage(f, 1280, 0.8).catch(() => "")); }} />
            </label>
          )}
          <textarea
            ref={box}
            rows={1}
            value={draft}
            maxLength={TEXT_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && prefs.enter && !e.nativeEvent.isComposing) (e.preventDefault(), send());
              if (e.key === "Escape") (setReplyTo(null), editing && (setEditing(null), setDraft("")));
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-[22px] border border-outline-variant bg-white px-4 py-2.5 text-sm outline-none [field-sizing:content] focus:border-primary"
          />
          <button type="submit" aria-label={editing ? C.edit : C.send} disabled={!draft.trim() && !photo} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40">
            <Icon name={editing ? "check" : "send"} size={20} />
          </button>
        </div>
      </form>
    </section>
  );
}
