"use client";

import { BottomBar } from "@/components/BottomBar";
import { defaultTone } from "@/lib/theme";
import { REAL_AUTH } from "@/lib/auth-mode";
import { PdfHighlights } from "@/components/PdfHighlights";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, PlayIcon } from "@/components/Icon";
import { LangSwitch, Logo, TextSize } from "@/components/Brand";
import { DrawerItem, MobileDrawer } from "@/components/MobileDrawer";
import { QuizRunner } from "@/components/QuizRunner";
import { VideoPlayer } from "@/components/VideoPlayer";
import { LivePollBanner } from "@/components/LivePollBanner";
import { LiveClassStudent } from "@/components/LiveClassroom";
import { AiChat } from "@/components/student/AiChat";
import { AiStudyHub } from "@/components/student/AiStudyHub";
import { AI_ENABLED } from "@/lib/ai-plans";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { dayKey, fmtAgo, fmtDate, fmtDateTime, fmtDayNum, fmtMonth, fmtTime, fmtWeekday, fmtWhen, liveLabel, toDate } from "@/lib/dates";
import { levels, subjects, type ItemKind } from "@/lib/mock-data";
import { gradedResults, mistakes, myRank, noticesFor, quizResults, useLms, writtenResults } from "@/lib/lms-store";
import { StreakCard } from "@/components/student/StreakCard";
import { PointsSummary } from "@/components/dojo/PointsPanel";
import { StoryFeed } from "@/components/dojo/StoryFeed";
import { Portfolio } from "@/components/dojo/Portfolio";
import { TopicMastery } from "@/components/TopicMastery";
import { XP } from "@/lib/xp";
import { openDataUrl } from "@/lib/files";
import { MyQr } from "@/components/student/MyQr";
import { FileLink } from "@/components/FileLink";
import { HandwritingToText } from "@/components/student/HandwritingToText";
import { KeyPoints } from "@/components/student/KeyPoints";
import { useFlag } from "@/components/Platform";
import { PushToggle } from "@/components/PushToggle";
import { Community } from "@/components/community/Community";
import { RoutineCard } from "@/components/teacher/tools/RoutineTool";
import { StudentDoubts } from "@/components/teacher/tools/DoubtsTool";
import { Practice } from "@/components/student/Practice";
import { SubmitAssignment } from "@/components/student/SubmitAssignment";
import { getRole } from "@/lib/role";
import { logOut } from "@/lib/logout";

type Mode = "courses" | "explore";
type NavTab = "dashboard" | "courses" | "calendar" | "ai" | "community" | "inbox";

const kindStyle: Record<ItemKind, { icon: string; cls: string }> = {
  video: { icon: "video", cls: "bg-secondary-container text-on-secondary-container" },
  pdf: { icon: "file", cls: "bg-tertiary-container text-on-tertiary-container" },
  quiz: { icon: "exams", cls: "bg-primary-container text-on-primary-container" },
  task: { icon: "message", cls: "bg-surface-container text-on-surface" },
  exam: { icon: "award", cls: "bg-tertiary-container text-on-tertiary-container" },
};
const tagStyle = {
  inProgress: "bg-primary-container text-on-primary-container",
  new: "bg-tertiary-container text-on-tertiary-container",
  completed: "bg-secondary-container text-on-secondary-container",
};
const dot = { urgent: "bg-error", soon: "bg-tertiary", normal: "bg-primary" };
const thumbs = [
  "bg-primary text-white",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-primary-container text-on-primary-container",
  "bg-deep text-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary text-white",
];

