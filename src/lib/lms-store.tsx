"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REAL_AUTH } from "./auth-mode";
import "./first-data"; // (the type of window.__firstData)
import { Loading } from "@/components/Loading";
import { dayKey, toDate } from "./dates";
import { blankState, idBase, makeActions, monthKey, rollFees, setIdBase, type LmsState } from "./lms-actions";
import { FEE_DUE_DAY, seed, type Batch, type CalendarEvent, type CourseModule, type ItemKind, type ModuleItem, type Payment, type Staff } from "./mock-data";
import { masteryLevel, type QuizQuestion } from "./quiz";
import { afterAnswer, answerWaits, claimOutboxes, LOCAL_ONLY, pullAfterSend, onceSoon, pullFromVersion, savedView, SERVER_FIRST, shownCopy } from "./data-access";
import { monthAttendance } from "./lms-views";

export type * from "./mock-data";
export { monthKey, type StudentInput } from "./lms-actions";

// v8: students have their own and their guardian's Gmail. Older saved demo data is ignored.
const STORAGE_KEY = "edunest-lms-state-v8";
const OUTBOX_KEY = "edunest-outbox-v1"; // each tab's queue is under OUTBOX_KEY:<tab id> (see claimOutboxes)
const TAB_KEY = "edunest-tab"; // this tab's id, in sessionStorage: a reload finds its own queue again
// Real accounts: what this person's screens last showed, kept on the device so the next visit opens at once (and
// without a connection) while the fresh copy is fetched. Removed at log-out, at every new sign-in, and whenever the
// server says they are not signed in. A very big view (the owner of a huge institute) is simply not kept.
export const VIEW_KEY = "edunest-last-view-v1";
const VIEW_MAX = 1_000_000; // characters: well inside a browser's 5 MB of storage
/** Is anyone signed in on this browser? (Supabase keeps the login in a cookie; visitors have none.) */
// The server's clock minus this device's, from each answer's Date header: a quiz countdown follows the server, whatever the device's clock is set to.
let skew = 0;
export const serverSkew = () => skew;
const clockFrom = (res: Response) => {
  const at = Date.parse(res.headers.get("date") ?? "");
  if (!Number.isNaN(at)) skew = at - Date.now();
};
const hasLogin = () => /(?:^|; )sb-[^=;]*-auth-token/.test(document.cookie);
export function forgetView() {
  try {
    localStorage.removeItem(VIEW_KEY);
  } catch {
    /* storage blocked: nothing was kept */
  }
}

export type Todo = { moduleId: number; itemId: number; batch: string; title: string; kind: ItemKind; dueDate?: string; level: "urgent" | "soon" | "normal" };
export type CalendarEntry = Omit<CalendarEvent, "id"> & { id: string; allDay?: boolean };

type Sent = { name: string; args: unknown[]; base: number };

