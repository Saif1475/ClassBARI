"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileLink } from "@/components/FileLink";
import { Icon } from "@/components/Icon";
import {
  canRequest,
  friendStatus,
  friendsOf,
  MAX_IMAGES,
  POLL_OPTION_MAX,
  POST_MAX,
  BIO_MAX,
  pollCounts,
  timeline,
  trending,
  type Audience,
  type Author,
  type CommunityPost,
  type CommunityProfile,
  type FriendStatus,
} from "@/lib/community";
import { fmtAgo } from "@/lib/dates";
import { readAsDataUrl } from "@/lib/files";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { usePaged } from "@/components/Pager";
import { shrinkImage } from "@/lib/image";
import { useLms } from "@/lib/lms-store";
import { unkind } from "@/lib/word-filter";

type Viewer = { student: number } | { staff: true };
type Tab = "all" | "friends" | "saved" | "activity" | "people" | "me";
const card = "flex flex-col gap-3 rounded-[16px] border border-outline-variant bg-white p-4";
const iconBtn = "flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition-colors"; // colour set per button
const PDF_MAX = 5 * 1024 * 1024;
const AUD_ICON: Record<Audience, string> = { all: "🌐", batch: "🏫", friends: "👥" };

/**
 * The institute's own social network, laid out like Twitter / X. Students post (text, up to 4 photos, a PDF, a poll),
 * choose who sees each post, like, reply, bookmark, follow hashtags, keep a profile, and control their privacy
 * (who may send friend requests, being findable, mute and block). Child-safety by design: only this institute's
 * students, every post can be reported, teachers see everything and can remove or pin posts, and there are no
 * private student-to-student messages. The server enforces who sees what (data-access.ts).
 */
export function Community({ viewer }: { viewer: Viewer }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const me = "student" in viewer ? viewer.student : undefined;
  const staff = "staff" in viewer;
  const [tab, setTab] = useState<Tab>("all");
  const [profile, setProfile] = useState<number | null>(null); // someone's profile page, over any tab
  const [query, setQuery] = useState("");
  const nameOf = useName();
  const myBatch = lms.students.find((s) => s.id === me)?.batch;
  const view = { student: me, staff, batch: myBatch };
  const filter = tab === "friends" ? "friends" : tab === "saved" ? "saved" : "all";
  const posts = timeline(lms.community, lms.friendships, lms.communityProfiles, view, { filter, query, nameOf: (a) => nameOf(a).name });
  const requests = me === undefined ? 0 : lms.friendships.filter((f) => f.to === me && f.status === "pending").length;
  // Trending tags read every post: worked out again only when the posts change, not on every letter typed in search.
  const tags = useMemo(() => trending(timeline(lms.community, lms.friendships, lms.communityProfiles, { student: me, staff, batch: myBatch })), [lms.community, lms.friendships, lms.communityProfiles, me, staff, myBatch]);
  // Numbered pages: the feed shows 20 posts at a time instead of every post ever written.
  const { shown: feedPosts, pager: feedPager } = usePaged(staff ? [...posts].sort((x, y) => Number(!!y.held) - Number(!!x.held)) : posts, `${tab}|${query}`);
  const open = (a: Author) => typeof a === "number" && (setProfile(a), window.scrollTo({ top: 0 }));
  const tabs: [Tab, string, number?][] = [["all", C.forYou], ["friends", C.onlyFriends], ["saved", C.savedTab], ["activity", C.activityTab, requests], ["people", C.peopleTab], ["me", C.meTab]];

  const feed = (list: CommunityPost[], empty: string) => (
    <>
      {list.length === 0 && <p className="px-4 py-10 text-center text-on-surface-variant">{empty}</p>}
      {list.map((p) => <Post key={p.id} p={p} me={me} staff={staff} onAuthor={open} onTag={(tag) => (setQuery(tag), setTab("all"), setProfile(null))} />)}
    </>
  );

  return (
    <div className="flex flex-col rounded-[16px] border border-outline-variant bg-white">
      {!staff && (
        <div role="tablist" className="glass-header sticky top-0 z-10 flex overflow-x-auto rounded-t-[16px] border-b border-outline-variant [scrollbar-width:none]">
          {tabs.map(([id, label, badge]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id && profile === null} onClick={() => (setTab(id), setProfile(null))} className="flex h-13 min-w-max flex-1 items-center justify-center px-3 text-sm font-bold text-on-surface-variant hover:bg-surface-container">
              <span className={`relative flex h-full items-center gap-1.5 ${tab === id && profile === null ? "text-on-surface" : ""}`}>
                {label}
                {!!badge && <span className="rounded-full bg-error px-1.5 text-xs text-white">{badge}</span>}
                {tab === id && profile === null && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-primary" />}
              </span>
            </button>
          ))}
        </div>
      )}

      {profile !== null && me !== undefined ? (
        <ProfileView id={profile} me={me} onBack={() => setProfile(null)} onTag={(tag) => (setQuery(tag), setTab("all"), setProfile(null))} />
      ) : tab === "people" && me !== undefined ? (
        <div className="p-4"><People me={me} onOpen={open} /></div>
      ) : tab === "activity" && me !== undefined ? (
        <Activity me={me} onOpen={open} />
      ) : tab === "me" && me !== undefined ? (
        <>
          <ProfileView id={me} me={me} onTag={(tag) => (setQuery(tag), setTab("all"))} />
          <Privacy me={me} onOpen={open} />
        </>
      ) : (
        <>
          {tab === "all" && <Composer author={staff ? "teacher" : me!} />}
          <div className="flex flex-col gap-2 border-b border-outline-variant px-4 py-3">
            <label className="flex h-10 items-center gap-2 rounded-full bg-surface-container px-4 focus-within:ring-2 focus-within:ring-primary">
              <span aria-hidden className="text-on-surface-variant"><Icon name="search" size={16} /></span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={C.searchPosts} aria-label={C.searchPosts} className="h-full min-w-0 flex-1 bg-transparent text-sm !outline-none" />
            </label>
            {!query && tags.length > 0 && tab === "all" && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-bold text-on-surface-variant">{C.trendingTitle}:</span>
                {tags.map(({ tag }) => (
                  <button key={tag} type="button" onClick={() => setQuery(tag)} className="rounded-full px-2 py-0.5 font-semibold text-primary hover:bg-primary-container">{tag}</button>
                ))}
              </div>
            )}
          </div>
          {staff && <p className="border-b border-outline-variant px-4 py-3 text-sm text-on-surface-variant">{C.modHelp}</p>}
          {staff && posts.some((p) => p.held) && <p role="status" className="border-b border-outline-variant bg-tertiary-container px-4 py-3 text-sm font-bold text-on-tertiary-container">⏳ {C.heldCount(posts.filter((p) => p.held).length)}</p>}
          {feed(feedPosts, query ? C.noResults : tab === "friends" ? C.noFriendPosts : tab === "saved" ? C.nobodyYet : C.empty)}
          {feedPager}
        </>
      )}
    </div>
  );
}