export default function StudentPage() {
  const { t, lang } = useLang();
  const S = t.student;
  const T = t.teacher;
  const lms = useLms();
  const gameOn = useFlag("liveGame");
  const hwOn = useFlag("handwriting");

  const [mode, setMode] = useState<Mode>("courses");
  const [navTab, setNavTab] = useState<NavTab>("dashboard"); // children start on a simple home, not the course menu
  const [section, setSection] = useState(2); // "Modules"
  // Opened from a notification (?go=todo|results|notices|messages): straight to that part.
  useEffect(() => {
    const at = new URLSearchParams(location.search).get("go");
    const sec = ({ todo: 3, results: 5, notices: 1 } as Record<string, number>)[at ?? ""];
    if (at === "messages") setNavTab("inbox");
    else if (sec !== undefined) (setNavTab("courses"), setSection(sec));
  }, []);
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true, 2: true });
  const [chip, setChip] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState("all");
  const [activeChatId, setActiveChatId] = useState("");
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<{ moduleId: number; itemId: number } | null>(null);
  const [staffHome, setStaffHome] = useState<string | null>(null); // teacher / institute previewing the student view
  const [scanOpen, setScanOpen] = useState(false);
  const [hwOpen, setHwOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const r = getRole();
    setStaffHome(r === "teacher" ? "/teacher" : r === "institute" ? "/institute" : null);
  }, []);

  const me = lms.students.find((s) => s.id === lms.meId) ?? lms.students[0];
  const meId = me?.id ?? 0;
  useEffect(() => defaultTone(me?.gender), [me?.gender]);
  const myName = me?.name ?? t.login.roles.student;
  const course = me?.batch ?? "";
  const teacherName = lms.batches.find((b) => b.name === course)?.teacher ?? lms.teacherName;
  const live = lms.liveClass.batch === course ? lms.liveClass : null; // the live class belongs to one batch
  // The private chat with their own teacher always comes first (shown even before the first message), then the demo's
  // sample threads. Guardians' threads aren't shown to students.
  const ownChat = lms.chats.find((c) => c.id === `student-${meId}`);
  const chats = [
    { id: `student-${meId}`, name: teacherName, role: course, unread: 0, online: false, messages: ownChat?.messages ?? [] },
    ...lms.chats.filter((c) => !/^(parent|student)-/.test(c.id)),
  ];
  const announcements = noticesFor(lms.announcements, course); // also the notices for every batch
  const todos = lms.todos.filter((td) => td.batch === course);
  const calendar = lms.calendar.filter((e) => !e.batch || e.batch === course);

  const publishedModules = useMemo(() => lms.modules.filter((m) => m.published && m.batch === course), [lms.modules, course]);
  const allItems = useMemo(() => publishedModules.flatMap((m) => m.items.map((it) => ({ ...it, moduleId: m.id, moduleTitle: m.title }))), [publishedModules]);
  const doneCount = allItems.filter((it) => it.done).length;
  const progressPct = allItems.length ? Math.round((doneCount / allItems.length) * 100) : 0;

  const activeModule = active && lms.modules.find((m) => m.id === active.moduleId);
  const activeItem = activeModule?.items.find((it) => it.id === active?.itemId);

  const att = me ? lms.attendanceOf(me.id) : null;
  const rank = me ? 1 + lms.students.filter((s) => s.batch === me.batch && s.ch4Score > me.ch4Score).length : 0;
  const quizzes = quizResults(publishedModules, meId);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? chats[0];
  const totalUnread = chats.reduce((sum, c) => sum + c.unread, 0);

  const q = query.trim().toLowerCase();
  const matches = (title: string) => !q || title.toLowerCase().includes(q);

  const chips = [{ key: "all", label: S.all }, ...subjects.map((s) => ({ key: s, label: s })), ...levels.map((l) => ({ key: l, label: l })), { key: "free", label: S.free }];
  const videos = lms.exploreVideos.filter(
    (v) => (chip === "all" || v.subject === chip || v.level === chip || (chip === "free" && v.free)) && (!q || `${v.title} ${v.teacher} ${v.subject}`.toLowerCase().includes(q)),
  );

  const calendarDays = Array.from(new Set(calendar.map((e) => dayKey(toDate(e.start)))));
  const filteredEvents = selectedDay === "all" ? calendar : calendar.filter((e) => dayKey(toDate(e.start)) === selectedDay);

  const itemSub = (it: (typeof allItems)[number]) =>
    [it.kind === "quiz" && it.scores?.[meId] !== undefined ? t.quiz.taken(it.scores[meId], it.points ?? 30) : it.meta, it.dueDate ? S.dueOn(fmtDate(it.dueDate, lang)) : ""].filter(Boolean).join(" · ");

  const globalNavItems: { id: NavTab; icon: string; label: string; badge?: number }[] = [
    { id: "dashboard", icon: "home", label: t.kid.navHome },
    { id: "courses", icon: "book", label: t.kid.navClass },
    { id: "calendar", icon: "calendar", label: S.calendar },
    { id: "ai", icon: "sparkle", label: t.aichat.nav },
    { id: "community", icon: "users", label: t.community.nav },
    { id: "inbox", icon: "message", label: t.kid.navMessages, badge: totalUnread },
  ];

  const openItem = (moduleId: number, itemId: number) => setActive({ moduleId, itemId });
  // The first lesson (video / notes) not finished yet: one clear "what next" for the home page.
  const nextLesson = allItems.find((it) => !it.done && (it.kind === "video" || it.kind === "pdf"));
  const go = (tab: NavTab | "explore", sec?: number) => {
    if (tab === "explore") setMode("explore");
    else {
      setMode("courses");
      setNavTab(tab);
      if (sec !== undefined) setSection(sec);
    }
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };
  const mobileTitle =
    mode === "explore" ? S.explore : navTab === "courses" ? S.courseNav[section] : globalNavItems.find((i) => i.id === navTab)?.label;
  const searchBox = (
    <label className="flex h-12 w-full items-center gap-3 rounded-full border border-white/60 bg-surface-container px-5">
      <Icon name="search" size={20} strokeWidth={2} className="text-on-surface-variant" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Course search filters the module list, so make sure it's visible.
          if (mode === "courses") {
            setNavTab("courses");
            setSection(2);
          }
        }}
        placeholder={mode === "explore" ? S.searchExplore : S.searchCourse}
        aria-label={mode === "explore" ? S.searchExplore : S.searchCourse}
        className="min-w-0 flex-1 bg-transparent text-base outline-none"
      />
    </label>
  );

  const TodoList = ({ compact }: { compact?: boolean }) => (
    <>
      {todos.length === 0 && <p className="text-sm text-on-surface-variant">{S.noTodos}</p>}
      {todos.map((td) => (
        <button
          key={td.itemId}
          type="button"
          onClick={() => openItem(td.moduleId, td.itemId)}
          className={`flex items-center gap-3 text-left ${compact ? "rounded-[14px] border border-outline-variant bg-white p-3" : "rounded-xl bg-surface-container px-4 py-3"}`}
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[td.level]}`} />
          <span className="flex flex-1 flex-col">
            <span className="text-sm font-semibold">{td.title}</span>
            <span className="text-xs text-on-surface-variant">{td.dueDate ? S.dueOn(fmtDate(td.dueDate, lang)) : t.kinds[td.kind]}</span>
          </span>
        </button>
      ))}
    </>
  );


  return (
    <div className="flex min-h-dvh flex-col bg-surface md:h-dvh md:overflow-hidden">
      {/* Phone top bar (Canvas style): menu · title · avatar. The page itself scrolls. */}
      <header className="glass-header sticky top-0 z-30 flex h-14 items-center gap-2 px-2 md:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.common.menu} className="flex h-11 w-11 items-center justify-center rounded-full">
          <Icon name="menu" size={24} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-bold">{mobileTitle}</span>
          {mode === "courses" && navTab === "courses" && <span className="truncate text-xs text-on-surface-variant">{course}</span>}
        </div>
        <Link href="/settings" aria-label={t.settings.open} className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary-container font-bold text-on-tertiary-container">
          {myName.charAt(0)}
        </Link>
      </header>

      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className="flex items-center gap-3 px-2 pb-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-container text-lg font-bold text-on-tertiary-container">{myName.charAt(0)}</span>
          <span className="flex flex-col">
            <span className="font-bold">{myName}</span>
            <span className="text-xs text-on-surface-variant">{me?.batch}</span>
          </span>
        </div>
        {searchBox}
        <span className="mt-3 px-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">{course}</span>
        {S.courseNav.map((label, i) => (
          <DrawerItem
            key={label}
            icon={["home", "megaphone", "book", "file", "exams", "award", "file", "video", "sparkle", "message"][i]}
            label={label}
            active={mode === "courses" && navTab === "courses" && section === i}
            onClick={() => go("courses", i)}
          />
        ))}
        <div className="mt-3 flex flex-col gap-3 border-t border-outline-variant px-2 pt-4">
          {staffHome && (
            <Link href={staffHome} className="font-semibold text-primary">
              {S.instructorPanel}
            </Link>
          )}
          <LangSwitch />
          <TextSize />
          <Link href="/login" onClick={(e) => { e.preventDefault(); void logOut().then(() => location.assign("/login")); }} className="font-semibold text-primary">
            {t.common.logOut}
          </Link>
        </div>
      </MobileDrawer>

      <header className="glass-header hidden h-19 shrink-0 items-center gap-5 px-6 md:flex">
        <div className="flex items-center gap-2.5 md:w-56">
          <Logo href="/" name="lg" />
        </div>

        <div role="tablist" aria-label={S.mode} className="flex gap-1 rounded-full bg-surface-container p-1">
          {(["courses", "explore"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition-all ${mode === m ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"}`}
            >
              {m === "courses" ? <Icon name="book" size={18} strokeWidth={2} /> : <PlayIcon size={18} />}
              {m === "courses" ? S.myCourses : S.explore}
            </button>
          ))}
        </div>

        <div className="min-w-0 max-w-lg flex-1">{searchBox}</div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {staffHome && (
            <Link href={staffHome} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-outline-variant bg-white px-4 text-xs font-bold text-primary hover:bg-primary-container">
              {S.instructorPanel}
            </Link>
          )}
          <span className="hidden xl:contents"><TextSize /></span>
          <LangSwitch compact />
          <Link href="/settings" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tertiary-container font-bold text-on-tertiary-container" aria-label={t.settings.open} title={t.settings.open}>
            {myName.charAt(0)}
          </Link>
        </div>
      </header>

      {/* Item viewer: watch video / open PDF / take quiz / submit assignment */}
      {activeItem && activeModule && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 backdrop-blur-xs sm:items-center sm:p-4" onClick={() => setActive(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-title"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-[20px] border border-white bg-white p-5 shadow-2xl sm:rounded-[20px] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-primary">{activeModule.title}</span>
                <h2 id="item-title" className="text-xl font-bold">{activeItem.title}</h2>
                <span className="text-xs text-on-surface-variant">{t.kinds[activeItem.kind]}{activeItem.meta ? ` · ${activeItem.meta}` : ""}</span>
              </div>
              <button type="button" onClick={() => setActive(null)} aria-label={t.common.close} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container">
                <Icon name="close" size={18} />
              </button>
            </div>

            {activeItem.kind === "video" && <VideoPlayer url={activeItem.url} title={activeItem.title} viewer={me && `${me.name} · ${me.email || me.phone}`} onProgress={(sec, dur) => lms.recordWatch(activeItem.id, meId, sec, dur)} />}
            {activeItem.kind === "pdf" &&
              (activeItem.url ? (
                <FileLink url={activeItem.url} className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-tertiary-container px-5 text-sm font-bold text-on-tertiary-container">
                  <Icon name="file" size={18} /> {S.openPdf}
                </FileLink>
              ) : (
                <p className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">{S.pdfNoLink}</p>
              ))}
            {activeItem.kind === "pdf" && activeItem.url && <PdfHighlights url={activeItem.url} title={activeItem.title} />}
            {activeItem.kind === "pdf" && <KeyPoints title={activeItem.title} url={activeItem.url} />}
            {(activeItem.kind === "exam" || activeItem.kind === "task") && activeItem.paper && (
              <button type="button" onClick={() => openDataUrl(activeItem.paper!)} className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-tertiary-container px-5 text-sm font-bold text-on-tertiary-container">
                <Icon name="file" size={18} /> {t.exam.paperLink}
              </button>
            )}
            {(activeItem.kind === "task" || activeItem.kind === "exam") && (
              <SubmitAssignment
                sub={activeItem.submissions?.[meId]}
                points={activeItem.points ?? 20}
                rubric={activeItem.rubric}
                onSubmit={(sub) => lms.submitAssignment(activeModule.id, activeItem.id, meId, sub)}
              />
            )}
            {activeItem.kind === "exam" && activeItem.answerKey && activeItem.submissions?.[meId]?.grade !== undefined && (
              <button type="button" onClick={() => openDataUrl(activeItem.answerKey!)} className="self-start text-sm font-bold text-primary underline">
                {t.exam.keyLink}
              </button>
            )}
            {activeItem.kind === "quiz" && (
              <QuizRunner key={activeItem.id} item={activeItem} studentId={meId} onStart={() => lms.startQuiz(activeModule.id, activeItem.id, meId)} onSubmit={(score, marks, tabs, picks) => lms.submitQuiz(activeModule.id, activeItem.id, meId, score, marks, tabs, picks)} />
            )}
            {activeItem.kind === "quiz" && activeItem.scores?.[meId] !== undefined && (() => {
              // Only my own rank: students never see other children's names or marks (same rule as the merit list).
              const pos = myRank(activeItem, meId);
              return pos && <span className="self-start rounded-full bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container">{t.board.rank(pos.rank, pos.of)}</span>;
            })()}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setActive(null)} className="h-11 rounded-full border border-outline px-5 text-sm font-semibold">
                {t.common.close}
              </button>
              {!(activeItem.kind === "quiz" && activeItem.questions?.length) && activeItem.kind !== "task" && activeItem.kind !== "exam" && (
                <button
                  type="button"
                  onClick={() => {
                    lms.toggleItemDone(activeModule.id, activeItem.id, meId);
                    setActive(null);
                  }}
                  className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary"
                >
                  {activeItem.done ? S.markPending : S.markComplete}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === "courses" ? (
        <div className="flex min-h-0 flex-1">
          <nav data-slide aria-label={S.courses} className="glass-dark hidden w-22 shrink-0 flex-col items-center gap-3.5 pt-4 md:flex">
            {globalNavItems.map((item) => {
              const on = navTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNavTab(item.id)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-1 text-xs font-semibold transition-colors ${on ? "text-white" : "text-primary-container hover:text-white"}`}
                >
                  <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-all ${on ? "bg-primary-container text-on-primary-container shadow-sm" : ""}`}>
                    <Icon name={item.icon} size={20} />
                    {!!item.badge && (
                      <span className="absolute -right-0.5 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-tertiary-container px-1 text-[10px] font-extrabold text-on-tertiary-container">{item.badge}</span>
                    )}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* ============================== DASHBOARD ============================== */}
          {navTab === "dashboard" && (
            <main className="flex min-w-0 flex-1 flex-col [&>*]:shrink-0 gap-5 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-8 md:pt-6">
              <div>
                <h1 className="text-3xl font-bold">{t.kid.hi(myName.split(" ")[0])}</h1>
                <p className="mt-1 text-lg text-on-surface-variant">{t.kid.sub}</p>
              </div>

              {/* 1. The class: the most important thing to see */}
              {live && (
                <section className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-primary p-5 text-on-primary">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-primary-container">{t.kid.yourClass} · {liveLabel(t, lang, live.start)}</span>
                    <span className="text-xl font-bold">{live.topic}</span>
                    <span className="text-sm text-secondary-container">{teacherName} · {fmtDateTime(live.start, lang)}</span>
                  </div>
                  <button type="button" onClick={() => go("courses", 7)} className="inline-flex h-13 items-center gap-2 rounded-full bg-tertiary-container px-6 text-lg font-bold text-on-tertiary-container">
                    <Icon name="video" size={22} /> {S.joinClass}
                  </button>
                </section>
              )}

              {/* 2. Homework, then the next lesson */}
              <section className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                <h2 className="text-xl font-bold">{t.kid.homework}</h2>
                <TodoList />
              </section>
              <section className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                <h2 className="text-xl font-bold">{t.kid.keepLearning}</h2>
                {nextLesson ? (
                  <button type="button" onClick={() => openItem(nextLesson.moduleId, nextLesson.id)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface-container p-4 text-left">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${kindStyle[nextLesson.kind].cls}`}>
                      <Icon name={kindStyle[nextLesson.kind].icon} size={24} />
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className="text-lg font-bold">{nextLesson.title}</span>
                      <span className="text-sm text-on-surface-variant">{nextLesson.moduleTitle}</span>
                    </span>
                    <span className="rounded-full bg-primary px-4 py-2 font-bold text-on-primary">{S.actions[nextLesson.kind]}</span>
                  </button>
                ) : (
                  <p className="text-on-surface-variant">{allItems.some((it) => it.kind === "video" || it.kind === "pdf") ? t.kid.allLessonsDone : t.app.noChapters}</p>
                )}
              </section>

              {me && <LivePollBanner batch={me.batch} />}
              {AI_ENABLED ? (
                <AiStudyHub pdfs={allItems.filter((it) => it.kind === "pdf").map((it) => ({ id: it.id, title: it.title, meta: it.meta }))} />
              ) : (
                <button type="button" onClick={() => setNavTab("ai")} className="min-h-12 rounded-[16px] border border-outline-variant bg-white px-5 py-3 text-left text-sm font-bold text-primary">✨ {t.wip.aiOpen}</button>
              )}
              {me && <RoutineCard batch={me.batch} />}
              {me && <PushToggle role="student" batches={[me.batch]} />}

              {/* 3. Fun: streak, game, practice */}
              {me && <StreakCard studentId={me.id} />}
              <div className="grid grid-cols-2 gap-3">
                {gameOn && <Link href="/play" className="flex min-h-20 items-center justify-center gap-2 rounded-[16px] bg-tertiary-container p-4 text-center text-lg font-bold text-on-tertiary-container">
                  <Icon name="video" size={22} /> {t.kid.playGame}
                </Link>}
                <button type="button" onClick={() => go("courses", 8)} className="flex min-h-20 items-center justify-center gap-2 rounded-[16px] bg-secondary-container p-4 text-center text-lg font-bold text-on-secondary-container">
                  <Icon name="sparkle" size={22} /> {t.kid.practice}
                </button>
              </div>

              {/* 4. What the teacher said */}
              {me && (
                <div className="grid gap-5 lg:grid-cols-2">
                  <PointsSummary studentId={me.id} />
                  <StoryFeed batch={course} />
                </div>
              )}
              <section className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">{S.announcements}</h2>
                  <button type="button" onClick={() => go("courses", 1)} className="text-sm font-semibold text-primary">{t.common.seeAll}</button>
                </div>
                {announcements.slice(0, 2).map((a) => (
                  <div key={a.id} className="rounded-xl bg-surface-container px-4 py-3">
                    <span className="font-bold">{a.title}</span>
                    <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{a.body}</p>
                  </div>
                ))}
              </section>

              {/* 5. Tools, folded away so the home stays simple */}
              <details className="group rounded-[18px] border border-outline-variant bg-white p-5" open={scanOpen || hwOpen}>
                <summary className="flex cursor-pointer items-center justify-between text-lg font-bold">
                  {t.kid.myThings}
                  <span className="transition-transform group-open:rotate-180"><Icon name="chevronDown" /></span>
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-bold">{t.kp.myNotes}</h2>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" aria-expanded={scanOpen} onClick={() => setScanOpen((v) => !v)} className="rounded-full bg-secondary-container px-4 py-2 text-sm font-bold text-on-secondary-container">
                          {t.kp.scan}
                        </button>
                        {hwOn && <button type="button" aria-expanded={hwOpen} onClick={() => setHwOpen((v) => !v)} className="rounded-full bg-tertiary-container px-4 py-2 text-sm font-bold text-on-tertiary-container">
                          {t.hw.button}
                        </button>}
                      </div>
                    </div>
                    {scanOpen && <KeyPoints title={t.kp.myNotes} />}
                    {hwOn && hwOpen && <HandwritingToText />}
                    {lms.notes.length === 0 && <p className="text-sm text-on-surface-variant">{t.kp.noNotes}</p>}
                    {lms.notes.map((n) => (
                      <article key={n.id} className="flex flex-col gap-1 rounded-xl bg-surface-container px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{n.title}</span>
                          <span className="flex items-center gap-2 text-xs text-on-surface-variant">
                            {fmtWhen(n.at, lang)}
                            <button type="button" onClick={() => lms.deleteNote(n.id)} aria-label={`${t.common.remove} ${n.title}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-error-container">
                              <Icon name="trash" size={15} />
                            </button>
                          </span>
                        </div>
                        <p className="whitespace-pre-line text-sm">{n.text}</p>
                      </article>
                    ))}
                  </section>
                  {me && <Portfolio studentIds={[me.id]} canAdd />}
                  {me && <MyQr studentId={me.id} name={me.name} />}
                </div>
              </details>
            </main>
          )}

          {/* ============================== COURSE ============================== */}
          {navTab === "courses" && (
            <>
              <aside data-slide className="hidden w-58 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/70 bg-surface-container/40 px-3 py-6 backdrop-blur-xl lg:flex">
                <span className="px-3 text-[13px] text-on-surface-variant">{teacherName}</span>
                <span className="px-3 pb-3 text-lg font-bold leading-snug">{course}</span>
                {S.courseNav.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSection(i)}
                    aria-current={section === i ? "page" : undefined}
                    className={`h-11 rounded-full px-4 text-left text-[15px] transition-all ${section === i ? "bg-secondary-container font-bold text-on-secondary-container shadow-xs" : "text-on-surface-variant hover:bg-surface-container"}`}
                  >
                    {label}
                  </button>
                ))}
              </aside>

              <main className="flex min-w-0 flex-1 flex-col [&>*]:shrink-0 gap-4 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-8 md:pt-6">
                <div data-slide className="hidden gap-2 overflow-x-auto pb-1 md:flex lg:hidden">
                  {S.courseNav.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSection(i)}
                      aria-current={section === i ? "page" : undefined}
                      className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold ${section === i ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface-variant"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <span className="text-sm text-on-surface-variant">{section === 0 ? S.courseNav[0] : `${course} / ${S.courseNav[section]}`}</span>
                    <h1 className="text-3xl font-bold">{section === 0 ? course : S.courseNav[section]}</h1>
                  </div>
                  <div className="flex w-full items-center gap-3 sm:w-72">
                    <span className="whitespace-nowrap text-sm text-on-surface-variant">{S.progress}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="font-bold">{progressPct}%</span>
                  </div>
                </div>

                {/* Course home: who teaches it, when, and shortcuts into each section */}
                {section === 0 && (
                  <div className="flex flex-col gap-1 rounded-[18px] border border-outline-variant bg-white p-5">
                    <span className="text-sm font-semibold text-primary">{teacherName}</span>
                    <span className="text-2xl font-bold">{course}</span>
                    <span className="text-sm text-on-surface-variant">{lms.enrolledCourses.find((c) => c.title === course)?.schedule}</span>
                    <span className="text-sm text-on-surface-variant">{S.itemsDone(doneCount, allItems.length)}</span>
                  </div>
                )}

                {section === 0 && live && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-primary p-5 text-on-primary shadow-md">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-primary-container">{liveLabel(t, lang, live.start)}</span>
                      <span className="text-xl font-bold">{live.topic}</span>
                      <span className="text-sm text-secondary-container">{teacherName} · {fmtDateTime(live.start, lang)}</span>
                    </div>
                    <button type="button" onClick={() => setSection(7)} className="rounded-full bg-tertiary-container px-5 py-2.5 font-bold text-on-tertiary-container">{S.joinClass}</button>
                  </div>
                )}

                {section === 0 && (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                    {[
                      { i: 2, icon: "book", count: publishedModules.length },
                      { i: 1, icon: "megaphone", count: announcements.length },
                      { i: 3, icon: "file", count: allItems.filter((it) => it.kind === "task").length },
                      { i: 4, icon: "exams", count: allItems.filter((it) => it.kind === "quiz").length },
                      { i: 5, icon: "award" },
                      { i: 6, icon: "file", count: allItems.filter((it) => it.kind === "pdf").length },
                      { i: 7, icon: "video", count: allItems.filter((it) => it.kind === "video").length },
                    ].map((tile) => (
                      <button key={tile.i} type="button" onClick={() => setSection(tile.i)} className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-outline-variant bg-white p-4 text-left">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                            <Icon name={tile.icon} size={20} />
                          </span>
                          {tile.count !== undefined && <span className="text-sm font-bold text-on-surface-variant">{tile.count}</span>}
                        </span>
                        <span className="font-semibold [overflow-wrap:anywhere]">{S.courseNav[tile.i]}</span>
                      </button>
                    ))}
                  </div>
                )}

                {section === 1 && (
                  <div className="flex flex-col gap-3">
                    {announcements.length === 0 && <p className="text-on-surface-variant">{t.app.noNotices}</p>}
                    {announcements.filter((a) => matches(a.title)).map((a) => (
                      <div key={a.id} className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold">{a.title}</span>
                          {a.pinned && <span className="rounded-full bg-tertiary-container px-3 py-1 text-xs font-bold text-on-tertiary-container">{T.pinned}</span>}
                        </div>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{a.body}</p>
                        <span className="text-xs text-on-surface-variant">{T.postedBy(a.author, a.batch, fmtWhen(a.at, lang))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {section === 2 && publishedModules.length === 0 && <p className="text-on-surface-variant">{t.app.noChapters}</p>}
                {section === 2 &&
                  publishedModules.map((m) => {
                    const items = m.items.filter((it) => matches(it.title));
                    if (q && items.length === 0) return null;
                    const isOpen = !!q || !!open[m.id];
                    return (
                      <div key={m.id} className="overflow-hidden rounded-[18px] border border-outline-variant bg-white">
                        <button
                          type="button"
                          onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen }))}
                          aria-expanded={isOpen}
                          className={`flex w-full items-center gap-3.5 px-5 py-4 text-left ${isOpen ? "bg-surface-container/40" : ""}`}
                        >
                          <span className={`text-on-surface-variant transition-transform ${isOpen ? "" : "-rotate-90"}`}>
                            <Icon name="chevronDown" size={20} />
                          </span>
                          <span className="flex-1 text-lg font-bold">{m.title}</span>
                          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${tagStyle[m.tag]}`}>{S.tags[m.tag]}</span>
                        </button>
                        {isOpen &&
                          items.map((it) => (
                            <div key={it.id} className="flex items-center gap-3.5 border-t border-white/60 py-3 pl-5 pr-5 md:pl-14">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${kindStyle[it.kind].cls}`}>
                                <Icon name={kindStyle[it.kind].icon} size={18} />
                              </span>
                              <button type="button" onClick={() => openItem(m.id, it.id)} className="flex min-w-0 flex-1 flex-col text-left hover:underline">
                                <span className="font-semibold [overflow-wrap:anywhere]">{it.title}</span>
                                <span className="text-[13px] text-on-surface-variant [overflow-wrap:anywhere]">{itemSub({ ...it, moduleId: m.id, moduleTitle: m.title })}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openItem(m.id, it.id)}
                                className={`shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition-all ${it.done ? "bg-secondary-container text-on-secondary-container" : "border border-outline text-on-surface-variant hover:bg-primary hover:text-on-primary"}`}
                              >
                                {it.done ? t.common.done : S.actions[it.kind]}
                              </button>
                            </div>
                          ))}
                      </div>
                    );
                  })}

                {(section === 3 || section === 4 || section === 6) && (
                  <div className="flex flex-col gap-3">
                    {!allItems.some((it) => (section === 3 ? it.kind === "task" : section === 4 ? it.kind === "quiz" || it.kind === "exam" : it.kind === "pdf")) && (
                      <p className="text-on-surface-variant">{t.app.nothingYet}</p>
                    )}
                    {allItems
                      .filter((it) => (section === 3 ? it.kind === "task" : section === 4 ? it.kind === "quiz" || it.kind === "exam" : it.kind === "pdf") && matches(it.title))
                      .map((it) => (
                        <div key={it.id} className="flex items-center gap-3.5 rounded-[16px] border border-outline-variant bg-white p-4">
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kindStyle[it.kind].cls}`}>
                            <Icon name={kindStyle[it.kind].icon} size={20} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="font-bold">{it.title}</span>
                            <span className="text-xs text-on-surface-variant">{it.moduleTitle} · {itemSub(it)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => openItem(it.moduleId, it.id)}
                            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${it.done ? "bg-secondary-container text-on-secondary-container" : "bg-primary text-on-primary"}`}
                          >
                            {it.done ? t.common.done : S.actions[it.kind]}
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {section === 5 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                      <h2 className="text-lg font-bold">{S.scores}</h2>
                      {(REAL_AUTH
                        ? writtenResults(publishedModules, meId).map((r) => ({ label: r.title, score: r.score, points: r.points, sub: "" }))
                        : [
                            { label: S.ch4, score: me?.ch4Score ?? 0, points: 30, sub: t.parent.rank(rank) },
                            { label: S.ch3, score: me?.ch3Score ?? 0, points: 30, sub: "" },
                          ]
                      ).map((r) => (
                        <div key={r.label} className="flex items-center justify-between rounded-xl bg-surface-container px-4 py-3">
                          <div>
                            <div className="font-semibold">{r.label}</div>
                            {r.sub && <div className="text-xs text-on-surface-variant">{r.sub}</div>}
                          </div>
                          <span className="rounded-full bg-secondary-container px-3 py-1 text-sm font-extrabold text-on-secondary-container">{r.score} / {r.points}</span>
                        </div>
                      ))}
                      <h3 className="mt-2 font-bold">{S.quizResults}</h3>
                      {quizzes.length === 0 && <p className="text-sm text-on-surface-variant">{S.noQuizYet}</p>}
                      {quizzes.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-xl bg-surface-container px-4 py-3">
                          <span className="font-semibold">{r.title}</span>
                          <span className="rounded-full bg-primary-container px-3 py-1 text-sm font-extrabold text-on-primary-container">{r.score} / {r.points}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                      <h2 className="text-lg font-bold">{t.parent.weakTitle}</h2>
                      {quizzes.filter((r) => r.pct < 75).length === 0 && <p className="text-sm text-on-surface-variant">{t.parent.weakNone}</p>}
                      {quizzes.filter((r) => r.pct < 75).map((r) => (
                        <div key={r.id} className="flex items-center gap-3">
                          <span className="flex-1 text-sm font-medium">{r.title}</span>
                          <div className="h-2.5 w-28 overflow-hidden rounded-full bg-surface-container">
                            <div className={`h-full rounded-full ${r.pct < 50 ? "bg-error" : "bg-tertiary"}`} style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="w-10 text-right text-sm font-bold">{r.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {section === 5 && <TopicMastery modules={publishedModules} studentIds={[meId]} />}
                {section === 5 && (() => {
                  const results = gradedResults(publishedModules, meId);
                  return (
                    <section className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
                      <h2 className="text-lg font-bold">{t.exam.progress}</h2>
                      <p className="text-xs text-on-surface-variant">{t.exam.progressSub}</p>
                      {results.length === 0 && <p className="text-sm text-on-surface-variant">{t.exam.noProgress}</p>}
                      {results.map((r) => (
                        <div key={r.id} className="flex items-center gap-3">
                          <span className="w-40 shrink-0 truncate text-sm sm:w-56" title={r.title}>{r.title}</span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-container" role="img" aria-label={`${r.title}: ${r.pct}%`}>
                            <div className={`h-full rounded-full ${r.pct < 50 ? "bg-error" : r.pct < 75 ? "bg-tertiary" : "bg-primary"}`} style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="w-20 text-right text-sm font-bold">{r.score}/{r.points}</span>
                        </div>
                      ))}
                    </section>
                  );
                })()}

                {section === 7 && (
                  <div className="flex flex-col gap-3">
                    {me && <LiveClassStudent batch={me.batch} studentId={me.id} name={me.name} nextClass={live ? `${t.batch.nextLive}: ${live.topic} · ${fmtDateTime(live.start, lang)}` : undefined} />}
                    {live && <div className="flex flex-col gap-2 rounded-[18px] bg-primary p-5 text-on-primary">
                      <span className="text-sm text-secondary-container">{t.batch.nextLive} · {liveLabel(t, lang, live.start)}</span>
                      <span className="text-xl font-bold">{live.topic}</span>
                      <span className="text-sm text-secondary-container">{fmtDateTime(live.start, lang)}</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <a href={live.link} target="_blank" rel="noreferrer" className="rounded-full bg-tertiary-container px-5 py-2.5 text-sm font-bold text-on-tertiary-container">
                          {t.batch.joinZoom}
                        </a>
                      </div>
                    </div>}
                    <h2 className="mt-2 text-lg font-bold">{t.batch.recorded}</h2>
                    {allItems.filter((it) => it.kind === "video" && matches(it.title)).map((r) => (
                      <button key={r.id} type="button" onClick={() => openItem(r.moduleId, r.id)} className="flex items-center gap-3 rounded-[16px] border border-outline-variant bg-white p-3 text-left">
                        <span className="flex h-12 w-16 items-center justify-center rounded-xl bg-secondary-container text-primary">
                          <PlayIcon size={22} />
                        </span>
                        <span className="flex flex-1 flex-col">
                          <span className="font-semibold">{r.title}</span>
                          <span className="text-xs text-on-surface-variant">{r.moduleTitle}{r.meta ? ` · ${r.meta}` : ""}</span>
                        </span>
                        {r.done && <span className="text-xs font-bold text-primary">{t.common.done}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {section === 9 && me && <StudentDoubts studentId={me.id} batch={me.batch} />}
                {section === 8 && <Practice modules={publishedModules} mistakes={mistakes(publishedModules, meId)} onCorrect={() => lms.earnXp(meId, XP.practiceCorrect)} />}
              </main>

              <aside className="hidden w-80 shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-white/70 bg-surface-container/35 px-6 py-7 backdrop-blur-xl xl:flex">
                {live && <div className="flex flex-col gap-1.5 rounded-[28px_28px_28px_8px] bg-primary p-5 text-on-primary shadow-md">
                  <span className="text-[13px] text-primary-container">{liveLabel(t, lang, live.start)}</span>
                  <span className="text-lg font-bold">{live.topic}</span>
                  <button type="button" onClick={() => setSection(7)} className="mt-1.5 self-start rounded-full bg-tertiary-container px-4.5 py-2.5 font-bold text-on-tertiary-container">{S.joinClass}</button>
                </div>}
                <h2 className="mt-2 text-lg font-bold">{S.todo}</h2>
                <TodoList compact />
                <h2 className="mt-2 text-lg font-bold">{S.announcements}</h2>
                {announcements.slice(0, 2).map((a) => (
                  <div key={a.id} className="rounded-[14px] bg-tertiary-container p-3.5 text-xs leading-relaxed text-on-tertiary-container">
                    <div className="font-bold">{a.title}</div>
                    <div className="mt-1">{a.body}</div>
                  </div>
                ))}
              </aside>
            </>
          )}

          {/* ============================== CALENDAR ============================== */}
          {navTab === "calendar" && (
            <main className="flex min-w-0 flex-1 flex-col [&>*]:shrink-0 gap-5 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-8 md:pt-6">
              <div>
                <span className="text-sm text-on-surface-variant">{fmtMonth(new Date().toISOString(), lang)} · {S.calendarSub}</span>
                <h1 className="text-3xl font-bold">{S.calendar}</h1>
              </div>

              <div data-slide className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={selectedDay === "all"}
                  onClick={() => setSelectedDay("all")}
                  className={`h-10 rounded-full px-5 text-sm font-bold transition-all ${selectedDay === "all" ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface"}`}
                >
                  {S.all}
                </button>
                {calendarDays.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={selectedDay === d}
                    onClick={() => setSelectedDay(d)}
                    className={`h-10 rounded-full px-4 text-sm font-semibold transition-all ${selectedDay === d ? "bg-primary text-on-primary shadow-sm" : "border border-outline-variant bg-white text-on-surface"}`}
                  >
                    {fmtDate(d, lang)}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                {filteredEvents.map((ev) => (
                  <div key={ev.id} className="flex flex-wrap items-center gap-4 rounded-[18px] border border-outline-variant bg-white p-4 md:p-5">
                    <div className="flex h-15 w-15 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-on-primary">
                      <span className="text-xs font-semibold opacity-85">{fmtWeekday(ev.start, lang)}</span>
                      <span className="text-base font-extrabold">{fmtDayNum(ev.start, lang)}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold">{ev.title}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ev.kind === "live" ? "bg-primary-container text-on-primary-container" : ev.kind === "exam" ? "bg-tertiary-container text-on-tertiary-container" : "bg-secondary-container text-on-secondary-container"}`}
                        >
                          {t.kinds[ev.kind]}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-on-surface">
                        {ev.allDay ? fmtDate(ev.start, lang) : `${fmtTime(ev.start, lang)}${ev.end ? ` – ${fmtTime(ev.end, lang)}` : ""}`}
                      </span>
                      <span className="text-xs text-on-surface-variant">{ev.meta}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => go("courses", ev.kind === "live" ? 7 : ev.kind === "exam" ? 4 : 3)}
                      className="rounded-full bg-secondary-container px-5 py-2.5 text-sm font-bold text-on-secondary-container"
                    >
                      {ev.kind === "live" ? S.joinClass : t.common.open}
                    </button>
                  </div>
                ))}
              </div>
            </main>
          )}

          {navTab === "ai" && me && <AiChat meId={me.id} name={me.name} email={me.email} />}

          {/* ============================== COMMUNITY ============================== */}
          {navTab === "community" && me && (
            <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-10 md:pt-6 [&>*]:shrink-0">
              <div>
                <h1 className="text-3xl font-bold">{t.community.title}</h1>
                <p className="text-sm text-on-surface-variant">{t.community.sub}</p>
              </div>
              <div className="w-full max-w-2xl">
                <Community viewer={{ student: me.id }} />
              </div>
            </main>
          )}

          {/* ============================== INBOX ============================== */}
          {navTab === "inbox" && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-20 md:flex-row md:pb-0">
              <aside className="flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-white/70 bg-surface-container/40 p-4 backdrop-blur-xl md:w-80 md:overflow-y-auto md:border-b-0 md:border-r">
                <div className="px-2 pb-1">
                  <h1 className="text-2xl font-bold">{S.inbox}</h1>
                  <p className="text-xs text-on-surface-variant">{t.app.privateChat}</p>
                </div>
                <div className="flex gap-2 overflow-x-auto md:flex-col">
                  {chats.map((c) => {
                    const selected = c.id === activeChat?.id;
                    const last = c.messages[c.messages.length - 1];
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setActiveChatId(c.id); lms.markChatRead(c.id); }}
                        className={`flex min-w-60 items-center gap-3 rounded-[16px] p-3.5 text-left transition-all md:min-w-0 ${selected ? "bg-primary-container text-on-primary-container shadow-xs" : "border border-outline-variant bg-white hover:bg-surface-high"}`}
                      >
                        <div className="relative">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-on-primary">{c.name.charAt(0)}</span>
                          {c.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-primary" />}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold">{c.name}</span>
                            {c.unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">{c.unread}</span>}
                          </div>
                          <span className="truncate text-xs opacity-75">{c.role}</span>
                          <span className="mt-0.5 truncate text-xs opacity-90">{last?.text}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {!activeChat && <p className="flex flex-1 items-center justify-center p-8 text-center text-on-surface-variant">{t.app.noMessages}</p>}
              {activeChat && (
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <header className="flex items-center justify-between border-b border-white/70 bg-white/50 px-6 py-3.5 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-on-primary">{activeChat.name.charAt(0)}</span>
                      <div>
                        <div className="font-bold">{activeChat.name}</div>
                        <div className="text-xs text-on-surface-variant">{activeChat.online ? S.online : S.offline} · {activeChat.role}</div>
                      </div>
                    </div>
                  </header>
                  <div className="flex flex-1 flex-col gap-3 p-4 md:overflow-y-auto md:p-6">
                    {activeChat.messages.map((m) => (
                      <div key={m.id} className={`flex min-w-0 max-w-[min(32rem,100%)] flex-col gap-1 ${m.mine ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <span className="px-2 text-[11px] font-semibold text-on-surface-variant">{m.sender} · {fmtWhen(m.at, lang)}</span>
                        <div className={`rounded-[16px] px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] ${m.mine ? "rounded-br-xs bg-primary text-on-primary shadow-sm" : "rounded-bl-xs border border-outline-variant bg-white text-on-surface"}`}>{m.text}</div>
                      </div>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = draft.trim();
                      if (!text) return;
                      if (activeChat.id.startsWith("student-")) lms.sendStudentMessage(meId, text);
                      else lms.sendChatMessage(activeChat.id, myName, text, true);
                      setDraft("");
                    }}
                    className="glass-header sticky bottom-18 flex items-center gap-3 border-t border-white/70 px-4 py-3 md:static md:bg-white/50 md:px-6"
                  >
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={S.messagePh(activeChat.name)}
                      aria-label={S.messagePh(activeChat.name)}
                      className="h-12 flex-1 rounded-full border border-outline-variant bg-white px-5 text-sm outline-none focus:border-primary"
                    />
                    <button type="submit" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">
                      {t.common.send} <Icon name="arrow" size={16} />
                    </button>
                  </form>
                </section>
              )}
            </div>
          )}

        </div>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-5 [&>*]:shrink-0 px-4 pb-24 pt-4 md:overflow-y-auto md:px-8 md:pb-0 md:pt-5">
          <div className="md:hidden">{searchBox}</div>
          <div data-slide className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={chip === c.key}
                onClick={() => setChip(c.key)}
                className={`h-9.5 shrink-0 rounded-[10px] px-4 text-[15px] font-semibold ${chip === c.key ? "bg-on-surface text-surface" : "bg-surface-container text-on-surface"}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {videos.length === 0 && <p className="py-16 text-center text-lg text-on-surface-variant">{S.noResults}</p>}

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 pb-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v, i) => {
              const tone = thumbs[i % thumbs.length];
              return (
                <Link key={v.id} href={`/student/watch/${v.id}`} className="group flex flex-col gap-2.5">
                  <span className={`relative flex aspect-video items-center justify-center overflow-hidden text-center ${tone} ${i % 2 ? "rounded-[24px_24px_24px_6px]" : "rounded-2xl"}`}>
                    <span className="max-w-[80%] text-2xl font-bold leading-tight transition-transform group-hover:scale-105">{v.thumb}</span>
                    <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${v.free ? "bg-white text-primary" : "bg-on-tertiary-container text-tertiary-container"}`}>
                      {v.free ? S.free : S.joinBatch}
                    </span>
                    <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{v.length}</span>
                  </span>
                  <span className="flex gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}>{v.teacher.charAt(0)}</span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold leading-snug">{v.title}</span>
                      <span className="text-[13px] text-on-surface-variant">{v.teacher} · {v.level}</span>
                      <span className="text-[13px] text-on-surface-variant">{S.views(v.views)} · {fmtAgo(v.postedAt, lang)}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </main>
      )}

      {/* Phone tab bar (Canvas style): the four places used most, the rest under "More". */}
      <BottomBar
        label={S.courses}
        items={(["dashboard", "courses", "ai", "inbox", "calendar", "explore", "community"] as const).map((id) => {
          const it = id === "explore" ? { id, icon: "video", label: S.explore, badge: 0 } : globalNavItems.find((x) => x.id === id)!;
          return { ...it, on: id === "explore" ? mode === "explore" : mode === "courses" && navTab === id, go: () => go(id) };
        })}
      />
    </div>
  );
}
