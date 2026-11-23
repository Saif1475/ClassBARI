"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REAL_AUTH } from "./auth-mode";
import "./first-data"; // (the type of window.__firstData)
import { Loading } from "@/components/Loading";
import { dayKey, toDate } from "./dates";
import { blankState, idBase, makeActions, monthKey, rollFees, type LmsState } from "./lms-actions";
import { FEE_DUE_DAY, seed, type Batch, type CalendarEvent, type CourseModule, type ItemKind, type ModuleItem, type Payment, type Staff } from "./mock-data";
import { masteryLevel, type QuizQuestion } from "./quiz";
import { LOCAL_ONLY, SERVER_FIRST } from "./data-access";
import { monthAttendance } from "./lms-views";

export type * from "./mock-data";
export { monthKey, type StudentInput } from "./lms-actions";

// v8: students have their own and their guardian's Gmail. Older saved demo data is ignored.
const STORAGE_KEY = "edunest-lms-state-v8";
const OUTBOX_KEY = "edunest-outbox-v1";
// Real accounts: what this person's screens last showed, kept on the device so the next visit opens at once (and
// without a connection) while the fresh copy is fetched. Removed at log-out, at every new sign-in, and whenever the
// server says they are not signed in. A very big view (the owner of a huge institute) is simply not kept.
export const VIEW_KEY = "edunest-last-view-v1";
const VIEW_MAX = 1_000_000; // characters: well inside a browser's 5 MB of storage
/** Is anyone signed in on this browser? (Supabase keeps the login in a cookie; visitors have none.) */
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
  const version = useRef(0);
  const outbox = useRef<Sent[]>([]);
  const busy = useRef(false);
  // Changes not yet on the server are kept in this browser, so closing the tab while offline doesn't lose them.
  const owner = useRef(""); // whose changes they are: never sent from someone else's sign-in on the same browser
  const tries = useRef(0);
  const keep = () => {
    try {
      if (outbox.current.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify({ owner: owner.current, items: outbox.current }));
      else localStorage.removeItem(OUTBOX_KEY);
    } catch {
      /* shortcut: a change with a big file can pass the browser's 5 MB limit and is then kept only while the tab is open; move to IndexedDB if that bites */
    }
  };
  // The viewer (whose batches the owner is looking at) is this screen's choice, not saved data.
  const adopt = (server: LmsState) => setState((prev) => ({ ...blankState(), ...server, viewer: prev.viewer === "all" ? server.viewer : prev.viewer }));
  const cached = useRef(false); // showing the copy kept on this device, until the server's answer replaces it
  const pull = async () => {
    // The first load may already be on its way: the page's first script asked for it (see first-data.ts).
    const early = version.current === 0 ? window.__firstData : undefined;
    window.__firstData = undefined;
    const res = (await early) || (await fetch(`/api/data?v=${version.current}`, { cache: "no-store" }));
    if (res.status === 204) return true;
    if (res.status === 401) {
      forgetView(); // not signed in (any more), or taken off the list: nothing of theirs stays on the device or the screen
      cached.current = false;
    }
    if (!res.ok) return false;
    const d = (await res.json()) as { state: LmsState; version: number; role?: string };
    version.current = d.version;
    if (!owner.current) {
      owner.current = `${d.role}:${d.state.meId}:${d.state.teacherLogin}:${d.state.instituteName}`;
      try {
        const saved = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "null") as { owner: string; items: Sent[] } | null;
        if (saved?.owner === owner.current && Array.isArray(saved.items)) outbox.current = [...saved.items, ...outbox.current];
        else localStorage.removeItem(OUTBOX_KEY);
      } catch {
        /* ignore corrupt storage */
      }
      if (outbox.current.length) void flush();
    }
    if (!outbox.current.length) adopt(d.state);
    return true;
  };
  const flush = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (outbox.current.length) {
        const res = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbox.current[0]) });
        // Server busy or unreachable through a proxy: keep the change and try again (a few times, so one bad change can't block the rest).
        if ((res.status >= 500 || res.status === 429) && ++tries.current < 5) {
          setSaveError(true);
          break;
        }
        tries.current = 0;
        outbox.current.shift();
        if (!res.ok) {
          const why = res.status === 403 ? ((await res.json().catch(() => ({}))) as { error?: string }).error : "";
          setSaveError(why === "suspended" ? "suspended" : true); // refused or failed: show what the server really has
          outbox.current = [];
          keep();
          await pull();
          break;
        }
        keep();
        const d = (await res.json()) as { state: LmsState; version: number };
        version.current = d.version;
        setSaveError(false);
        if (!outbox.current.length) adopt(d.state);
      }
    } catch {
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
                const base = idBase();
                const out = SERVER_FIRST.has(name) ? undefined : (fn as (...a: unknown[]) => unknown)(...args);
                outbox.current.push({ name, args, base });
                keep();
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

  return { ...state, ...derived, ...actions, ready, saveError };
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