function useLmsState() {
  const [state, setState] = useState<LmsState>(seed);
  const [ready, setReady] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const lastRoll = useRef(0); // several students added before a re-render must still get different roll numbers
  const [saveError, setSaveError] = useState<boolean | "suspended">(false); // "suspended": Instanton Campus suspended the institute

  // ---- Real accounts: the institute's data lives on the server; each action is sent there and checked.
  const version = useRef(0); // what the next download asks from
  const shown = useRef(shownCopy()).current; // which copy the screen shows (see shownCopy)
  const outbox = useRef<Sent[]>([]);
  const busy = useRef(false);
  // Changes not yet on the server are kept in this browser, so closing the tab while offline doesn't lose them.
  const owner = useRef(""); // whose changes they are: never sent from someone else's sign-in on the same browser
  const waits = useRef(answerWaits()).current; // screens waiting on a change's answer (see saved below)
  const outboxKey = useRef(""); // this tab's own place for its queue, set once the queues are claimed
  const keep = () => {
    if (!outboxKey.current) return; // still claiming: written right after
    try {
      if (outbox.current.length) localStorage.setItem(outboxKey.current, JSON.stringify({ owner: owner.current, items: outbox.current }));
      else localStorage.removeItem(outboxKey.current);
    } catch {
      /* shortcut: a change with a big file can pass the browser's 5 MB limit and is then kept only while the tab is open; move to IndexedDB if that bites */
    }
  };
  const keepSoon = useRef(onceSoon(() => keep())).current; // many changes in one click (an import) write the queue once; microtasks still run before the tab can close
  // The viewer (whose batches the owner is looking at) is this screen's choice, not saved data.
  const adopt = (server: LmsState) => setState((prev) => ({ ...blankState(), ...server, viewer: prev.viewer === "all" ? server.viewer : prev.viewer }));
  const cached = useRef(false); // showing the copy kept on this device, until the server's answer replaces it
  const pull = async () => {
    // The first load may already be on its way: the page's first script asked for it (see first-data.ts).
    const early = version.current === 0 ? window.__firstData : undefined;
    window.__firstData = undefined;
    const res = (await early) || (await fetch(`/api/data?v=${version.current}`, { cache: "no-store" }));
    clockFrom(res);
    if (res.status === 204) return true;
    if (res.status === 401) {
      forgetView(); // not signed in (any more), or taken off the list: nothing of theirs stays on the device or the screen
      cached.current = false;
      version.current = 0; // the next sign-in may be another institute, whose versions are lower
      shown.forget();
    }
    if (!res.ok) return false;
    const d = (await res.json()) as { state: LmsState; version: number; role?: string };
    if (!shown.take(d.version, `${d.role}:${d.state.meId}:${d.state.teacherLogin}:${d.state.instituteName}`)) return true; // a newer save already came back while this was on its way
    version.current = d.version;
    if (!owner.current) owner.current = `${d.role}:${d.state.meId}:${d.state.teacherLogin}:${d.state.instituteName}`;
    // Every download also picks up what closed tabs of this sign-in left unsent (the first one, this tab's own after a reload).
    const got = await claimQueues(owner.current);
    if (got.length) {
      outbox.current = busy.current ? [...outbox.current, ...got] : [...got, ...outbox.current]; // a send under way takes outbox[0]: never put anything before it
      keep();
      void flush();
    }
    if (!outbox.current.length) adopt(d.state);
    return true;
  };
  // Each tab holds a lock named after its queue until the browser closes or discards it; a tab takes over only the
  // queues whose lock nobody holds, one tab at a time, so a change is neither lost with a closed tab nor sent twice.
  const claimQueues = async (who: string): Promise<Sent[]> => {
    try {
      const locks = navigator.locks as LockManager | undefined;
      // No Web Locks (Safari before 15.4): every other tab counts as live, so only this tab's own queue comes back after a reload.
      const held = async () => (locks ? new Set(((await locks.query()).held ?? []).flatMap((l) => (l.name ? [l.name] : []))) : new Set(Object.keys(localStorage)));
      const first = !outboxKey.current; // only the first claim takes this tab's own queue (after a reload); later ones would send it twice
      if (first) {
        let id = sessionStorage.getItem(TAB_KEY);
        if (!id || (locks && (await held()).has(`${OUTBOX_KEY}:${id}`))) id = Math.random().toString(36).slice(2); // a duplicated tab copies sessionStorage: it needs its own id
        sessionStorage.setItem(TAB_KEY, id);
        void locks?.request(`${OUTBOX_KEY}:${id}`, () => new Promise(() => {})); // held for as long as this tab lives
        outboxKey.current = `${OUTBOX_KEY}:${id}`;
      }
      const take = async () => claimOutboxes<Sent>(localStorage, OUTBOX_KEY, first ? outboxKey.current : "", who, (await held()).add(outboxKey.current));
      return await (locks ? locks.request(`${OUTBOX_KEY}:claim`, take) : take()); // one tab at a time takes a closed tab's queue
    } catch {
      outboxKey.current ||= `${OUTBOX_KEY}:${Math.random().toString(36).slice(2)}`; // storage blocked: this tab's queue lives only while it is open
      return [];
    }
  };
  const flush = async () => {
    if (busy.current) return;
    busy.current = true;
    let refused = false;
    let stale = false;
    let last = 0;
    try {
      while (outbox.current.length) {
        const res = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbox.current[0]) });
        clockFrom(res);
        last = res.status;
        const what = afterAnswer(res.status);
        // Server busy, unreachable through a proxy, or the login needs renewing: keep the change and try again later.
        if (what === "wait") {
          waits.stop(outbox.current);
          setSaveError(res.status === 423 ? "suspended" : true); // suspended: kept until Instanton Campus lifts it
          break;
        }
        waits.settle(outbox.current.shift(), what);
        if (what === "drop") {
          refused = true; // only this one goes; the rest are still sent
          keep();
          continue;
        }
        keep();
        const d = savedView<LmsState>(await res.json());
        setSaveError(false);
        if (!d) {
          version.current = 0; // saved, but no data came back: keep the screen and ask for all of it
          stale = true;
          continue;
        }
        if (!shown.take(d.version, `${(d as { role?: string }).role}:${d.state.meId}:${d.state.teacherLogin}:${d.state.instituteName}`)) continue; // a download of a newer copy already landed
        version.current = d.version;
        if (!outbox.current.length) adopt(d.state);
      }
      if (refused) setSaveError(refused); // refused or failed: show what the server really has
      version.current = pullFromVersion(refused, version.current); // refused: ask for all of it, or the answer is 204 and the refused change stays on screen
      if (pullAfterSend(refused, stale, last)) await pull();
    } catch {
      waits.stop(outbox.current);
      setSaveError(true); // offline: what's left is sent with the next change or refresh
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (REAL_AUTH) {
      if (!hasLogin()) {
        // A visitor (nobody signed in on this browser): nothing to ask the server for, now or every 15 seconds.
        forgetView();
        setState(blankState());
        setReady(true);
      } else {
        try {
          const last = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as LmsState | null;
          if (last && Array.isArray(last.students)) {
            adopt(last); // their screens open with what they last showed; the fresh copy follows
            cached.current = true;
            setReady(true);
          }
        } catch {
          /* nothing usable kept: wait for the server as before */
        }
        pull()
          .then((ok) => ok || cached.current || setState(blankState())) // signed out: nothing (never the sample data)
          .catch(() => cached.current || setState(blankState())) // no connection: the kept copy stays, or nothing
          .finally(() => setReady(true));
      }
      // shortcut: polling every 15 s; switch to Supabase Realtime if classes get big.
      const timer = setInterval(() => {
        if (!hasLogin() || document.visibilityState !== "visible") return;
        if (outbox.current.length) void flush();
        else void pull().catch(() => {});
      }, 15_000);
      const online = () => void flush(); // back online: send what was waiting straight away
      window.addEventListener("online", online);
      return () => (clearInterval(timer), window.removeEventListener("online", online));
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState((prev) => ({ ...prev, ...(JSON.parse(raw) as Partial<LmsState>) }));
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || REAL_AUTH) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveError(false);
    } catch {
      setSaveError(true); // usually the 5 MB browser limit (big uploaded files)
    }
  }, [state, ready]);

  // Real accounts: keep what the screens show on the device (see VIEW_KEY), a moment after it last changed.
  const tooBig = useRef(false);
  useEffect(() => {
    if (!ready || !REAL_AUTH || tooBig.current) return;
    const timer = setTimeout(() => {
      if (!hasLogin() || !owner.current) return; // logged out meanwhile, or the server hasn't said who this is yet
      try {
        const text = JSON.stringify({ ...state, viewer: undefined }); // the viewer is this visit's choice, not kept
        if (text.length > VIEW_MAX) {
          tooBig.current = true;
          forgetView();
        } else localStorage.setItem(VIEW_KEY, text);
      } catch {
        forgetView(); // storage full or blocked: the next visit just waits for the server, as before
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [state, ready]);

  // New month's fees and late fines (the server does this itself with real accounts).
  useEffect(() => {
    if (!ready || REAL_AUTH) return;
    setState((s) => rollFees(s));
  }, [ready, state.feeMonth]);

  const set = (fn: (s: LmsState) => Partial<LmsState>) => setState((s) => ({ ...s, ...fn(s) }));
  const today = dayKey();
  const local = {
    ...makeActions({ set, get: () => latest.current, replace: setState, fresh: REAL_AUTH ? blankState : seed, lastRoll }),
    resetDemoData: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setState(seed());
    },
  };
  // With real accounts every change also goes to the server, which repeats it with the same new ids.
  const actions = REAL_AUTH
    ? (Object.fromEntries(
        Object.entries(local).map(([name, fn]) => [
          name,
          LOCAL_ONLY.has(name)
            ? fn
            : (...args: unknown[]) => {
                const base = Math.max(idBase(), Date.now()); // the server reads it as when the change was made, so it follows the clock (as the apps' does)
                setIdBase(base);
                const out = SERVER_FIRST.has(name) ? undefined : (fn as (...a: unknown[]) => unknown)(...args);
                outbox.current.push({ name, args, base });
                if (idBase() === base) setIdBase(base + 1); // made no new id: the next change still gets its own base, or the server takes it for a resend
                keepSoon();
                void flush();
                return out;
              },
        ]),
      ) as typeof local)
    : local;

  // Derived views: one source of truth, so deleting an item also removes its to-do and calendar entry.
  const derived = useMemo(() => {
    const absentToday = new Set(state.attendance[today] ?? []);
    const feeOf = new Map<string, number>(); // batch name → fee (the first batch with that name, as a search would find)
    for (const b of state.batches) if (!feeOf.has(b.name)) feeOf.set(b.name, b.fee);
    const lateDay = new Date().getDate() > FEE_DUE_DAY;
    const thisMonth = monthKey();
    const waiting = state.students.filter((s) => s.pending); // joined from a link, not accepted yet: not students until then
    const students = state.students.filter((s) => !s.pending).map((s) => ({
      ...s,
      present: !absentToday.has(s.id),
      // Late: owes more than one month, or this month's fee is past the due day (not in the month they joined).
      late: s.feeDue > 0 && ((lateDay && s.joined !== thisMonth) || s.feeDue > (feeOf.get(s.batch) ?? 0)),
    }));

    const published = state.modules.filter((m) => m.published);
    const dueItems = published.flatMap((m) => m.items.filter((it) => it.kind === "quiz" || it.kind === "task" || it.kind === "exam").map((it) => ({ ...it, moduleId: m.id, batch: m.batch })));
    const todos: Todo[] = dueItems
      .filter((it) => !it.done)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
      .map((it) => {
        const days = it.dueDate ? (toDate(it.dueDate).getTime() - toDate(today).getTime()) / 86400000 : Infinity;
        return { moduleId: it.moduleId, itemId: it.id, batch: it.batch, title: it.title, kind: it.kind, dueDate: it.dueDate, level: days <= 2 ? "urgent" : days <= 5 ? "soon" : "normal" };
      });

    const calendar: CalendarEntry[] = [
      ...state.calendarEvents.map((e) => ({ ...e, id: `e${e.id}` })),
      // Only a live class that was really scheduled (a new institute has none).
      ...(state.liveClass.batch && state.liveClass.topic
        ? [{ id: "live", title: `${state.liveClass.batch}: ${state.liveClass.topic}`, start: state.liveClass.start, meta: state.teacherName, kind: "live" as const, batch: state.liveClass.batch }]
        : []),
      ...dueItems
        .filter((it) => it.dueDate)
        .map((it) => ({ id: `i${it.id}`, title: it.title, start: it.dueDate!, meta: it.batch, kind: it.kind === "task" ? ("due" as const) : ("exam" as const), allDay: true, batch: it.batch })),
    ]
      .map((e) => ({ e, when: toDate(e.start).getTime() })) // each start time is read as a date once, not on every comparison
      .sort((a, b) => a.when - b.when)
      .map((x) => x.e);

    /** This month's attendance for a student, counting only their batch's class days that were recorded. */
    const classDaysOf = new Map<number, number[] | undefined>(); // student → their batch's class days
    const attendanceOf = (studentId: number) => {
      if (!classDaysOf.size) {
        const days = new Map<string, number[]>();
        for (const b of state.batches) if (!days.has(b.name)) days.set(b.name, b.classDays);
        for (const x of state.students) if (!classDaysOf.has(x.id)) classDaysOf.set(x.id, days.get(x.batch));
      }
      return monthAttendance(state.attendance, studentId, classDaysOf.get(studentId));
    };

    // Students by roll number, for screens that show many names (posts, merit lists): a look-up, not a search each time.
    const studentById = new Map<number, (typeof students)[number]>();
    for (const x of students) if (!studentById.has(x.id)) studentById.set(x.id, x);

    return { students, studentById, waiting, todos, calendar, attendanceOf };
  }, [state, today]);

  // The server's answer to the last change made: "sent", "wait" (offline, kept for later) or "drop" (refused). Without real accounts nothing is queued: "sent".
  const saved = () => waits.wait(outbox.current.at(-1));
  return { ...state, ...derived, ...actions, ready, saveError, saved };
}

type LmsContextType = ReturnType<typeof useLmsState>;
const LmsContext = createContext<LmsContextType | null>(null);

export function LmsProvider({ children }: { children: ReactNode }) {
  return <LmsContext.Provider value={useLmsState()}>{children}</LmsContext.Provider>;
}

/** Public pages with real accounts: the server's public slice of the institute (website, courses), not anyone's own data. */
export function PublicData({ children }: { children: ReactNode }) {
  const lms = useLms();
  const [, area, key] = usePathname().split("/");
  const query = !key ? "" : area === "t" ? `slug=${key}` : `batch=${key}`; // key is still URL-encoded
  const [slice, setSlice] = useState<Partial<LmsState> | null>(null);
  useEffect(() => {
    if (!REAL_AUTH) return;
    setSlice(null);
    fetch(`/api/public?${query}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then(setSlice);
  }, [query]);
  if (!REAL_AUTH) return children;
  const merged = { ...blankState(), ...slice };
  const students = merged.students.map((x) => ({ ...x, present: true, late: false }));
  // Nothing of whoever happens to be signed in belongs on a public page.
  return <LmsContext.Provider value={{ ...lms, ...merged, students, studentById: new Map(), waiting: [], ready: slice !== null }}>{children}</LmsContext.Provider>;
}

/** Renders children only after saved data has loaded, so screens never flash sample data or mismatch the server render. */
export function WhenReady({ children }: { children: ReactNode }) {
  // The mark is part of the page as it first arrives, so a slow phone shows it instead of an empty screen.
  return useLms().ready ? children : <Loading full />;
}

export function useLms() {
  const ctx = useContext(LmsContext);
  if (!ctx) throw new Error("useLms must be used inside LmsProvider");
  return ctx;
}

// Pure views of the data, shared with the phone apps.
export { monthAttendance, quizResults, quizBoard, itemScores, myRank, leagueRank, incomeByMonth, averagePct, payroll, gradedResults, topicMastery, mistakes, writtenResults, noticesFor } from "./lms-views";