function useName() {
  const lms = useLms();
  const { t } = useLang();
  return (a: Author) => {
    if (a === "teacher") return { name: lms.teacherName, sub: t.community.teacher, photo: undefined as string | undefined, teacher: true };
    const s = typeof a === "number" ? lms.studentById.get(a) : undefined;
    return { name: s?.name ?? "—", sub: s?.batch ?? "", photo: s?.photo, teacher: false };
  };
}

function Avatar({ name, photo, size = 40 }: { name: string; photo?: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return <span className="flex shrink-0 items-center justify-center rounded-full bg-primary-container font-bold text-on-primary-container" style={{ width: size, height: size, fontSize: size * 0.4 }}>{name.charAt(0)}</span>;
}

/** Post text with #hashtags (press to search) and @names shown in the accent colour. */
function Text({ text, onTag }: { text: string; onTag: (tag: string) => void }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {text.split(/(#[\p{L}\p{M}\p{N}_]{2,40}|@[\p{L}\p{M}\p{N}_]{2,40})/u).map((part, i) =>
        part.startsWith("#") && i % 2 ? (
          <button key={i} type="button" onClick={() => onTag(part.toLowerCase())} className="font-semibold text-primary hover:underline">{part}</button>
        ) : part.startsWith("@") && i % 2 ? (
          <span key={i} className="font-semibold text-primary">{part}</span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** A small "⋯" menu that closes on a press elsewhere. */
function Menu({ label, items }: { label: string; items: { label: string; danger?: boolean; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={box} className="relative">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${iconBtn} text-on-surface-variant hover:bg-surface-container`}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <ul role="menu" className="picker-drop absolute right-0 top-full z-30 mt-1 flex w-56 flex-col gap-0.5 rounded-[12px] border border-outline-variant p-1.5 shadow-[0_18px_50px_rgba(0,32,28,0.22)]">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button type="button" role="menuitem" onClick={() => (setOpen(false), it.run())} className={`flex min-h-11 w-full items-center rounded-[8px] px-3 text-left text-sm font-semibold hover:bg-surface-container ${it.danger ? "text-error" : ""}`}>{it.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ author }: { author: Author }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const who = useName()(author);
  const student = typeof author === "number";
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [audience, setAudience] = useState<Audience>((student && lms.communityProfiles[author as number]?.audience) || "all");
  const [note, setNote] = useState("");
  const left = POST_MAX - text.length;
  const filled = poll?.map((o) => o.trim().toLowerCase()).filter(Boolean) ?? [];
  const pollSame = new Set(filled).size !== filled.length; // the same option twice: votes for it would only count for the first
  const pollOk = !poll || (filled.length >= 2 && !pollSame);
  const ready = pollOk && (!!text.trim() || images.length > 0 || !!file || !!poll);

  const addPhotos = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, MAX_IMAGES - images.length);
    if ((files?.length ?? 0) > list.length) setNote(C.photoLimit);
    const shrunk = await Promise.all(list.map((f) => shrinkImage(f, 1200, 0.78).catch(() => null)));
    setImages((x) => [...x, ...shrunk.filter((v): v is string => !!v)].slice(0, MAX_IMAGES));
  };
  const addPdf = async (f?: File) => {
    if (!f) return;
    if (f.size > PDF_MAX) return setNote(C.pdfTooBig);
    setNote("");
    setFile({ name: f.name.slice(0, 120), url: await readAsDataUrl(f) });
  };

  return (
    <form
      className="flex gap-3 border-b border-outline-variant px-4 pb-3 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        lms.addCommunityPost(author, text, undefined, { images, ...(file ? { file } : {}), ...(poll ? { poll: poll.map((o) => o.trim()).filter(Boolean) } : {}), ...(student ? { audience, ...(unkind(text) ? { held: true } : {}) } : {}) });
        setText("");
        setImages([]);
        setFile(null);
        setPoll(null);
        setNote("");
      }}
    >
      <Avatar name={who.name} photo={who.photo} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {student && (
          <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} aria-label={C.whoCanSee} className="h-8 self-start rounded-full border border-primary/40 bg-transparent px-3 text-xs font-bold text-primary">
            <option value="all">{AUD_ICON.all} {C.audAll}</option>
            <option value="batch">{AUD_ICON.batch} {C.audBatch}</option>
            <option value="friends">{AUD_ICON.friends} {C.audFriends}</option>
          </select>
        )}
        <textarea rows={2} maxLength={POST_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={author === "teacher" ? C.teacherPh : C.whatsHappening} aria-label={C.compose} className="min-h-14 w-full resize-none bg-transparent py-1 text-lg !outline-none placeholder:text-on-surface-variant [field-sizing:content]" />
        {images.length > 0 && (
          <div className={`grid gap-1.5 ${images.length > 1 ? "grid-cols-2" : ""}`}>
            {images.map((src, i) => (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-video w-full rounded-[12px] border border-outline-variant object-cover" />
                <button type="button" onClick={() => setImages((x) => x.filter((_, k) => k !== i))} aria-label={C.removePhoto} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"><Icon name="close" size={16} /></button>
              </span>
            ))}
          </div>
        )}
        {file && (
          <span className="flex items-center gap-2 self-start rounded-[12px] border border-outline-variant px-3 py-2 text-sm font-semibold">
            📕 <span className="max-w-56 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label={C.removePhoto} className="text-on-surface-variant"><Icon name="close" size={16} /></button>
          </span>
        )}
        {poll && (
          <fieldset className="flex flex-col gap-2 rounded-[12px] border border-outline-variant p-3">
            <legend className="px-1 text-xs font-bold text-on-surface-variant">{C.poll}</legend>
            {pollSame && <p role="alert" className="text-xs text-error">{C.pollSame}</p>}
            {poll.map((o, i) => (
              <input key={i} value={o} maxLength={POLL_OPTION_MAX} onChange={(e) => setPoll(poll.map((x, k) => (k === i ? e.target.value : x)))} placeholder={C.pollOption(i + 1)} aria-label={C.pollOption(i + 1)} className="h-10 rounded-[10px] border border-outline bg-transparent px-3 text-sm" />
            ))}
            <span className="flex justify-between text-sm font-bold">
              {poll.length < 4 ? <button type="button" onClick={() => setPoll([...poll, ""])} className="text-primary">+ {C.addOption}</button> : <span />}
              <button type="button" onClick={() => setPoll(null)} className="text-error">{C.removePoll}</button>
            </span>
          </fieldset>
        )}
        {note && <p role="status" className="text-xs font-semibold text-error">{note}</p>}
        {student && unkind(text) && <p role="status" className="text-xs font-semibold text-tertiary">{C.willWait}</p>}
        <p className="text-xs text-on-surface-variant">{C.rules}</p>
        <div className="flex items-center justify-between gap-2 border-t border-outline-variant pt-2">
          <span className="flex items-center">
            <label title={C.addPhoto} className={`${iconBtn} cursor-pointer text-primary hover:bg-primary-container ${images.length >= MAX_IMAGES ? "pointer-events-none opacity-40" : ""}`}>
              <Icon name="image" size={20} />
              <input type="file" accept="image/*" multiple aria-label={C.photo} className="sr-only" onChange={(e) => (void addPhotos(e.target.files), (e.target.value = ""))} />
            </label>
            <label title={C.addPdf} className={`${iconBtn} cursor-pointer text-primary hover:bg-primary-container`}>
              <Icon name="file" size={20} />
              <input type="file" accept="application/pdf,.pdf" aria-label={C.addPdf} className="sr-only" onChange={(e) => (void addPdf(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
            <button type="button" title={C.poll} aria-label={C.poll} aria-pressed={!!poll} onClick={() => setPoll(poll ? null : ["", ""])} className={`${iconBtn} text-primary hover:bg-primary-container`}>
              <Icon name="grid" size={20} />
            </button>
          </span>
          <span className="flex items-center gap-3">
            {text.length > POST_MAX - 200 && <span aria-live="polite" className={`text-xs font-bold ${left < 20 ? "text-error" : "text-on-surface-variant"}`} title={C.charsLeft(left)}>{left}</span>}
            <button type="submit" disabled={!ready} className="h-9 rounded-full bg-primary px-5 text-sm font-bold text-on-primary disabled:opacity-50">{C.post}</button>
          </span>
        </div>
      </div>
    </form>
  );
}

function PollView({ p, me }: { p: CommunityPost; me?: number }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const poll = p.poll!;
  const counts = pollCounts(poll);
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = me !== undefined ? poll.votes[me] : undefined;
  const showResults = mine !== undefined || me === undefined;
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {poll.options.map((o, i) =>
        showResults ? (
          <div key={i} className="relative overflow-hidden rounded-[10px] border border-outline-variant px-3 py-2 text-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 bg-primary-container" style={{ width: `${total ? (counts[i] / total) * 100 : 0}%` }} />
            <span className="relative flex justify-between gap-2 font-semibold">
              <span>{o}{mine === i && " ✓"}</span>
              <span>{total ? Math.round((counts[i] / total) * 100) : 0}%</span>
            </span>
          </div>
        ) : (
          <button key={i} type="button" onClick={() => lms.votePoll(p.id, me!, i)} className="rounded-[10px] border border-primary px-3 py-2 text-left text-sm font-bold text-primary hover:bg-primary-container">{o}</button>
        ),
      )}
      <span className="text-xs text-on-surface-variant">{C.votes(total)}</span>
    </div>
  );
}

function Post({ p, me, staff, onAuthor, onTag }: { p: CommunityPost; me?: number; staff: boolean; onAuthor: (a: Author) => void; onTag: (tag: string) => void }) {
  const { t, lang } = useLang();
  const C = t.community;
  const lms = useLms();
  const nameOf = useName();
  const who = nameOf(p.author);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [warn, setWarn] = useState(false); // unkind words in a reply or an edit
  const liked = me !== undefined && p.likes.includes(me);
  const mine = me !== undefined && p.author === me;
  const reported = me !== undefined && p.reports.includes(me);
  const myProfile: CommunityProfile = (me !== undefined && lms.communityProfiles[me]) || {};
  const saved = !!myProfile.saved?.includes(p.id);
  const other = typeof p.author === "number" && !mine ? p.author : undefined;
  const images = p.images ?? (p.image ? [p.image] : []);
  const setList = (key: "muted" | "blocked", id: number, on: boolean) =>
    me !== undefined && lms.setCommunityProfile(me, { [key]: on ? [...new Set([...(myProfile[key] ?? []), id])] : (myProfile[key] ?? []).filter((x) => x !== id) });

  const menu =
    me === undefined
      ? []
      : [
          ...(mine ? [{ label: C.edit, run: () => setEditing(p.text) }, { label: C.delete, danger: true, run: () => window.confirm(C.deleteQ) && lms.deletePost(p.id) }] : []),
          { label: saved ? C.unsave : C.savePost, run: () => lms.toggleSave(me, p.id) },
          ...(other !== undefined
            ? [
                { label: myProfile.muted?.includes(other) ? C.unmute(who.name) : C.mute(who.name), run: () => setList("muted", other, !myProfile.muted?.includes(other)) },
                { label: C.block(who.name), danger: true, run: () => window.confirm(C.blockQ(who.name)) && setList("blocked", other, true) },
              ]
            : []),
          ...(!mine && !reported ? [{ label: C.report, danger: true, run: () => window.confirm(C.reportQ) && lms.reportPost(p.id, me) }] : []),
        ];

  return (
    <article aria-label={C.postBy(who.name)} className={`flex flex-col gap-1 border-b border-outline-variant px-4 pb-2 pt-3 transition-colors hover:bg-surface-container/40 ${p.hidden ? "opacity-60" : ""}`}>
      {p.pinned && <span className="flex items-center gap-1.5 pl-[52px] text-xs font-bold text-on-surface-variant">📌 {C.pinnedBy}</span>}
      <div className="flex gap-3">
        <button type="button" onClick={() => onAuthor(p.author)} aria-label={who.name} className="h-10 shrink-0 self-start rounded-full"><Avatar name={who.name} photo={who.photo} /></button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-[15px]">
              <button type="button" onClick={() => onAuthor(p.author)} className="truncate font-bold hover:underline">{who.name}</button>
              {who.teacher && <span aria-hidden className="text-primary">✔</span>}
              <span className="truncate text-sm text-on-surface-variant">
                {who.sub} · {fmtAgo(p.at, lang)}
                {p.edited && ` · ${C.edited}`}
                {p.audience && p.audience !== "all" && <span title={C.whoCanSee}> · {AUD_ICON[p.audience]}</span>}
              </span>
              {p.hidden && <span className="rounded-full bg-error-container px-2 text-xs font-bold text-on-error-container">{C.removed}</span>}
              {p.held && <span className="rounded-full bg-tertiary-container px-2 text-xs font-bold text-on-tertiary-container">⏳ {staff ? C.heldStaff : C.heldMine}</span>}
            </div>
            <Menu label={C.moreActions} items={menu} />
          </div>

          {editing !== null ? (
            <form className="flex flex-col gap-2" onSubmit={(e) => (e.preventDefault(), unkind(editing) ? setWarn(true) : (lms.editPost(p.id, editing), setEditing(null), setWarn(false)))}>
              <textarea value={editing} maxLength={POST_MAX} onChange={(e) => setEditing(e.target.value)} aria-label={C.edit} className="min-h-20 rounded-[10px] border border-outline bg-transparent p-2 text-[15px] [field-sizing:content]" />
              <span className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-full px-4 text-sm font-bold">{C.cancel}</button>
                <button type="submit" className="h-9 rounded-full bg-primary px-4 text-sm font-bold text-on-primary">{C.save}</button>
              </span>
            </form>
          ) : (
            p.text && <Text text={p.text} onTag={onTag} />
          )}
          {images.length > 0 && (
            <div className={`mt-1 grid gap-1 overflow-hidden rounded-[16px] border border-outline-variant ${images.length > 1 ? "grid-cols-2" : ""}`}>
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={C.photoOf(who.name)} className={`w-full object-cover ${images.length === 1 ? "max-h-[28rem]" : "aspect-square"} ${images.length === 3 && i === 0 ? "row-span-2 h-full" : ""}`} />
              ))}
            </div>
          )}
          {p.file && (
            <FileLink url={p.file.url} className="mt-1 flex items-center gap-3 self-start rounded-[12px] border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-container">
              <span aria-hidden className="text-2xl">📕</span>
              <span className="max-w-64 truncate">{p.file.name}</span>
            </FileLink>
          )}
          {p.poll && <PollView p={p} me={me} />}

          {/* Reply · like · save, with counts, like a tweet */}
          <div className="-ml-2 mt-1 flex max-w-sm items-center justify-between">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-label={C.comment} aria-expanded={open} title={C.comments(p.comments.length)} className={`${iconBtn} hover:bg-primary-container hover:text-primary ${open ? "text-primary" : "text-on-surface-variant"}`}>
              <Icon name="message" size={18} /> {p.comments.length > 0 && <span>{p.comments.length}</span>}
            </button>
            {me !== undefined ? (
              <button type="button" aria-pressed={liked} aria-label={liked ? C.liked : C.like} onClick={() => lms.toggleLike(p.id, me)} className={`${iconBtn} hover:bg-error-container hover:text-error ${liked ? "text-error" : "text-on-surface-variant"}`}>
                <span className={liked ? "[&_path]:fill-current" : ""}><Icon name="heart" size={18} /></span> {p.likes.length > 0 && <span>{p.likes.length}</span>}
              </button>
            ) : (
              <span className={`${iconBtn} text-on-surface-variant`}><Icon name="heart" size={18} /> {p.likes.length > 0 && <span>{p.likes.length}</span>}</span>
            )}
            {me !== undefined && (
              <button type="button" aria-pressed={saved} aria-label={saved ? C.unsave : C.savePost} title={saved ? C.unsave : C.savePost} onClick={() => lms.toggleSave(me, p.id)} className={`${iconBtn} hover:bg-primary-container hover:text-primary ${saved ? "text-primary" : "text-on-surface-variant"}`}>
                <span className={saved ? "[&_path]:fill-current" : ""}><Icon name="bookmark" size={18} /></span>
              </button>
            )}
            {reported && <span className={`${iconBtn} text-tertiary`} title={C.reported} aria-label={C.reported} role="img"><Icon name="flag" size={18} /></span>}
          </div>

          {staff && (
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-container px-3 py-2 text-sm">
              {p.reports.length > 0 && <b className="text-error">⚑ {C.reportsN(p.reports.length)}</b>}
              {p.held && <button type="button" onClick={() => lms.moderatePost(p.id, { approve: true })} className="rounded-full bg-primary px-3 py-1 font-bold text-on-primary">{C.approvePhoto}</button>}
              <button type="button" onClick={() => lms.moderatePost(p.id, { hidden: !p.hidden })} className="rounded-full bg-white px-3 py-1 font-bold text-error">{p.hidden ? C.restore : C.remove}</button>
              <button type="button" onClick={() => lms.moderatePost(p.id, { pinned: !p.pinned })} className="rounded-full bg-white px-3 py-1 font-bold text-primary">{p.pinned ? C.unpin : C.pin}</button>
              {p.reports.length > 0 && <button type="button" onClick={() => lms.moderatePost(p.id, { clearReports: true })} className="rounded-full bg-white px-3 py-1 font-bold">{C.looksFine}</button>}
            </div>
          )}

          {open && (
            <div className="mt-1 flex flex-col gap-3 border-l-2 border-outline-variant pl-3">
              {p.comments.map((c) => {
                const cw = nameOf(c.author);
                return (
                  <div key={c.id} className="flex gap-2">
                    <button type="button" onClick={() => onAuthor(c.author)} aria-label={cw.name} className="h-7 shrink-0 rounded-full"><Avatar name={cw.name} photo={cw.photo} size={28} /></button>
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{cw.name}</b> <span className="text-xs text-on-surface-variant">· {fmtAgo(c.at, lang)}</span>
                      <p className="whitespace-pre-wrap break-words">{c.text}</p>
                    </div>
                    {(c.author === me || staff) && (
                      <button type="button" aria-label={C.deleteComment} title={C.deleteComment} onClick={() => window.confirm(`${C.deleteComment}?`) && lms.deleteComment(p.id, c.id)} className={`${iconBtn} shrink-0 self-start text-on-surface-variant hover:text-error`}>
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!staff && unkind(comment)) return setWarn(true); // the server refuses it too
                  lms.addComment(p.id, staff ? "teacher" : me!, comment);
                  setComment("");
                }}
              >
                <input value={comment} onChange={(e) => (setComment(e.target.value), setWarn(false))} maxLength={500} placeholder={C.commentPh} aria-label={C.commentOn(who.name)} className="h-10 min-w-0 flex-1 rounded-full border border-outline bg-transparent px-4 text-sm" />
                <button type="submit" disabled={!comment.trim()} aria-label={C.send} className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-50">{C.send}</button>
              </form>
              {warn && <p role="alert" className="text-sm font-semibold text-error">{C.unkind}</p>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** A student's page: who they are, how many posts and friends, their posts (only the ones you may see). */
function ProfileView({ id, me, onBack, onTag }: { id: number; me: number; onBack?: () => void; onTag: (tag: string) => void }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const s = lms.students.find((x) => x.id === id);
  const pr: CommunityProfile = lms.communityProfiles[id] ?? {};
  const mine: CommunityProfile = lms.communityProfiles[me] ?? {};
  const [bio, setBio] = useState<string | null>(null);
  const [bioWarn, setBioWarn] = useState(false);
  const myBatch = lms.students.find((x) => x.id === me)?.batch;
  const posts = timeline(lms.community, lms.friendships, lms.communityProfiles, { student: me, batch: myBatch }, { author: id });
  const friends = friendsOf(lms.friendships, id).length;
  if (!s) return null;
  const self = id === me;
  const blocked = !!mine.blocked?.includes(id);
  const muted = !!mine.muted?.includes(id);
  const set = (key: "muted" | "blocked", on: boolean) => lms.setCommunityProfile(me, { [key]: on ? [...new Set([...(mine[key] ?? []), id])] : (mine[key] ?? []).filter((x) => x !== id) });

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-outline-variant p-4">
        {onBack && (
          <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-sm font-bold text-primary">
            <span className="rotate-180"><Icon name="chevronRight" size={16} /></span> {C.back}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={s.name} photo={s.photo} size={72} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="text-xl font-bold">{s.name}</h2>
            <span className="text-sm text-on-surface-variant">{s.batch}</span>
            <span className="mt-1 text-sm text-on-surface-variant"><b className="text-on-surface">{C.postsN(posts.length)}</b> · <b className="text-on-surface">{C.friendsN(friends)}</b></span>
          </div>
          {!self && <FriendButton me={me} other={id} name={s.name} />}
        </div>
        {bio !== null ? (
          <form className="flex flex-col gap-2" onSubmit={(e) => (e.preventDefault(), unkind(bio) ? setBioWarn(true) : (lms.setCommunityProfile(me, { bio }), setBio(null), setBioWarn(false)))}>
            <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface-variant">
              {C.bioLabel}
              <textarea value={bio} maxLength={BIO_MAX} onChange={(e) => (setBio(e.target.value), setBioWarn(false))} placeholder={C.bioPh} className="min-h-16 rounded-[10px] border border-outline bg-transparent p-2 text-base text-on-surface" />
            </label>
            {bioWarn && <p role="alert" className="text-sm font-semibold text-error">{C.unkind}</p>}
            <span className="flex justify-end gap-2">
              <button type="button" onClick={() => setBio(null)} className="h-9 rounded-full px-4 text-sm font-bold">{C.cancel}</button>
              <button type="submit" className="h-9 rounded-full bg-primary px-4 text-sm font-bold text-on-primary">{C.save}</button>
            </span>
          </form>
        ) : (
          pr.bio && <p className="whitespace-pre-wrap text-[15px]">{pr.bio}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {self && bio === null && <button type="button" onClick={() => setBio(pr.bio ?? "")} className="h-9 rounded-full border border-outline px-4 text-sm font-bold">{C.editProfile}</button>}
          {!self && <button type="button" onClick={() => set("muted", !muted)} className="h-9 rounded-full border border-outline px-4 text-sm font-bold">{muted ? C.unmute(s.name) : C.mute(s.name)}</button>}
          {!self && (
            <button type="button" onClick={() => (blocked ? set("blocked", false) : window.confirm(C.blockQ(s.name)) && set("blocked", true))} className="h-9 rounded-full border border-error/50 px-4 text-sm font-bold text-error">
              {blocked ? C.unblock(s.name) : C.block(s.name)}
            </button>
          )}
        </div>
      </div>
      {posts.length === 0 && <p className="px-4 py-10 text-center text-on-surface-variant">{C.noPosts}</p>}
      {posts.map((p) => <Post key={p.id} p={p} me={me} staff={false} onAuthor={() => {}} onTag={onTag} />)}
    </div>
  );
}

function FriendButton({ me, other, name, status }: { me: number; other: number; name: string; status?: FriendStatus }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const st = status ?? friendStatus(lms.friendships, me, other); // a long list passes the status it already worked out
  const batch = (id: number) => lms.studentById.get(id)?.batch;
  const pill = "h-9 shrink-0 rounded-full px-4 text-sm font-bold";
  if (st === "friends") return <button type="button" onClick={() => window.confirm(C.unfriendQ(name)) && lms.answerFriend(me, other, false)} className={`${pill} bg-secondary-container text-on-secondary-container`}>✓ {C.friends}</button>;
  if (st === "sent") return <button type="button" onClick={() => lms.answerFriend(me, other, false)} className={`${pill} border border-outline text-on-surface-variant`}>{C.requested}</button>;
  if (st === "received") return <button type="button" onClick={() => lms.answerFriend(me, other, true)} className={`${pill} bg-primary text-on-primary`}>{C.accept}</button>;
  if (!canRequest(lms.communityProfiles, { me: batch(me), other: batch(other) }, me, other)) return <span className="shrink-0 text-xs font-semibold text-on-surface-variant">{C.notTaking}</span>;
  return <button type="button" onClick={() => lms.requestFriend(me, other)} aria-label={C.addFriendTo(name)} className={`${pill} bg-primary text-on-primary`}>+ {C.addFriend}</button>;
}

/** What happened around me: friend requests, replies, likes and poll votes on my posts. */
function Activity({ me, onOpen }: { me: number; onOpen: (a: Author) => void }) {
  const { t, lang } = useLang();
  const C = t.community;
  const lms = useLms();
  const nameOf = useName();
  const mine = lms.community.filter((p) => p.author === me);
  const rows = [
    ...lms.friendships.filter((f) => f.to === me && f.status === "pending").map((f) => ({ key: `f${f.from}`, at: "9999", who: f.from as Author, text: C.wantsFriend(nameOf(f.from).name), extra: <FriendButton me={me} other={f.from} name={nameOf(f.from).name} /> })),
    ...mine.flatMap((p) => p.comments.filter((c) => c.author !== me).map((c) => ({ key: `c${c.id}`, at: c.at, who: c.author, text: `${C.replied(nameOf(c.author).name)}: “${c.text.slice(0, 80)}”`, extra: null }))),
    ...mine.filter((p) => p.likes.some((x) => x !== me)).map((p) => ({ key: `l${p.id}`, at: p.at, who: undefined, text: `❤️ ${C.likedYours(p.likes.filter((x) => x !== me).length)}: “${p.text.slice(0, 60)}”`, extra: null })),
    ...mine.filter((p) => p.poll && pollCounts(p.poll).some(Boolean)).map((p) => ({ key: `v${p.id}`, at: p.at, who: undefined, text: `📊 ${C.votedYours(pollCounts(p.poll!).reduce((a, b) => a + b, 0))}: “${p.text.slice(0, 60)}”`, extra: null })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!rows.length) return <p className="px-4 py-10 text-center text-on-surface-variant">{C.activityEmpty}</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
          {r.who !== undefined ? (
            <button type="button" onClick={() => onOpen(r.who!)} aria-label={nameOf(r.who).name} className="rounded-full"><Avatar name={nameOf(r.who).name} photo={nameOf(r.who).photo} size={36} /></button>
          ) : (
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container"><Icon name="bell" size={18} /></span>
          )}
          <span className="min-w-0 flex-1 text-sm">
            {r.text}
            {r.at !== "9999" && <span className="block text-xs text-on-surface-variant">{fmtAgo(r.at, lang)}</span>}
          </span>
          {r.extra}
        </li>
      ))}
    </ul>
  );
}

/** Settings & privacy: default audience, who may send requests, being findable, and the muted / blocked lists. */
function Privacy({ me, onOpen }: { me: number; onOpen: (a: Author) => void }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const nameOf = useName();
  const pr: CommunityProfile = lms.communityProfiles[me] ?? {};
  const set = (patch: Omit<CommunityProfile, "saved">) => lms.setCommunityProfile(me, patch);
  const field = "flex flex-col gap-1.5 text-sm font-semibold text-on-surface-variant";
  const box = "h-11 rounded-[10px] border border-outline bg-white px-3 text-base text-on-surface";
  const list = (key: "muted" | "blocked", title: string, undo: (n: string) => string) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold">{title}</h3>
      {!(pr[key] ?? []).length && <p className="text-sm text-on-surface-variant">{C.nobodyYet}</p>}
      {(pr[key] ?? []).map((id) => (
        <div key={id} className="flex items-center gap-3">
          <button type="button" onClick={() => onOpen(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold">
            <Avatar name={nameOf(id).name} photo={nameOf(id).photo} size={28} /> <span className="truncate">{nameOf(id).name}</span>
          </button>
          <button type="button" onClick={() => set({ [key]: (pr[key] ?? []).filter((x) => x !== id) })} className="h-9 shrink-0 rounded-full border border-outline px-3 text-xs font-bold">{undo(nameOf(id).name)}</button>
        </div>
      ))}
    </div>
  );
  return (
    <section className="flex flex-col gap-4 border-t-8 border-surface-container p-4">
      <h2 className="text-lg font-bold">🔒 {C.privacyTitle}</h2>
      <label className={field}>
        {C.defaultAudience}
        <select value={pr.audience ?? "all"} onChange={(e) => set({ audience: e.target.value as Audience })} className={box}>
          <option value="all">{AUD_ICON.all} {C.audAll}</option>
          <option value="batch">{AUD_ICON.batch} {C.audBatch}</option>
          <option value="friends">{AUD_ICON.friends} {C.audFriends}</option>
        </select>
      </label>
      <label className={field}>
        {C.whoRequests}
        <select value={pr.requests ?? "all"} onChange={(e) => set({ requests: e.target.value as CommunityProfile["requests"] })} className={box}>
          <option value="all">{C.reqAll}</option>
          <option value="batch">{C.reqBatch}</option>
          <option value="none">{C.reqNone}</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        {C.findable}
        <input type="checkbox" checked={!pr.hidden} onChange={(e) => set({ hidden: !e.target.checked })} className="h-5 w-5 accent-primary" />
      </label>
      {list("muted", C.mutedList, C.unmute)}
      {list("blocked", C.blockedList, C.unblock)}
      <p className="text-xs text-on-surface-variant">{C.safetyNote}</p>
    </section>
  );
}

function People({ me, onOpen }: { me: number; onOpen: (a: Author) => void }) {
  const { t } = useLang();
  const C = t.community;
  const lms = useLms();
  const [q, setQ] = useState("");
  const blocked = new Set([...(lms.communityProfiles[me]?.blocked ?? []), ...Object.entries(lms.communityProfiles).filter(([, p]) => p.blocked?.includes(me)).map(([id]) => Number(id))]);
  const others = lms.students.filter((s) => s.id !== me && !blocked.has(s.id));
  // Where I stand with everyone, from one pass over the friendships (not a search of them for every person in the list).
  const status = new Map<number, FriendStatus>();
  for (const f of lms.friendships) {
    const other = f.from === me ? f.to : f.to === me ? f.from : undefined;
    if (other !== undefined && !status.has(other)) status.set(other, f.status === "friends" ? "friends" : f.from === me ? "sent" : "received");
  }
  const statusOf = (id: number) => status.get(id) ?? "none";
  const received = others.filter((s) => statusOf(s.id) === "received");
  const friends = friendsOf(lms.friendships, me).map((id) => lms.studentById.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const needle = q.trim().toLowerCase();
  // People who chose not to be findable only show up for their friends.
  const found = others.filter((s) => (!lms.communityProfiles[s.id]?.hidden || statusOf(s.id) === "friends") && (!needle || s.name.toLowerCase().includes(needle)));
  const { shown: people, pager } = usePaged(found, needle); // a big institute: a page at a time
  const row = "flex items-center gap-3 rounded-[10px] bg-surface-container/60 px-3 py-2";
  const who = (s: (typeof others)[number]) => (
    <button type="button" onClick={() => onOpen(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <Avatar name={s.name} photo={s.photo} />
      <span className="flex min-w-0 flex-col"><b className="truncate">{s.name}</b><span className="truncate text-xs text-on-surface-variant">{lms.communityProfiles[s.id]?.bio || s.batch}</span></span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {received.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-bold">{C.requests(received.length)}</h2>
          {received.map((s) => (
            <div key={s.id} className={row}>
              {who(s)}
              <button type="button" onClick={() => lms.answerFriend(me, s.id, true)} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary">{C.accept}</button>
              <button type="button" onClick={() => lms.answerFriend(me, s.id, false)} className="rounded-full bg-white px-4 py-2 text-sm font-bold">{C.decline}</button>
            </div>
          ))}
        </section>
      )}
      <section className={card}>
        <h2 className="text-lg font-bold">{C.myFriends(friends.length)}</h2>
        {friends.length === 0 && <p className="text-sm text-on-surface-variant">{C.noFriends}</p>}
        <div className="flex flex-wrap gap-2">
          {friends.map((s) => (
            <button key={s.id} type="button" onClick={() => onOpen(s.id)} className="flex items-center gap-2 rounded-full bg-surface-container py-1 pl-1 pr-3 text-sm font-semibold">
              <Avatar name={s.name} photo={s.photo} size={28} /> {s.name}
            </button>
          ))}
        </div>
      </section>
      <section className={card}>
        <h2 className="text-lg font-bold">{C.people}</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={C.searchPh} aria-label={C.searchPh} className="h-11 rounded-full border border-outline bg-transparent px-4" />
        {people.map((s) => (
          <div key={s.id} className={row}>
            {who(s)}
            <FriendButton me={me} other={s.id} name={s.name} status={statusOf(s.id)} />
          </div>
        ))}
        {pager}
      </section>
    </div>
  );
}
