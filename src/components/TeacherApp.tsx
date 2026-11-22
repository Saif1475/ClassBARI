"use client";

import { BottomBar } from "@/components/BottomBar";
import { PdfHighlights } from "@/components/PdfHighlights";
import { REAL_AUTH } from "@/lib/auth-mode";
import { Gradebook } from "@/components/teacher/Gradebook";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { LangSwitch, Logo, TextSize } from "@/components/Brand";
import { DrawerItem, MobileDrawer } from "@/components/MobileDrawer";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { usePaged } from "@/components/Pager";
import { Loading } from "@/components/Loading";
import { dayFromToday, dayKey, fmtDate, fmtDayNum, fmtTime, fmtWeekday, fmtWhen, liveLabel, toLocalInput } from "@/lib/dates";
import { levels, subjects, taka, type ItemKind, type ModuleItem } from "@/lib/mock-data";
import { monthAttendance, useLms } from "@/lib/lms-store";
import { downloadCsv, openDataUrl, readAsDataUrl, uploadData } from "@/lib/files";
import { MAX_FILE_BYTES, saveFile } from "@/lib/file-store";
import { FileLink } from "@/components/FileLink";
import { CentreCard } from "@/components/teacher/CentreCard";
import { IncomeReport } from "@/components/teacher/IncomeReport";
import { RemindDialog } from "@/components/teacher/RemindDialog";
import { Submissions } from "@/components/teacher/Submissions";
import { FeeDialog } from "@/components/teacher/FeeDialog";
import { StudentsPage } from "@/components/teacher/StudentsPage";
import { ToolsPage } from "@/components/teacher/tools/ToolsPage";
import { Payroll } from "@/components/teacher/Payroll";
import { PointsPanel } from "@/components/dojo/PointsPanel";
import { StoryFeed } from "@/components/dojo/StoryFeed";
import { Portfolio } from "@/components/dojo/Portfolio";
import { TopicMastery } from "@/components/TopicMastery";
import { EXAM_PRESETS, parseQuiz, parseRubric } from "@/lib/quiz";
import { answerSheetQuestions } from "@/lib/question-import";
import { parseKey } from "@/lib/omr";
import { QuestionImport } from "@/components/teacher/QuestionImport";
import type { GameQuestion } from "@/lib/live-game";
import { logOut } from "@/lib/logout";
import { isBdMobile, waLink } from "@/lib/site";
import { useFlag } from "@/components/Platform";
import { SmsButton } from "@/components/teacher/SmsButton";
import { notifyBatch } from "@/components/PushToggle";
import { SeatBillingCard } from "@/components/teacher/SeatBillingCard";

// Screens opened now and then (the QR scanner, a live quiz, the live class room): their code is fetched when they open.
const QrAttendance = dynamic(() => import("@/components/teacher/QrAttendance").then((m) => m.QrAttendance));
const LiveHost = dynamic(() => import("@/components/game/LiveHost").then((m) => m.LiveHost));
const LiveControlRoom = dynamic(() => import("@/components/LiveClassroom").then((m) => m.LiveControlRoom), { loading: () => <Loading /> });

export type GlobalTab = "dashboard" | "students" | "courses" | "tools" | "calendar" | "inbox";
type CourseSection = "home" | "announcements" | "modules" | "assignments" | "quizzes" | "grades" | "people" | "fees" | "dojo" | "files" | "live";

const kindStyle: Record<ItemKind, { icon: string; cls: string }> = {
  video: { icon: "video", cls: "bg-secondary-container text-on-secondary-container" },
  pdf: { icon: "file", cls: "bg-tertiary-container text-on-tertiary-container" },
  quiz: { icon: "exams", cls: "bg-primary-container text-on-primary-container" },
  task: { icon: "message", cls: "bg-surface-container text-on-surface" },
  exam: { icon: "award", cls: "bg-tertiary-container text-on-tertiary-container" },
};

const input = "h-11 rounded-xl border border-outline bg-white px-4 text-sm text-on-surface outline-none";
const fieldLabel = "flex flex-col gap-1 text-xs font-bold text-on-surface-variant";

export default function TeacherApp({
  mode = "instructor",
  initialTab = "dashboard",
  initialSection = "modules",
}: {
  mode?: "institute" | "instructor";
  initialTab?: GlobalTab;
  initialSection?: CourseSection;
}) {
  const isInstitute = mode === "institute";
  const { t, lang } = useLang();
  const T = t.teacher;
  const S = t.student;
  const lms = useLms();
  const gameOn = useFlag("liveGame");
  const coursesOn = useFlag("publicCourses");
  const teacherName = lms.teacherName;

  const [navTab, setNavTab] = useState<GlobalTab>(initialTab);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("go") === "messages") setNavTab("inbox"); // opened from a notification
  }, []);
  const [section, setSection] = useState<CourseSection>(initialSection);
  const [pickedBatch, setActiveBatch] = useState(lms.batches[0]?.name ?? "");
  const [openModules, setOpenModules] = useState<Record<number, boolean>>({ 1: true, 2: true });
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const confirmed = (msg: string) => window.confirm(msg);

  // --- Module creation ---
  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");

  // --- Add item to module ---
  const [addingToModuleId, setAddingToModuleId] = useState<number | null>(null);
  const addFormRef = useRef<HTMLFormElement>(null);
  const formOpen = addingToModuleId !== null;
  useEffect(() => {
    if (formOpen) addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); // only when it opens
  }, [formOpen]);
  const [itemKind, setItemKind] = useState<ItemKind>("video");
  const [itemTitle, setItemTitle] = useState("");
  const [itemMeta, setItemMeta] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [itemPoints, setItemPoints] = useState("30");
  const [itemDue, setItemDue] = useState(dayFromToday(7));
  const [itemQuestions, setItemQuestions] = useState("");
  const [itemNegative, setItemNegative] = useState("0");
  const [itemShuffle, setItemShuffle] = useState(false);
  const [itemTimeLimit, setItemTimeLimit] = useState("");
  const [itemPassPct, setItemPassPct] = useState("33");
  const [itemAntiCheat, setItemAntiCheat] = useState(false);
  const [itemError, setItemError] = useState("");
  const [itemToExplore, setItemToExplore] = useState(true);
  const [itemFree, setItemFree] = useState(true);

  // --- Announcement ---
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annPinned, setAnnPinned] = useState(false);

  // --- Explore video ---
  const [vidTitle, setVidTitle] = useState("");
  const [vidSubject, setVidSubject] = useState("Physics");
  const [vidLevel, setVidLevel] = useState("HSC");
  const [vidLength, setVidLength] = useState("45:00");
  const [vidUrl, setVidUrl] = useState("");
  const [vidFree, setVidFree] = useState(true);
  const [vidModuleId, setVidModuleId] = useState<number>(lms.modules[0]?.id ?? 0);

  // --- Live class ---
  const [liveTopic, setLiveTopic] = useState(lms.liveClass.topic);
  const [liveStart, setLiveStart] = useState(toLocalInput(lms.liveClass.start));
  const [liveLink, setLiveLink] = useState(lms.liveClass.link);

  // --- New batch ---
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [batchDays, setBatchDays] = useState("Sat, Mon, Wed · 4:30 PM");
  const [batchSubject, setBatchSubject] = useState("Physics");
  const [batchFee, setBatchFee] = useState("1200");
  const [batchClassDays, setBatchClassDays] = useState<number[]>([6, 1, 3]);

  // --- Students ---
  const [studentFilter, setStudentFilter] = useState<"all" | "offline" | "online" | "due">("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [attDate, setAttDate] = useState(dayKey());
  const [showRemind, setShowRemind] = useState(false);
  const [feeFor, setFeeFor] = useState<number | null>(null);
  const [itemFile, setItemFile] = useState<File | null>(null); // uploaded PDF/video instead of a link
  const [vidFile, setVidFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0); // bump to clear file inputs
  const [saving, setSaving] = useState(false);
  const [itemRubric, setItemRubric] = useState("");
  const [liveQuiz, setLiveQuiz] = useState<{ title: string; questions: GameQuestion[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [paper, setPaper] = useState<{ name: string; data: string } | null>(null);
  const [answerKey, setAnswerKey] = useState<{ name: string; data: string } | null>(null);
  const [keyLetters, setKeyLetters] = useState(""); // MCQ on an uploaded paper: just the answers, e.g. "ABDC…"

  // --- Calendar ---
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState(dayFromToday(1));
  const [evStart, setEvStart] = useState("17:00");
  const [evEnd, setEvEnd] = useState("18:15");
  const [evKind, setEvKind] = useState<"live" | "exam" | "due">("live");

  // --- Inbox ---
  const [activeChatId, setActiveChatId] = useState<string>(lms.chats[0]?.id ?? "");
  const [chatDraft, setChatDraft] = useState("");
  const activeChat = lms.chats.find((c) => c.id === activeChatId) ?? lms.chats[0];
  const totalUnread = lms.chats.reduce((sum, c) => sum + c.unread, 0);

  // Coaching-centre mode: the owner sees every batch, a teacher only their own.
  // Logged in as an assigned teacher (not the owner): locked to their own batches, no institute money.
  const isOwner = isInstitute;
  useEffect(() => {
    if (!isOwner && lms.teacherLogin && lms.viewer !== lms.teacherLogin) lms.setViewer(lms.teacherLogin);
  }, [isOwner, lms.viewer, lms.teacherLogin]);
  const myName = isOwner ? teacherName : lms.teacherLogin || teacherName;
  const visibleBatches = isOwner && lms.viewer === "all" ? lms.batches : lms.batches.filter((b) => b.teacher === (isOwner ? lms.viewer : myName));
  const visibleNames = visibleBatches.map((b) => b.name);
  const visibleSet = new Set(visibleNames);
  const visibleStudents = lms.students.filter((s) => visibleSet.has(s.batch));
  const batch = visibleBatches.find((b) => b.name === pickedBatch) ?? visibleBatches[0];
  const activeBatch = batch?.name ?? "";
  const batchModules = useMemo(() => lms.modules.filter((m) => m.batch === activeBatch), [lms.modules, activeBatch]);
  const batchAnnouncements = lms.announcements.filter((a) => a.batch === activeBatch);
  const batchStudents = useMemo(() => lms.students.filter((s) => s.batch === activeBatch), [lms.students, activeBatch]);
  const absentOn = lms.attendance[attDate] ?? [];
  const isPresent = (id: number) => !absentOn.includes(id);
  const isClassDay = !batch || batch.classDays.includes(new Date(`${attDate}T00:00`).getDay());
  const presentCount = batchStudents.filter((s) => isPresent(s.id)).length;
  const offlineCount = batchStudents.filter((s) => s.mode === "offline").length;
  const onlineCount = batchStudents.length - offlineCount;
  const dueCount = batchStudents.filter((s) => s.feeDue > 0).length;
  const batchFeeDue = batchStudents.reduce((sum, s) => sum + s.feeDue, 0);

  // Dashboard totals across all batches.
  const now = new Date();
  const collectedMonth = lms.payments
    .filter((p) => {
      const d = new Date(p.at);
      return visibleNames.includes(p.batch) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + p.amount, 0);
  const totalDue = visibleStudents.reduce((sum, s) => sum + s.feeDue, 0);
  const allDueCount = visibleStudents.filter((s) => s.feeDue > 0).length;
  const paidPct = visibleStudents.length ? Math.round(((visibleStudents.length - allDueCount) / visibleStudents.length) * 100) : 0;
  const allPresent = visibleStudents.filter((s) => s.present).length;

  const attendanceList = batchStudents.filter((s) => !studentSearch.trim() || s.name.toLowerCase().includes(studentSearch.trim().toLowerCase()));
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return batchStudents.filter((s) => {
      if (studentFilter === "offline" && s.mode !== "offline") return false;
      if (studentFilter === "online" && s.mode !== "online") return false;
      if (studentFilter === "due" && s.feeDue === 0) return false;
      return !q || `${s.name} ${s.phone} ${s.id}`.toLowerCase().includes(q);
    });
  }, [batchStudents, studentFilter, studentSearch]);
  // Long lists a page at a time (10 / 20 / 50 / 100 a page); another batch, filter or search starts at page 1.
  const { shown: studentRows, pager: studentPager } = usePaged(filteredStudents, `${activeBatch}|${studentFilter}|${studentSearch}`);
  const { shown: attendanceRows, pager: attendancePager } = usePaged(attendanceList, `${activeBatch}|${studentSearch}`);

  const allItems = useMemo(() => batchModules.flatMap((m) => m.items.map((it) => ({ ...it, moduleId: m.id, moduleTitle: m.title }))), [batchModules]);

  const itemSub = (it: ModuleItem) =>
    [
      t.kinds[it.kind],
      it.kind === "quiz" ? (it.questions?.length ? T.questionsN(it.questions.length) : T.noQuestions) : it.meta,
      it.points ? T.marks(it.points) : "",
      it.dueDate ? S.dueOn(fmtDate(it.dueDate, lang)) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const openAddItem = (kind?: ItemKind, moduleId = batchModules[0]?.id) => {
    // A brand-new batch has no chapter yet: make a "General" one so "New quiz" etc. always open the form.
    if (moduleId === undefined) moduleId = lms.addModule(T.defaultChapter, activeBatch);
    if (kind) setItemKind(kind);
    setItemError("");
    setAddingToModuleId(moduleId);
  };

  const deleteItem = (moduleId: number, it: { id: number; title: string }) => {
    if (!confirmed(T.confirmDeleteItem(it.title))) return;
    lms.deleteModuleItem(moduleId, it.id);
    notify(T.toast.itemRemoved(it.title));
  };

  // Handlers
  const handleCreateModule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    lms.addModule(newModuleTitle.trim(), activeBatch);
    setNewModuleTitle("");
    setShowNewModule(false);
    notify(T.toast.moduleCreated);
  };

  const handleAddItemToModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingToModuleId === null || !itemTitle.trim()) return;
    const graded = itemKind === "quiz" || itemKind === "task" || itemKind === "exam";
    let questions;
    if (itemKind === "quiz" && paper && !itemQuestions.trim()) {
      // Questions are on the uploaded paper; students tick A–D for each number and it is marked from the key.
      const key = parseKey(keyLetters);
      if (!key) return setItemError(t.qimport.needKey);
      questions = answerSheetQuestions(key, t.qimport.questionN);
    } else if (itemKind === "quiz") {
      const parsed = parseQuiz(itemQuestions);
      if (parsed.badQuestion) return setItemError(T.quizError(parsed.badQuestion));
      if (parsed.questions.length === 0) return setItemError(T.quizNeedsQuestions);
      questions = parsed.questions;
    }
    const rubric = itemKind === "task" || itemKind === "exam" ? parseRubric(itemRubric) : [];
    if (rubric === null) return setItemError(t.rubric.bad);
    const title = itemTitle.trim();
    const moduleId = addingToModuleId;
    let url = itemUrl.trim() || undefined;
    if (itemFile && (itemKind === "video" || itemKind === "pdf")) {
      setSaving(true);
      try {
        url = await saveFile(itemFile);
      } catch {
        setSaving(false);
        return setItemError(T.uploadFailed);
      }
      setSaving(false);
    }
    lms.addModuleItem(moduleId, {
      kind: itemKind,
      title,
      meta: itemKind === "video" || itemKind === "pdf" ? itemMeta.trim() : "",
      url,
      points: graded ? Number(itemPoints) || 30 : undefined,
      dueDate: graded ? itemDue : undefined,
      questions,
      ...(itemKind === "quiz" && Number(itemNegative) > 0 ? { negative: Number(itemNegative) } : {}),
      ...(itemKind === "quiz" && itemShuffle ? { shuffle: true } : {}),
      ...(itemKind === "quiz" && Number(itemTimeLimit) > 0 ? { timeLimitMin: Number(itemTimeLimit) } : {}),
      ...(itemKind === "quiz" && Number(itemPassPct) > 0 ? { passPct: Number(itemPassPct) } : {}),
      ...(itemKind === "quiz" && itemAntiCheat ? { antiCheat: true } : {}),
      ...(rubric.length ? { rubric } : {}),
      ...(graded && paper ? { paper: paper.data, paperName: paper.name } : {}),
      ...(itemKind === "exam" && answerKey ? { answerKey: answerKey.data, answerKeyName: answerKey.name } : {}),
      publishToExplore: itemKind === "video" && itemToExplore,
      free: itemFree,
    });
    setOpenModules((prev) => ({ ...prev, [moduleId]: true }));
    if (graded) notifyBatch(activeBatch, t.push.newWork(t.kinds[itemKind]), title, "/student");
    setItemTitle("");
    setItemMeta("");
    setItemUrl("");
    setItemFile(null);
    setFileKey((k) => k + 1);
    setItemQuestions("");
    setItemNegative("0");
    setItemShuffle(false);
    setItemTimeLimit("");
    setItemPassPct("33");
    setItemAntiCheat(false);
    setItemRubric("");
    setPaper(null);
    setKeyLetters("");
    setAnswerKey(null);
    setItemError("");
    setAddingToModuleId(null);
    notify(T.toast.itemPosted(title));
  };

  const handlePostAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    lms.addAnnouncement({ title: annTitle.trim(), body: annBody.trim(), batch: activeBatch, pinned: annPinned });
    notifyBatch(activeBatch, annTitle.trim(), annBody.trim(), "/student");
    setAnnTitle("");
    setAnnBody("");
    setAnnPinned(false);
    notify(T.toast.annPosted);
  };

  const handlePostExploreVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidTitle.trim()) return;
    let url = vidUrl.trim() || undefined;
    if (vidFile) {
      setSaving(true);
      try {
        url = await saveFile(vidFile);
      } catch {
        setSaving(false);
        return notify(T.uploadFailed);
      }
      setSaving(false);
    }
    lms.addExploreVideo({
      title: vidTitle.trim(),
      subject: vidSubject,
      level: vidLevel,
      length: vidLength || "45:00",
      free: vidFree,
      url,
      moduleId: batchModules.some((m) => m.id === vidModuleId) ? vidModuleId : undefined,
    });
    setVidTitle("");
    setVidUrl("");
    setVidFile(null);
    setFileKey((k) => k + 1);
    notify(T.toast.videoPublished);
  };

  const handleSaveLiveClass = (e: React.FormEvent) => {
    e.preventDefault();
    lms.updateLiveClass({ batch: activeBatch, topic: liveTopic, start: new Date(liveStart).toISOString(), link: liveLink });
    notify(T.toast.liveUpdated);
  };

  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const name = batchName.trim();
    if (!name) return;
    lms.addBatch({ name, days: batchDays, classDays: batchClassDays, subject: batchSubject, fee: Math.max(0, Number(batchFee) || 0), lateFine: 0, teacher: lms.viewer === "all" ? teacherName : lms.viewer });
    setActiveBatch(name);
    setBatchName("");
    setShowNewBatch(false);
    notify(T.toast.batchCreated);
  };

  const handleCreateCalendarEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evTitle.trim()) return;
    lms.addCalendarEvent({
      title: evTitle.trim(),
      start: new Date(`${evDate}T${evStart}`).toISOString(),
      end: evEnd ? new Date(`${evDate}T${evEnd}`).toISOString() : undefined,
      meta: `${teacherName} · ${activeBatch}`,
      kind: evKind,
      batch: activeBatch,
    });
    setEvTitle("");
    notify(T.toast.eventAdded);
  };


  const exportCsv = () => {
    const { days } = monthAttendance(lms.attendance, -1, batch?.classDays); // -1: no student, just this month's class days
    const absent = new Map(days.map((d) => [d, new Set(lms.attendance[d])]));
    downloadCsv(`${batch?.id ?? "batch"}-${dayKey()}.csv`, [
      ["Roll", "Name", "Phone", "Mode", "Batch", "Fee due", ...(REAL_AUTH ? [] : ["Ch4 MCQ", "Ch3 model test"]), "Attendance %", ...days],
      ...batchStudents.map((s) => [
        s.id, s.name, s.phone, s.mode, s.batch, s.feeDue, ...(REAL_AUTH ? [] : [s.ch4Score, s.ch3Score]),
        lms.attendanceOf(s.id).pct,
        ...days.map((d) => (absent.get(d)!.has(s.id) ? "A" : "P")),
      ]),
    ]);
  };

  const courseNavItems: { id: CourseSection; icon: string; count?: number }[] = [
    { id: "home", icon: "home" },
    { id: "modules", icon: "book", count: batchModules.length },
    { id: "assignments", icon: "file", count: allItems.filter((i) => i.kind === "task").length },
    { id: "quizzes", icon: "exams", count: allItems.filter((i) => i.kind === "quiz" || i.kind === "exam").length },
    { id: "people", icon: "users", count: batchStudents.length },
    ...(isInstitute ? [{ id: "fees" as CourseSection, icon: "fees", count: dueCount }] : []),
    { id: "grades", icon: "award" },
    { id: "dojo", icon: "star", count: lms.story.filter((p) => p.batch === activeBatch).length },
    { id: "announcements", icon: "megaphone", count: batchAnnouncements.length },
    { id: "files", icon: "file", count: allItems.filter((i) => i.kind === "pdf").length },
    { id: "live", icon: "video", count: lms.exploreVideos.length },
  ];

  const globalNavItems: { id: GlobalTab; icon: string; label: string; badge?: number }[] = [
    { id: "dashboard", icon: "grid", label: S.dashboard },
    ...(isInstitute ? [{ id: "students" as GlobalTab, icon: "users", label: t.roster.nav }] : []),
    { id: "courses", icon: "book", label: T.courseStudio },
    { id: "tools", icon: "tool", label: t.tools.nav },
    { id: "calendar", icon: "calendar", label: S.calendar },
    { id: "inbox", icon: "message", label: S.inbox, badge: totalUnread },
  ];

  const todaysBatches = visibleBatches.filter((b) => b.classDays.includes(new Date().getDay()));
  const toMark = lms.modules
    .filter((m) => visibleNames.includes(m.batch))
    .flatMap((m) => m.items)
    .reduce((n, it) => n + Object.values(it.submissions ?? {}).filter((x) => x.grade === undefined).length, 0);
  const attention = [
    ...(isInstitute ? [{ n: allDueCount, label: t.tday.feesOwed(allDueCount), icon: "fees", go: () => goSection("fees") }] : []),
    { n: toMark, label: t.tday.toMark(toMark), icon: "exams", go: () => goSection("assignments") },
    { n: totalUnread, label: t.tday.unread(totalUnread), icon: "message", go: () => setNavTab("inbox") },
  ].filter((a) => a.n > 0);

  const goSection = (s: CourseSection) => {
    setNavTab("courses");
    setSection(s);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface md:h-dvh md:overflow-hidden">
      {toast && (
        <div role="status" className="ios-toast fixed bottom-22 right-6 z-50 flex items-center gap-3 rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-on-primary shadow-xl md:bottom-6">
          <Icon name="check" size={18} strokeWidth={2.5} />
          <span>{toast}</span>
          <Link href="/student" className="ml-2 rounded-full bg-tertiary-container px-3 py-1 text-xs font-extrabold text-on-tertiary-container">
            {T.toast.viewInStudent}
          </Link>
        </div>
      )}

      {/* Phone top bar (Canvas style): menu · title · avatar. The page itself scrolls. */}
      <header className="glass-header sticky top-0 z-30 flex h-14 items-center gap-2 px-2 md:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.common.menu} className="flex h-11 w-11 items-center justify-center rounded-full">
          <Icon name="menu" size={24} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-bold">{navTab === "courses" ? T.sections[section] : globalNavItems.find((i) => i.id === navTab)?.label}</span>
          <span className="truncate text-xs text-on-surface-variant">{activeBatch}</span>
        </div>
        <Link href="/settings" aria-label={t.settings.open} title={t.settings.open} className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-bold text-on-primary">
          {myName.charAt(0)}
        </Link>
      </header>

      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <select
          aria-label={T.selectBatch}
          value={activeBatch}
          onChange={(e) => setActiveBatch(e.target.value)}
          className="h-12 shrink-0 rounded-full border border-outline-variant bg-white px-4 text-sm font-bold text-on-surface outline-none"
        >
          {visibleBatches.map((b) => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
        <div className="grid shrink-0 grid-cols-2 gap-2 py-2">
          <button type="button" onClick={() => { goSection("modules"); openAddItem(); }} className="rounded-xl bg-primary px-3 py-3 text-sm font-bold text-on-primary">{T.postItem}</button>
          <button type="button" onClick={() => goSection("announcements")} className="rounded-xl bg-secondary-container px-3 py-3 text-sm font-bold text-on-secondary-container">{T.addAnnouncement}</button>
          <button type="button" onClick={() => goSection("live")} className="rounded-xl bg-tertiary-container px-3 py-3 text-sm font-bold text-on-tertiary-container">{T.postVideo}</button>
          <button type="button" onClick={() => { setNavTab("students"); setMenuOpen(false); }} className="rounded-xl border border-outline-variant bg-white px-3 py-3 text-sm font-bold">{T.addStudentBtn}</button>
        </div>
        <span className="mt-1 px-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">{T.courseStudio}</span>
        {courseNavItems.map((item) => (
          <DrawerItem key={item.id} icon={item.icon} label={T.sections[item.id]} active={navTab === "courses" && section === item.id} onClick={() => goSection(item.id)} />
        ))}
        <div className="mt-3 flex flex-col gap-3 border-t border-outline-variant px-2 pt-4">
          <Link href="/student" className="font-semibold text-primary">{T.studentView}</Link>
          <TextSize />
          <LangSwitch />
          <Link href="/login" onClick={(e) => { e.preventDefault(); void logOut().then(() => location.assign("/login")); }} className="font-semibold text-primary">{T.switchRole}</Link>
        </div>
      </MobileDrawer>

      {isInstitute && feeFor !== null && <FeeDialog studentId={feeFor} onClose={() => setFeeFor(null)} onDone={notify} />}
      {scanning && <QrAttendance students={batchStudents} onPresent={(id) => lms.markPresent(id, attDate)} onClose={() => setScanning(false)} />}
      {liveQuiz && <LiveHost title={liveQuiz.title} questions={liveQuiz.questions} onClose={() => setLiveQuiz(null)} />}
      {isInstitute && showRemind && <RemindDialog students={batchStudents.filter((s) => s.feeDue > 0)} onClose={() => setShowRemind(false)} />}
      {lms.saveError && <div role="alert" className="bg-error-container px-4 py-2 text-center text-sm font-semibold text-on-error-container">{lms.saveError === "suspended" ? t.auth.suspended : REAL_AUTH ? t.auth.syncFailed : t.sub.storageFull}</div>}

      <header className="glass-header hidden min-h-19 shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 px-6 py-2.5 md:flex">
        <div className="flex items-center gap-3">
          <Logo href="/" />
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${isInstitute ? "bg-tertiary-container text-on-tertiary-container" : "bg-primary-container text-on-primary-container"}`}>
            {isInstitute ? t.exam2.instituteAdmin : T.studio}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={T.selectBatch}
            value={activeBatch}
            onChange={(e) => setActiveBatch(e.target.value)}
            className="h-11 rounded-full border border-outline-variant bg-white px-4 text-base font-bold text-on-surface outline-none"
          >
            {visibleBatches.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name} ({T.studentsN(lms.students.filter((s) => s.batch === b.name).length)})
              </option>
            ))}
          </select>
          <button type="button" onClick={() => { goSection("modules"); openAddItem(); }} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-base font-bold text-on-primary shadow-xs">
            <Icon name="plus" size={18} strokeWidth={2.4} /> {T.postItem}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <Link href="/student" className="inline-flex h-10 items-center gap-2 rounded-full border border-primary bg-white px-4 text-sm font-bold text-primary transition-colors hover:bg-primary-container">
            <Icon name="eye" size={17} />
            <span className="hidden sm:inline">{T.studentView}</span>
          </Link>
          <TextSize />
          <LangSwitch compact />
          <Link
            href="/settings"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary font-bold text-on-primary"
            title={t.settings.open}
            aria-label={t.settings.open}
          >
            {myName.charAt(0)}
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav data-slide aria-label={T.studio} className="glass-dark hidden w-22 shrink-0 flex-col items-center gap-4 pt-5 md:flex">
          {globalNavItems.map((item) => {
            const on = navTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setNavTab(item.id)}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-1 text-center text-xs font-semibold transition-colors ${on ? "text-white" : "text-primary-container hover:text-white"}`}
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
          <main className="flex min-w-0 flex-1 flex-col [&>*]:shrink-0 gap-6 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-10 md:pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-sm text-on-surface-variant">{T.greeting} {myName}</span>
                <h1 className="text-3xl font-bold">{T.dashboardTitle}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                {isInstitute && (
                <button type="button" onClick={() => setShowNewBatch((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-on-primary">
                  <Icon name="plus" size={18} /> {T.newBatch}
                </button>
                )}
                {!REAL_AUTH && (
                  <button
                    type="button"
                    onClick={() => confirmed(T.confirmReset) && lms.resetDemoData()}
                    className="h-11 rounded-full border border-outline px-4 text-xs font-semibold text-on-surface-variant"
                  >
                    {T.resetDemo}
                  </button>
                )}
              </div>
            </div>

            {showNewBatch && (
              <form onSubmit={handleCreateBatch} className="flex flex-wrap items-end gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                <label className={`${fieldLabel} min-w-52 flex-1`}>
                  {T.batchTitle}
                  <input required value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder={T.batchTitlePh} className={input} />
                </label>
                <label className={`${fieldLabel} w-40`}>
                  {T.subject}
                  <select value={batchSubject} onChange={(e) => setBatchSubject(e.target.value)} className={input}>
                    {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className={`${fieldLabel} min-w-48 flex-1`}>
                  {T.schedule}
                  <input value={batchDays} onChange={(e) => setBatchDays(e.target.value)} className={input} />
                </label>
                <label className={`${fieldLabel} w-32`}>
                  {T.monthlyFee}
                  <input type="number" min={0} value={batchFee} onChange={(e) => setBatchFee(e.target.value)} className={input} />
                </label>
                <ClassDays label={t.att.classDays} names={t.att.weekdays} value={batchClassDays} onChange={setBatchClassDays} />
                <button type="submit" className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">{T.createBatch}</button>
              </form>
            )}

            {/* Today: what a teacher needs first */}
            <section className="flex flex-col gap-3 rounded-[20px] bg-primary p-5 text-on-primary">
              <h2 className="text-xl font-bold">{t.tday.today} · {fmtDate(dayKey(), lang)}</h2>
              {todaysBatches.length === 0 && <p className="text-secondary-container">{t.tday.noClass}</p>}
              {todaysBatches.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/12 p-3">
                  <span className="flex flex-1 flex-col">
                    <span className="text-lg font-bold">{b.name}</span>
                    <span className="text-sm text-secondary-container">{b.days}</span>
                  </span>
                  <button type="button" onClick={() => { setActiveBatch(b.name); goSection("people"); }} className="h-12 rounded-full bg-white px-5 text-base font-bold text-primary">
                    {t.tday.takeAttendance}
                  </button>
                  {lms.liveClass.batch === b.name && (
                    <a href={lms.liveClass.link} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-tertiary-container px-5 text-base font-bold text-on-tertiary-container">
                      <Icon name="video" size={18} /> {t.tday.startLive}
                    </a>
                  )}
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2 rounded-[20px] border border-outline-variant bg-white p-5">
              <h2 className="text-xl font-bold">{t.tday.attention}</h2>
              {attention.length === 0 && <p className="text-on-surface-variant">{t.tday.allClear}</p>}
              {attention.map((a) => (
                <button key={a.label} type="button" onClick={a.go} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-4 py-3 text-left text-base font-semibold">
                  <span className="flex items-center gap-3"><Icon name={a.icon} size={20} className="text-primary" /> {a.label}</span>
                  <Icon name="chevronRight" size={20} />
                </button>
              ))}
            </section>

            <div>
              <h2 className="mb-3 text-lg font-bold">{T.quickPublish}</h2>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: "book", tone: "bg-primary-container text-on-primary-container", title: T.qpModule, sub: T.qpModuleSub, go: () => { goSection("modules"); openAddItem(); } },
                  { icon: "megaphone", tone: "bg-tertiary-container text-on-tertiary-container", title: T.qpAnn, sub: T.qpAnnSub, go: () => goSection("announcements") },
                  { icon: "video", tone: "bg-secondary-container text-on-secondary-container", title: T.qpVideo, sub: T.qpVideoSub, go: () => goSection("live") },
                  { icon: "sparkle", tone: "bg-primary-container text-on-primary-container", title: T.qpQuiz, sub: T.qpQuizSub, go: () => { goSection("quizzes"); openAddItem("quiz"); } },
                ].map((c) => (
                  <button key={c.title} type="button" onClick={c.go} className="flex flex-col items-start gap-2 rounded-[18px] border border-outline-variant bg-white p-5 text-left transition-transform hover:-translate-y-0.5">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.tone}`}>
                      <Icon name={c.icon} size={22} />
                    </span>
                    <span className="text-base font-bold">{c.title}</span>
                    <span className="text-xs text-on-surface-variant">{c.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-xl font-bold">{T.myBatches}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleBatches.map((b, i) => (
                  <div key={b.id} className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
                    <div className="flex items-center justify-between">
                      <span className={`flex h-12 w-12 items-center justify-center font-bold ${i % 2 ? "rounded-full bg-secondary-container text-on-secondary-container" : "rounded-xl bg-primary-container text-on-primary-container"}`}>{b.short}</span>
                      <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container">{T.published}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{b.name}</h3>
                      <p className="text-xs text-on-surface-variant">{b.subject ? `${b.subject} · ` : ""}{b.days} · {T.studentsN(lms.students.filter((s) => s.batch === b.name).length)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setActiveBatch(b.name); goSection("modules"); }} className="h-11 flex-1 rounded-full bg-primary text-sm font-bold text-on-primary">{T.openStudio}</button>
                      <button type="button" onClick={() => { setActiveBatch(b.name); goSection("people"); }} className="h-11 rounded-full bg-surface-container px-4 text-sm font-bold text-on-surface">{T.attendance}</button>
                    </div>
                    {isInstitute && <details className="group">
                      <summary className="cursor-pointer text-sm font-bold text-primary">{t.tday.batchSettings}</summary>
                      <div className="mt-3 flex flex-col gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                      {T.feePerMonth} ৳
                      <input
                        type="number"
                        min={0}
                        defaultValue={b.fee}
                        key={b.fee}
                        onBlur={(e) => {
                          const fee = Math.max(0, Number(e.target.value) || 0);
                          if (fee !== b.fee) {
                            lms.updateBatch(b.id, { fee });
                            notify(T.feeSaved);
                          }
                        }}
                        className="h-9 w-24 rounded-[10px] border border-outline bg-white px-2.5 text-sm font-bold text-on-surface"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                      {t.centre.teacher}
                      <select value={b.teacher} onChange={(e) => lms.updateBatch(b.id, { teacher: e.target.value })} className="h-9 flex-1 rounded-[10px] border border-outline bg-white px-2 text-sm text-on-surface">
                        {lms.staff.map((st) => <option key={st.name} value={st.name}>{st.name}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                      {t.fees.lateFine}
                      <input
                        type="number"
                        min={0}
                        defaultValue={b.lateFine}
                        key={`f${b.lateFine}`}
                        onBlur={(e) => lms.updateBatch(b.id, { lateFine: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-9 w-24 rounded-[10px] border border-outline bg-white px-2.5 text-sm font-bold text-on-surface"
                      />
                    </label>
                    <ClassDays label={t.att.classDays} names={t.att.weekdays} value={b.classDays} onChange={(classDays) => lms.updateBatch(b.id, { classDays })} />
                    <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                      <input type="checkbox" checked={!!b.public} onChange={(e) => lms.updateBatch(b.id, { public: e.target.checked })} className="h-4 w-4 accent-primary" />
                      {t.courses.publicToggle}
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
                      <input type="checkbox" checked={!b.hideLeague} onChange={(e) => lms.updateBatch(b.id, { hideLeague: !e.target.checked })} className="h-4 w-4 accent-primary" />
                      {t.streak.leagueToggle}
                    </label>
                    {b.public && (
                      <>
                        <textarea
                          rows={2}
                          defaultValue={b.about}
                          key={`a${b.about}`}
                          onBlur={(e) => lms.updateBatch(b.id, { about: e.target.value.trim() })}
                          placeholder={t.courses.about}
                          aria-label={t.courses.about}
                          className="rounded-[10px] border border-outline bg-white p-2 text-xs"
                        />
                        {coursesOn && <Link href={`/courses/${b.id}`} className="self-start text-xs font-bold text-primary underline">{t.courses.openPublic}</Link>}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${b.id}`).then(() => notify(t.centre.inviteCopied))}
                      className="self-start text-xs font-bold text-primary underline"
                    >
                      {t.centre.invite}
                    </button>
                      </div>
                    </details>}
                  </div>
                ))}
              </div>
            </div>

            {/* Money: totals, income, payroll — Institute Owner ONLY (never visible to instructors) */}
            {isInstitute && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">{t.tday.money}</h2>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    {t.centre.viewing}
                    <select
                      value={lms.viewer}
                      onChange={(e) => lms.setViewer(e.target.value)}
                      className="h-10 rounded-full border border-outline-variant bg-white px-4 text-sm font-semibold text-on-surface outline-none"
                    >
                      <option value="all">{t.centre.owner}</option>
                      {lms.staff.map((st) => <option key={st.name} value={st.name}>{st.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 rounded-[18px] bg-secondary-container p-5 text-on-secondary-container">
                    <span className="text-sm font-medium">{T.collectedMonth}</span>
                    <span className="text-3xl font-extrabold">{taka(collectedMonth)}</span>
                    <span className="text-xs">{T.paidPct(paidPct)}</span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-[18px] bg-tertiary-container p-5 text-on-tertiary-container">
                    <span className="text-sm font-medium">{T.feesDueMonth}</span>
                    <span className="text-3xl font-extrabold">{taka(totalDue)}</span>
                    <span className="text-xs">{T.pendingN(allDueCount)}</span>
                  </div>
                </div>

                <SeatBillingCard totalStudents={lms.students.length} />
                <IncomeReport batchNames={visibleNames} />
                {lms.viewer === "all" && <Payroll onDone={notify} />}
                {lms.viewer === "all" && <CentreCard />}
              </>
            )}
          </main>
        )}

        {/* ============================== COURSE STUDIO ============================== */}
        {navTab === "courses" && (
          <>
            <aside data-slide className="hidden w-62 shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/70 bg-surface-container/40 px-3 py-5 backdrop-blur-xl lg:flex">
              <div className="px-3 pb-3">
                <div className="text-lg font-bold leading-snug">{activeBatch}</div>
                <div className="text-xs text-on-surface-variant">{T.courseSummary(batchModules.length, batchStudents.length)}</div>
              </div>
              {courseNavItems.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-11 items-center justify-between rounded-full px-4 text-left text-sm transition-all ${active ? "bg-secondary-container font-bold text-on-secondary-container shadow-xs" : "font-medium text-on-surface-variant hover:bg-surface-container"}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon name={item.icon} size={18} />
                      {T.sections[item.id]}
                    </span>
                    {item.count !== undefined && <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{item.count}</span>}
                  </button>
                );
              })}
            </aside>

            <main className="flex min-w-0 flex-1 flex-col [&>*]:shrink-0 gap-5 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-10 md:pt-6">
              <div className="hidden gap-2 overflow-x-auto pb-1 md:flex lg:hidden">
                {courseNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`h-9 shrink-0 rounded-full px-4 text-xs font-bold ${section === item.id ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface-variant"}`}
                  >
                    {T.sections[item.id]}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/70 pb-4">
                <div>
                  <span className="text-xs font-semibold text-on-surface-variant">{section === "home" ? T.sections.home : `${activeBatch} / ${T.sections[section]}`}</span>
                  <h1 className="text-3xl font-bold">{section === "home" ? activeBatch : T.sections[section]}</h1>
                </div>
                {section === "modules" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setShowNewModule((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-on-primary shadow-sm">
                      <Icon name="plus" size={18} strokeWidth={2.4} /> {T.module}
                    </button>
                    <button type="button" onClick={() => openAddItem()} className="inline-flex h-11 items-center gap-2 rounded-full bg-secondary-container px-5 text-sm font-bold text-on-secondary-container">
                      <Icon name="plus" size={18} /> {T.addItem}
                    </button>
                  </div>
                )}
              </div>

              {/* ---------- Add item form ---------- */}
              {addingToModuleId !== null && (
                <form ref={addFormRef} onSubmit={handleAddItemToModule} className="flex flex-col gap-4 rounded-[20px] border-2 border-primary bg-white p-6 shadow-lg">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">
                      {T.addItemTo} {batchModules.find((m) => m.id === addingToModuleId)?.title}
                    </h2>
                    <button type="button" onClick={() => setAddingToModuleId(null)} aria-label={t.common.close} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container">
                      <Icon name="close" size={18} />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={fieldLabel}>
                      {T.targetModule}
                      <select value={addingToModuleId} onChange={(e) => setAddingToModuleId(Number(e.target.value))} className={input}>
                        {batchModules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                      </select>
                    </label>
                    <label className={fieldLabel}>
                      {T.contentType}
                      <select value={itemKind} onChange={(e) => { setItemKind(e.target.value as ItemKind); setItemError(""); }} className={input}>
                        {(["video", "pdf", "quiz", "task", "exam"] as const).map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={fieldLabel}>
                      {T.itemTitle}
                      <input required value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder={T.titlePh[itemKind]} className={input} />
                    </label>
                    {itemKind === "video" || itemKind === "pdf" ? (
                      <label className={fieldLabel}>
                        {itemKind === "video" ? T.duration : T.pages}
                        <input value={itemMeta} onChange={(e) => setItemMeta(e.target.value)} className={input} />
                      </label>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <label className={fieldLabel}>
                          {T.totalMarks}
                          <input type="number" min={1} value={itemPoints} onChange={(e) => setItemPoints(e.target.value)} className={input} />
                        </label>
                        <label className={fieldLabel}>
                          {T.dueDate}
                          <input type="date" required value={itemDue} onChange={(e) => setItemDue(e.target.value)} className={input} />
                        </label>
                      </div>
                    )}
                  </div>

                  {(itemKind === "video" || itemKind === "pdf") && (
                    <label className={fieldLabel}>
                      {itemKind === "video" ? T.videoUrl : T.pdfUrl}
                      <input type="url" value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} placeholder="https://" className={input} />
                    </label>
                  )}
                  {(itemKind === "video" || itemKind === "pdf") && (<label className={fieldLabel}>
                      {T.uploadFile}
                      <input
                        key={fileKey}
                        type="file"
                        accept={itemKind === "video" ? "video/*" : "application/pdf"}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && f.size > MAX_FILE_BYTES) {
                            e.target.value = "";
                            setItemError(T.uploadTooBig);
                            return setItemFile(null);
                          }
                          setItemError("");
                          setItemFile(f);
                        }}
                        className="text-sm font-normal"
                      />
                    </label>
                  )}

                  {itemKind === "quiz" && (
                    <label className={fieldLabel}>
                      {T.questions}
                      <span className="font-normal">{T.questionsHelp} {t.skills.tagHint}</span>
                      <span className="font-normal">{t.exam2.sectionHint}</span>
                      <textarea rows={8} value={itemQuestions} onChange={(e) => setItemQuestions(e.target.value)} placeholder={T.questionsPh} className="rounded-xl border border-outline bg-white p-4 font-mono text-sm text-on-surface outline-none" />
                    </label>
                  )}
                  {itemKind === "quiz" && <QuestionImport onText={(txt) => setItemQuestions((prev) => (prev.trim() ? `${prev.trim()}\n\n${txt}` : txt))} />}
                  {(itemKind === "quiz" || itemKind === "task") && (
                    <label className={fieldLabel}>
                      {t.qimport.paper}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        aria-label={t.qimport.paper}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return setPaper(null);
                          const data = await uploadData(f);
                          if (!data) {
                            e.target.value = "";
                            return setItemError(t.sub.tooBig);
                          }
                          setItemError("");
                          setPaper({ name: f.name, data });
                        }}
                        className="text-sm font-normal"
                      />
                      {paper && <span className="font-normal">{paper.name}</span>}
                    </label>
                  )}
                  {itemKind === "quiz" && paper && !itemQuestions.trim() && (
                    <label className={fieldLabel}>
                      {t.qimport.keyLabel}
                      <span className="font-normal">{t.qimport.keyHelp}</span>
                      <input value={keyLetters} onChange={(e) => setKeyLetters(e.target.value)} placeholder="ABDC CABD …" className={`${input} font-mono uppercase`} />
                      {keyLetters && <span className="font-normal">{t.qimport.keyCount(parseKey(keyLetters)?.length ?? 0)}</span>}
                    </label>
                  )}
                  {itemKind === "quiz" && (
                    <div className="flex flex-col gap-3 rounded-xl bg-surface-container/60 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-on-surface-variant">{t.exam2.presets}</span>
                        {EXAM_PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setItemNegative(String(p.negative));
                              setItemPassPct(String(p.passPct));
                              setItemShuffle(p.shuffle);
                              setItemAntiCheat(p.antiCheat);
                            }}
                            className="rounded-full border border-outline-variant bg-white px-3 py-1 text-xs font-bold text-primary hover:bg-primary-container"
                          >
                            {p.label} ({p.negative ? `−${p.negative}` : t.exam2.noNeg})
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <label className={fieldLabel}>
                          {t.exam2.negative}
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="5"
                            value={itemNegative}
                            onChange={(e) => setItemNegative(e.target.value)}
                            placeholder="0 or 0.25"
                            className={input}
                          />
                        </label>
                        <label className={fieldLabel}>
                          {t.exam2.timeLimit}
                          <input
                            type="number"
                            min="1"
                            max="300"
                            value={itemTimeLimit}
                            onChange={(e) => setItemTimeLimit(e.target.value)}
                            placeholder={t.exam2.timeAuto}
                            className={input}
                          />
                        </label>
                        <label className={fieldLabel}>
                          {t.exam2.passPct}
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={itemPassPct}
                            onChange={(e) => setItemPassPct(e.target.value)}
                            className={input}
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-5 pt-1">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" checked={itemShuffle} onChange={(e) => setItemShuffle(e.target.checked)} className="h-5 w-5 accent-primary" />
                          {t.exam2.shuffle}
                        </label>
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" checked={itemAntiCheat} onChange={(e) => setItemAntiCheat(e.target.checked)} className="h-5 w-5 accent-primary" />
                          {t.exam2.antiCheat}
                        </label>
                      </div>
                    </div>
                  )}
                  {(itemKind === "task" || itemKind === "exam") && (
                    <label className={fieldLabel}>
                      {t.rubric.label}
                      <textarea rows={3} value={itemRubric} onChange={(e) => setItemRubric(e.target.value)} placeholder={"Method: 10\nFinal answer: 10\nPresentation: 5"} className="rounded-xl border border-outline bg-white p-3 font-mono text-sm text-on-surface outline-none" />
                    </label>
                  )}
                  {itemKind === "exam" &&
                    ([[t.exam.paper, paper, setPaper], [t.exam.answerKey, answerKey, setAnswerKey]] as const).map(([label, value, setValue]) => (
                      <label key={label} className={fieldLabel}>
                        {label}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return setValue(null);
                            const data = await uploadData(f);
                            if (!data) {
                              e.target.value = "";
                              return setItemError(t.sub.tooBig);
                            }
                            setItemError("");
                            setValue({ name: f.name, data });
                          }}
                          className="text-sm font-normal"
                        />
                        {value && <span className="font-normal">{value.name}</span>}
                      </label>
                    ))}
                  {itemError && <p role="alert" className="text-sm font-semibold text-error">{itemError}</p>}

                  {itemKind === "video" && (
                    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface-container px-4 py-3 text-sm">
                      <label className="flex items-center gap-2 font-semibold">
                        <input type="checkbox" checked={itemToExplore} onChange={(e) => setItemToExplore(e.target.checked)} className="h-4 w-4 accent-primary" />
                        {T.alsoExplore}
                      </label>
                      {itemToExplore && (
                        <label className="flex items-center gap-2 font-semibold">
                          <input type="checkbox" checked={itemFree} onChange={(e) => setItemFree(e.target.checked)} className="h-4 w-4 accent-primary" />
                          {T.freePreview}
                        </label>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAddingToModuleId(null)} className="h-11 rounded-full border border-outline px-5 text-sm font-semibold">{t.common.cancel}</button>
                    <button type="submit" disabled={saving} className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary disabled:opacity-60">{saving ? T.uploading : T.publishItem}</button>
                  </div>
                </form>
              )}

              {showNewModule && (
                <form onSubmit={handleCreateModule} className="flex flex-wrap items-end gap-3 rounded-[18px] border-2 border-primary bg-white p-5">
                  <label className={`${fieldLabel} min-w-60 flex-1`}>
                    {T.newModuleTitle}
                    <input required value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} placeholder={T.newModulePh} className={input} />
                  </label>
                  <button type="submit" className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">{T.createModule}</button>
                </form>
              )}

              {/* ---------- Home & modules ---------- */}
              {(section === "home" || section === "modules") && (
                <div className="flex flex-col gap-4">
                  {/* Course home: the batch itself and shortcuts into each section */}
                  {section === "home" && (
                    <div className="flex flex-col gap-1 rounded-[18px] border border-outline-variant bg-white p-5">
                      <span className="text-sm font-semibold text-primary">{teacherName}</span>
                      <span className="text-2xl font-bold">{activeBatch}</span>
                      <span className="text-sm text-on-surface-variant">{batch?.days}</span>
                      <span className="text-sm text-on-surface-variant">
                        {T.courseSummary(batchModules.length, batchStudents.length)} · {T.feePerMonth} {taka(batch?.fee ?? 0)}
                      </span>
                    </div>
                  )}

                  {section === "home" && !(lms.liveClass.batch === activeBatch && lms.liveClass.topic) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-outline-variant bg-white p-5">
                      <span className="text-on-surface-variant">{T.noLiveScheduled}</span>
                      <button type="button" onClick={() => setSection("live")} className="inline-flex h-11 items-center gap-2 rounded-full bg-secondary-container px-5 text-sm font-bold text-on-secondary-container">
                        <Icon name="video" size={18} /> {T.scheduleLive}
                      </button>
                    </div>
                  )}
                  {section === "home" && lms.liveClass.batch === activeBatch && !!lms.liveClass.topic && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-primary p-5 text-on-primary shadow-md">
                      <div className="flex flex-col gap-1">
                        <span className="self-start rounded-full bg-primary-container px-3 py-0.5 text-xs font-bold text-on-primary-container">{liveLabel(t, lang, lms.liveClass.start)}</span>
                        <span className="text-xl font-bold">{lms.liveClass.topic}</span>
                        <span className="text-sm text-secondary-container">{fmtDate(lms.liveClass.start, lang)} · {fmtTime(lms.liveClass.start, lang)}</span>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSection("live")} className="rounded-full bg-white/20 px-4 py-2.5 text-sm font-bold text-white">{T.editLive}</button>
                        <a href={lms.liveClass.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-tertiary-container px-5 py-2.5 text-sm font-bold text-on-tertiary-container">
                          <Icon name="video" size={18} /> {T.startClass}
                        </a>
                      </div>
                    </div>
                  )}

                  {section === "home" && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                      {courseNavItems.slice(1).map((item) => (
                        <button key={item.id} type="button" onClick={() => setSection(item.id)} className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-outline-variant bg-white p-4 text-left">
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                              <Icon name={item.icon} size={20} />
                            </span>
                            {item.count !== undefined && <span className="text-sm font-bold text-on-surface-variant">{item.count}</span>}
                          </span>
                          <span className="text-sm font-semibold [overflow-wrap:anywhere]">{T.sections[item.id]}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {section === "modules" && batchModules.length === 0 && !showNewModule && (
                    <p className="rounded-[18px] border border-dashed border-outline bg-white/60 p-8 text-center text-on-surface-variant">{T.noChapters}</p>
                  )}
                  {section === "modules" && batchModules.map((m) => {
                    const isOpen = !!openModules[m.id];
                    return (
                      <div key={m.id} className="overflow-hidden rounded-[18px] border border-outline-variant bg-white">
                        <div className="flex flex-wrap items-center gap-3 bg-surface-container/45 px-5 py-4">
                          <button type="button" onClick={() => setOpenModules((o) => ({ ...o, [m.id]: !isOpen }))} aria-expanded={isOpen} className="flex flex-1 items-center gap-3 text-left">
                            <span className={`text-on-surface-variant transition-transform ${isOpen ? "" : "-rotate-90"}`}>
                              <Icon name="chevronDown" size={20} />
                            </span>
                            <span className="text-lg font-bold">{m.title}</span>
                          </button>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                lms.toggleModulePublish(m.id);
                                notify(m.published ? T.toast.moduleHidden : T.toast.modulePublished);
                              }}
                              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${m.published ? "bg-secondary-container text-on-secondary-container" : "border border-outline text-on-surface-variant"}`}
                            >
                              {m.published ? T.published : T.unpublished}
                            </button>
                            {lms.batches.length > 1 && (
                              <select
                                aria-label={t.centre.copyTo}
                                value=""
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  lms.copyModule(m.id, e.target.value);
                                  notify(t.centre.moduleCopied);
                                }}
                                className="h-8 max-w-32 rounded-full border border-outline-variant bg-white px-2 text-xs"
                              >
                                <option value="">{t.centre.copyTo}</option>
                                {lms.batches.filter((b) => b.name !== m.batch).map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                              </select>
                            )}
                            <button type="button" onClick={() => openAddItem(undefined, m.id)} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-bold text-on-primary">
                              <Icon name="plus" size={14} strokeWidth={2.5} /> {T.addItem}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!confirmed(T.confirmDeleteModule(m.title))) return;
                                lms.deleteModule(m.id);
                                notify(T.toast.moduleRemoved);
                              }}
                              aria-label={T.deleteModule}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="flex flex-col">
                            {m.items.length === 0 && <div className="px-6 py-6 text-center text-sm text-on-surface-variant">{T.noItems}</div>}
                            {m.items.map((it) => (
                              <div key={it.id} className="flex items-center gap-3.5 border-t border-white/60 py-3 pl-5 pr-5 md:pl-12">
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${kindStyle[it.kind].cls}`}>
                                  <Icon name={kindStyle[it.kind].icon} size={18} />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="font-semibold">{it.title}</span>
                                  <span className="text-xs text-on-surface-variant">{itemSub(it)}</span>
                                </span>
                                {(it.kind === "video" || it.kind === "pdf") && (
                                  <button
                                    type="button"
                                    aria-pressed={!!it.preview}
                                    onClick={() => lms.toggleItemPreview(m.id, it.id)}
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${it.preview ? "bg-tertiary-container text-on-tertiary-container" : "border border-outline-variant text-on-surface-variant"}`}
                                  >
                                    {t.courses.previewToggle}
                                  </button>
                                )}
                                {m.published && <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-xs font-bold text-on-secondary-container">{T.liveTag}</span>}
                                <button
                                  type="button"
                                  onClick={() => deleteItem(m.id, it)}
                                  aria-label={`${t.common.remove} ${it.title}`}
                                  className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                                >
                                  <Icon name="trash" size={15} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ---------- Announcements ---------- */}
              {section === "announcements" && (
                <div className="flex flex-col gap-5">
                  <form onSubmit={handlePostAnnouncement} className="flex flex-col gap-3.5 rounded-[20px] border border-outline-variant bg-white p-6">
                    <h2 className="text-lg font-bold">{T.annNewFor(activeBatch)}</h2>
                    <input required aria-label={T.itemTitle} value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder={T.annTitlePh} className={`${input} h-12 font-semibold`} />
                    <textarea required rows={3} aria-label={T.annBodyPh} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder={T.annBodyPh} className="rounded-xl border border-outline bg-white p-4 text-sm text-on-surface outline-none" />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} className="h-4 w-4 accent-primary" />
                        {T.annPin}
                      </label>
                      <button type="submit" className="h-11 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">{T.annPublish}</button>
                    </div>
                  </form>

                  <div className="flex flex-col gap-3">
                    {batchAnnouncements.map((a) => (
                      <div key={a.id} className="flex flex-col gap-2 rounded-[18px] border border-outline-variant bg-white p-5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">{a.title}</span>
                            {a.pinned && <span className="rounded-full bg-tertiary-container px-2.5 py-0.5 text-xs font-bold text-on-tertiary-container">{T.pinned}</span>}
                          </div>
                          <button
                            type="button"
                            aria-label={`${t.common.remove} ${a.title}`}
                            onClick={() => {
                              if (!confirmed(T.confirmDeleteAnn(a.title))) return;
                              lms.deleteAnnouncement(a.id);
                              notify(T.toast.annDeleted);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{a.body}</p>
                        <span className="text-xs text-on-surface-variant">{T.postedBy(a.author, a.batch, fmtWhen(a.at, lang))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------- Assignments / Quizzes & written exams / Files share one list layout ---------- */}
              {(section === "assignments" || section === "quizzes" || section === "files") &&
                (section === "assignments" ? (["task"] as const) : section === "quizzes" ? (["quiz", "exam"] as const) : (["pdf"] as const)).map((kind) => {
                  const head = {
                    task: { title: T.assignTitle, sub: T.assignSub, btn: T.newAssignment, icon: "plus", tone: "bg-secondary-container text-on-secondary-container" },
                    quiz: { title: T.quizTitle, sub: T.quizSub, btn: T.newQuiz, icon: "plus", tone: "bg-primary-container text-on-primary-container" },
                    exam: { title: t.exam.title, sub: t.exam.sub, btn: t.exam.newExam, icon: "plus", tone: "bg-tertiary-container text-on-tertiary-container" },
                    pdf: { title: T.filesTitle, sub: T.filesSub, btn: T.uploadPdf, icon: "upload", tone: "bg-tertiary-container text-on-tertiary-container" },
                  }[kind];
                  return (
                    <div key={kind} className="flex flex-col gap-5">
                      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[18px] p-5 ${head.tone}`}>
                        <div>
                          <h2 className="text-lg font-bold">{head.title}</h2>
                          <p className="text-xs opacity-85">{head.sub}</p>
                        </div>
                        <button type="button" onClick={() => openAddItem(kind)} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-on-primary">
                          <Icon name={head.icon} size={18} /> {head.btn}
                        </button>
                      </div>
                      <div className="flex flex-col gap-3">
                        {allItems.filter((it) => it.kind === kind).map((it) => {
                          const marks = kind === "quiz" ? Object.values(it.scores ?? {}) : Object.values(it.submissions ?? {}).flatMap((x) => (x.grade === undefined ? [] : [x.grade]));
                          return (
                            <div key={it.id} className="flex flex-col gap-3 rounded-[16px] border border-outline-variant bg-white p-4">
                              <div className="flex flex-wrap items-center gap-4">
                                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${kindStyle[kind].cls}`}>
                                  <Icon name={kindStyle[kind].icon} size={20} />
                                </span>
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="font-bold">{it.title}</span>
                                  <span className="text-xs text-on-surface-variant">{it.moduleTitle} · {itemSub(it)}</span>
                                  {marks.length > 0 && (
                                    <span className="text-xs font-semibold text-primary">
                                      {t.exam.stats(Math.round(marks.reduce((a, b) => a + b, 0) / marks.length), Math.max(...marks), Math.min(...marks), marks.length)}
                                    </span>
                                  )}
                                  {(kind === "task" || kind === "exam") && <span className="text-xs font-semibold text-primary">{t.sub.count(Object.keys(it.submissions ?? {}).length)}</span>}
                                </div>
                                {it.url && <FileLink url={it.url} className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold">{t.common.open}</FileLink>}
                                {it.kind === "pdf" && it.url && <PdfHighlights url={it.url} title={it.title} />}
                                {gameOn && kind === "quiz" && !!it.questions?.length && (
                                  <button
                                    type="button"
                                    onClick={() => setLiveQuiz({ title: it.title, questions: it.questions!.map(({ q, options, answer }) => ({ q, options, answer })) })}
                                    className="inline-flex items-center gap-1 rounded-full bg-tertiary-container px-3 py-1 text-xs font-bold text-on-tertiary-container"
                                  >
                                    <Icon name="video" size={14} /> {t.game.host}
                                  </button>
                                )}
                                {it.paper && <button type="button" onClick={() => openDataUrl(it.paper!)} className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold">{t.exam.paperLink}</button>}
                                {it.answerKey && <button type="button" onClick={() => openDataUrl(it.answerKey!)} className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold">{t.exam.keyLink}</button>}
                                <button type="button" aria-label={`${t.common.remove} ${it.title}`} onClick={() => deleteItem(it.moduleId, it)} className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container">
                                  <Icon name="trash" size={16} />
                                </button>
                              </div>
                              {(kind === "task" || kind === "exam") && <Submissions moduleId={it.moduleId} item={it} onSaved={notify} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              {/* ---------- Points & class story (ClassDojo-style) ---------- */}
              {section === "dojo" && (
                <div className="flex flex-col gap-5">
                  <PointsPanel students={batchStudents} onGiven={notify} />
                  <StoryFeed batch={activeBatch} canPost onPosted={notify} />
                  <Portfolio studentIds={batchStudents.map((s) => s.id)} title={t.dojo.studentWork} />
                </div>
              )}

              {/* ---------- Grades ---------- */}
              {section === "grades" && (
                <div className="flex flex-col gap-4">
                  <TopicMastery modules={batchModules} studentIds={batchStudents.map((s) => s.id)} title={t.skills.classTitle} />
                  {REAL_AUTH ? (
                    <Gradebook students={batchStudents} modules={batchModules} />
                  ) : (
                    <>
                  <p className="text-sm text-on-surface-variant">{T.gradesHelp}</p>
                  <div className="overflow-x-auto rounded-[18px] border border-outline-variant bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-white/70 bg-surface-container/60 text-xs font-bold uppercase text-on-surface-variant">
                        <tr>
                          <th className="px-5 py-3.5">{T.gStudent}</th>
                          <th className="px-4 py-3.5">{T.gCh4}</th>
                          <th className="px-4 py-3.5">{T.gCh3}</th>
                          <th className="px-4 py-3.5">{T.gAvg}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchStudents.map((s) => (
                          <tr key={s.id} className="border-t border-white/60">
                            <td className="px-5 py-3 font-bold">
                              {t.common.roll} {s.id} · {s.name}
                              <Link href={`/teacher/report/${s.id}`} className="ml-2 rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-primary">{t.report.open}</Link>
                            </td>
                            {(["ch4Score", "ch3Score"] as const).map((f) => (
                              <td key={f} className="px-4 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={30}
                                  aria-label={`${s.name} ${f === "ch4Score" ? T.gCh4 : T.gCh3}`}
                                  value={s[f]}
                                  onChange={(e) => lms.updateStudentScore(s.id, f, Number(e.target.value))}
                                  className="h-9 w-20 rounded-[10px] border border-outline bg-white px-2.5 text-center font-bold"
                                />
                              </td>
                            ))}
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-extrabold text-on-secondary-container">{Math.round(((s.ch4Score + s.ch3Score) / 60) * 100)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    </>
                  )}
                </div>
              )}

              {/* ---------- Students, attendance & fees ---------- */}
              {/* Attendance is taken in front of the class: names and present/absent only —
                  no fees, marks or phone numbers on this screen. */}
              {section === "people" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-4 rounded-[16px] bg-primary-container p-4 text-on-primary-container">
                    <label className="flex flex-col text-sm font-semibold">
                      {t.att.date}
                      <input type="date" max={dayKey()} value={attDate} onChange={(e) => e.target.value && setAttDate(e.target.value)} className="mt-0.5 rounded-lg bg-white/70 px-2 py-1 text-base font-bold" />
                    </label>
                    <div className="flex flex-1 flex-col">
                      <span className="text-3xl font-extrabold">{presentCount} / {batchStudents.length}</span>
                      <span className="text-sm">{T.presentToday}</span>
                      {!isClassDay && <span className="text-sm font-semibold text-error">{t.att.notClassDay}</span>}
                    </div>
                    <button type="button" onClick={() => { lms.markAllPresent(batchStudents.map((s) => s.id), attDate); notify(T.toast.allPresent); }} className="h-12 rounded-full bg-primary px-5 text-base font-bold text-on-primary">
                      {T.markAll}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirmed(t.qr.confirmStart)) return;
                        lms.markAllAbsent(batchStudents.map((s) => s.id), attDate);
                        setScanning(true);
                      }}
                      title={t.qr.startHint}
                      className="inline-flex h-12 items-center gap-1.5 rounded-full bg-white px-5 text-base font-bold text-primary"
                    >
                      <Icon name="grid" size={18} /> {t.qr.scan}
                    </button>
                  </div>

                  <label className="flex h-11 max-w-md items-center gap-2 rounded-full border border-outline-variant bg-white px-4">
                    <Icon name="search" size={18} className="text-on-surface-variant" />
                    <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder={t.tday.searchName} aria-label={t.tday.searchName} className="flex-1 bg-transparent text-base outline-none" />
                  </label>

                  <ul className="flex flex-col gap-2">
                    {attendanceList.length === 0 && <li className="rounded-[16px] border border-outline-variant bg-white p-8 text-center text-on-surface-variant">{batchStudents.length === 0 ? T.noStudentsInBatch : T.noMatch}</li>}
                    {attendanceRows.map((s) => {
                      const present = isPresent(s.id);
                      return (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-outline-variant bg-white px-4 py-3">
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${present ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface-variant"}`}>
                            {s.name.charAt(0)}
                          </span>
                          <span className="min-w-40 flex-1 text-lg font-semibold">{s.name}</span>
                          {!present && attDate === dayKey() && <SmsButton to={[s.phone]} text={T.msgAbsent(s.name, s.batch, teacherName)} className="h-11" />}
                          {!present && attDate === dayKey() && (
                            <a href={waLink(s.phone, T.msgAbsent(s.name, s.batch, teacherName))} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1 rounded-full bg-[#128c7e] px-4 text-sm font-bold text-white" title={T.notifyParent}>
                              <Icon name="message" size={16} /> <span className="hidden sm:inline">{T.notifyParent}</span>
                            </a>
                          )}
                          <button
                            type="button"
                            aria-pressed={present}
                            aria-label={`${s.name}: ${present ? t.common.present : t.common.absent}`}
                            onClick={() => lms.toggleAttendance(s.id, attDate)}
                            className={`h-11 min-w-28 rounded-full px-4 text-base font-bold ${present ? "bg-primary text-on-primary" : "border border-error bg-error-container text-on-error-container"}`}
                          >
                            {present ? t.common.present : t.common.absent}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {attendancePager}
                </div>
              )}

              {/* Fees: Institute Admin ONLY — instructors never see who is paying or owing money. */}
              {isInstitute && section === "fees" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-tertiary-container p-4 text-on-tertiary-container">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{T.feeStatus}</span>
                      <span className="text-3xl font-extrabold">{taka(batchFeeDue)}</span>
                      <span className="text-sm">{T.dueVsPaid(dueCount, batchStudents.length - dueCount)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setShowRemind(true)} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#128c7e] px-4 text-sm font-bold text-white">
                        <Icon name="message" size={16} /> {t.fee.remindAll}
                      </button>
                      <button type="button" onClick={exportCsv} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-primary">
                        <Icon name="file" size={16} /> {T.exportCsv}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div data-slide className="flex flex-wrap gap-2">
                      {[
                        { id: "all", label: T.filterAll(batchStudents.length) },
                        { id: "due", label: T.filterDue(dueCount) },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          aria-pressed={studentFilter === tab.id}
                          onClick={() => setStudentFilter(tab.id as typeof studentFilter)}
                          className={`h-10 rounded-full px-4 text-sm font-bold transition-all ${studentFilter === tab.id ? "bg-primary text-on-primary shadow-xs" : "border border-outline-variant bg-white text-on-surface-variant"}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <label className="flex h-10 min-w-60 items-center gap-2 rounded-full border border-outline-variant bg-white px-4">
                      <Icon name="search" size={16} className="text-on-surface-variant" />
                      <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder={T.searchStudents} aria-label={T.searchStudents} className="flex-1 bg-transparent text-sm outline-none" />
                    </label>
                  </div>

                  <ul className="flex flex-col gap-2">
                    {filteredStudents.length === 0 && <li className="rounded-[16px] border border-outline-variant bg-white p-8 text-center text-on-surface-variant">{batchStudents.length === 0 ? T.noStudentsInBatch : T.noMatch}</li>}
                    {studentRows.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-[16px] border border-outline-variant bg-white px-4 py-3">
                        <span className="flex min-w-44 flex-1 flex-col">
                          <span className="text-base font-bold">{s.name}</span>
                          <span className="text-sm text-on-surface-variant">{t.common.roll} {s.id} · {s.guardianName} · {s.phone}</span>
                        </span>
                        {s.feeDue > 0 && <SmsButton to={[s.phone]} text={T.msgFee(s.name, taka(s.feeDue))} />}
                        {s.feeDue > 0 && (
                          <a href={waLink(s.phone, T.msgFee(s.name, taka(s.feeDue)))} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 rounded-full bg-[#128c7e] px-3 text-sm font-bold text-white" title={T.notifyParent}>
                            <Icon name="message" size={14} /> <span className="hidden sm:inline">{T.notifyParent}</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setFeeFor(s.id)}
                          className={`h-10 rounded-full px-4 text-sm font-bold ${s.feeDue ? "bg-tertiary-container text-on-tertiary-container" : "bg-secondary-container text-on-secondary-container"}`}
                        >
                          {s.feeDue ? `${s.late ? `${t.fee.late} · ` : ""}${t.common.due} ${taka(s.feeDue)}` : T.paidLabel}
                        </button>
                        <Link href={`/teacher/invoice/${s.id}`} className="inline-flex h-10 items-center rounded-full bg-surface-container px-3 text-sm font-bold text-primary">
                          {t.fees.invoice}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {studentPager}
                </div>
              )}

              {/* ---------- Live class & Explore video ---------- */}
              {section === "live" && <LiveControlRoom batch={activeBatch} topic={liveTopic || lms.liveClass.topic} teacherName={myName} notify={notify} />}
              {section === "live" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <form onSubmit={handlePostExploreVideo} className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-outline-variant bg-white p-6">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">{T.vpLabel}</span>
                    <h2 className="text-xl font-bold">{T.vpTitle}</h2>
                    <label className={fieldLabel}>
                      {T.videoTitle}
                      <input required value={vidTitle} onChange={(e) => setVidTitle(e.target.value)} placeholder={T.videoTitlePh} className={input} />
                    </label>
                    <label className={fieldLabel}>
                      {T.videoUrl}
                      <input type="url" value={vidUrl} onChange={(e) => setVidUrl(e.target.value)} placeholder="https://youtu.be/…" className={input} />
                    </label>
                    <label className={fieldLabel}>
                      {T.uploadFile}
                      <input
                        key={fileKey}
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && f.size > MAX_FILE_BYTES) {
                            e.target.value = "";
                            notify(T.uploadTooBig);
                            return setVidFile(null);
                          }
                                                    setVidFile(f);
                        }}
                        className="text-sm font-normal"
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      <label className={fieldLabel}>
                        {T.subject}
                        <select value={vidSubject} onChange={(e) => setVidSubject(e.target.value)} className={input}>
                          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                      <label className={fieldLabel}>
                        {T.level}
                        <select value={vidLevel} onChange={(e) => setVidLevel(e.target.value)} className={input}>
                          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </label>
                      <label className={fieldLabel}>
                        {T.duration}
                        <input value={vidLength} onChange={(e) => setVidLength(e.target.value)} placeholder="48:20" className={input} />
                      </label>
                    </div>
                    <label className={fieldLabel}>
                      {T.attachModule}
                      <select value={vidModuleId} onChange={(e) => setVidModuleId(Number(e.target.value))} className={input}>
                        <option value={0}>—</option>
                        {batchModules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={vidFree} onChange={(e) => setVidFree(e.target.checked)} className="h-4 w-4 accent-primary" />
                      {T.makeFree}
                    </label>
                    <button type="submit" disabled={saving} className="mt-1 h-12 rounded-full bg-primary text-sm font-bold text-on-primary disabled:opacity-60">{saving ? T.uploading : T.publishVideo}</button>
                  </form>

                  <form onSubmit={handleSaveLiveClass} className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-outline-variant bg-white p-6">
                    <span className="text-xs font-bold uppercase tracking-wider text-tertiary">{T.liveLabel}</span>
                    <h2 className="text-xl font-bold">{T.liveTitle}</h2>
                    <label className={fieldLabel}>
                      {T.liveTopic}
                      <input required value={liveTopic} onChange={(e) => setLiveTopic(e.target.value)} className={input} />
                    </label>
                    <label className={fieldLabel}>
                      {T.liveStart}
                      <input required type="datetime-local" value={liveStart} onChange={(e) => setLiveStart(e.target.value)} className={input} />
                    </label>
                    <label className={fieldLabel}>
                      {T.liveLink}
                      <input required type="url" value={liveLink} onChange={(e) => setLiveLink(e.target.value)} className={input} />
                    </label>
                    <button type="submit" className="mt-auto h-12 rounded-full bg-tertiary-container text-sm font-bold text-on-tertiary-container">{T.liveSave}</button>
                  </form>
                </div>
              )}
            </main>

          </>
        )}

        {/* ============================== CALENDAR ============================== */}
        {navTab === "students" && <StudentsPage batchNames={visibleNames} notify={notify} />}
        {navTab === "tools" && <ToolsPage batchNames={visibleNames} notify={notify} owner={isOwner} />}

        {navTab === "calendar" && (
          <main className="flex min-w-0 flex-1 flex-col [&>*]:shrink-0 gap-5 px-4 pb-28 pt-4 md:overflow-y-auto md:px-8 md:pb-10 md:pt-6">
            <div>
              <span className="text-sm text-on-surface-variant">{T.calSub}{activeBatch ? ` · ${activeBatch}` : ""}</span>
              <h1 className="text-3xl font-bold">{T.calTitle}</h1>
            </div>

            <form onSubmit={handleCreateCalendarEvent} className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] items-end gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
              <input required aria-label={T.evTitlePh} value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder={T.evTitlePh} className={`${input} sm:col-span-2`} />
              <input required type="date" aria-label={T.dueDate} value={evDate} onChange={(e) => setEvDate(e.target.value)} className={input} />
              <label className={fieldLabel}>
                {T.evStart}
                <input required type="time" value={evStart} onChange={(e) => setEvStart(e.target.value)} className={input} />
              </label>
              <label className={fieldLabel}>
                {T.evEnd}
                <input type="time" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} className={input} />
              </label>
              <select aria-label={T.contentType} value={evKind} onChange={(e) => setEvKind(e.target.value as "live" | "exam" | "due")} className={`${input} font-semibold`}>
                <option value="live">{t.kinds.live}</option>
                <option value="exam">{t.kinds.exam}</option>
                <option value="due">{t.kinds.due}</option>
              </select>
              <button type="submit" className="h-11 rounded-full bg-primary px-5 text-sm font-bold text-on-primary">{T.postCal}</button>
            </form>

            <div className="flex flex-col gap-3">
              {lms.calendar.filter((ev) => !ev.batch || ev.batch === activeBatch).map((ev) => (
                <div key={ev.id} className="flex flex-wrap items-center gap-4 rounded-[18px] border border-outline-variant bg-white p-4">
                  <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-primary text-on-primary">
                    <span className="text-xs opacity-85">{fmtWeekday(ev.start, lang)}</span>
                    <span className="text-base font-extrabold">{fmtDayNum(ev.start, lang)}</span>
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-lg font-bold">{ev.title}</span>
                    <span className="text-sm">
                      {ev.allDay ? `${t.kinds[ev.kind]} · ${fmtDate(ev.start, lang)}` : `${fmtTime(ev.start, lang)}${ev.end ? ` – ${fmtTime(ev.end, lang)}` : ""}`}
                    </span>
                    <span className="text-xs text-on-surface-variant">{ev.meta}</span>
                  </div>
                  <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container">{T.synced}</span>
                </div>
              ))}
            </div>
          </main>
        )}

        {/* ============================== INBOX ============================== */}
        {navTab === "inbox" && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-20 md:flex-row md:pb-0">
            <aside className="flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-white/70 bg-surface-container/40 p-4 backdrop-blur-xl md:w-80 md:overflow-y-auto md:border-b-0 md:border-r">
              <div className="px-2 pb-1">
                <h1 className="text-2xl font-bold">{T.inboxTitle}</h1>
                <p className="text-xs text-on-surface-variant">{T.replyAs(teacherName)}</p>
              </div>
              <div className="flex gap-2 overflow-x-auto md:flex-col">
                {lms.chats.map((c) => {
                  const selected = c.id === activeChat?.id;
                  const last = c.messages[c.messages.length - 1];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setActiveChatId(c.id); lms.markChatRead(c.id); }}
                      className={`flex min-w-60 items-center gap-3 rounded-[16px] p-3.5 text-left transition-all md:min-w-0 ${selected ? "bg-primary-container text-on-primary-container shadow-xs" : "border border-outline-variant bg-white hover:bg-surface-high"}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-on-primary">{c.name.charAt(0)}</span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-bold">{c.name}</span>
                        <span className="truncate text-xs opacity-75">{c.role}</span>
                        <span className="mt-0.5 truncate text-xs opacity-90">{last?.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {!activeChat && <p className="flex flex-1 items-center justify-center p-8 text-center text-on-surface-variant">{T.inboxEmpty}</p>}
            {activeChat && (
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="flex items-center justify-between border-b border-white/70 bg-white/50 px-6 py-3.5 backdrop-blur-xl">
                  <div>
                    <div className="font-bold">{activeChat.name}</div>
                    <div className="text-xs text-on-surface-variant">{T.replyAs(teacherName)}</div>
                  </div>
                </header>
                <div className="flex flex-1 flex-col gap-3 p-4 md:overflow-y-auto md:p-6">
                  {activeChat.messages.map((m) => {
                    const fromTeacher = m.sender === teacherName;
                    return (
                      <div key={m.id} className={`flex max-w-lg flex-col gap-1 ${fromTeacher ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <span className="px-2 text-[11px] font-semibold text-on-surface-variant">{m.sender} · {fmtWhen(m.at, lang)}</span>
                        <div className={`rounded-[16px] px-4 py-3 text-sm leading-relaxed ${fromTeacher ? "rounded-br-xs bg-primary text-on-primary shadow-sm" : "rounded-bl-xs border border-outline-variant bg-white text-on-surface"}`}>{m.text}</div>
                      </div>
                    );
                  })}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatDraft.trim()) return;
                    lms.sendChatMessage(activeChat.id, teacherName, chatDraft.trim(), false);
                    setChatDraft("");
                    notify(T.toast.replySent);
                  }}
                  className="glass-header sticky bottom-18 flex items-center gap-3 border-t border-white/70 px-4 py-3 md:static md:bg-white/50 md:px-6"
                >
                  <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder={T.replyPh(teacherName)} aria-label={T.replyPh(teacherName)} className="h-12 flex-1 rounded-full border border-outline-variant bg-white px-5 text-sm outline-none" />
                  <button type="submit" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">
                    {t.common.send} <Icon name="arrow" size={16} />
                  </button>
                </form>
              </section>
            )}
          </div>
        )}

        <BottomBar
          label={T.studio}
          items={[...globalNavItems.filter((x) => x.id !== "tools" && x.id !== "calendar"), ...globalNavItems.filter((x) => x.id === "tools" || x.id === "calendar")].map((item) => ({ ...item, on: navTab === item.id, go: () => { setNavTab(item.id); window.scrollTo(0, 0); } }))}
        />
      </div>
    </div>
  );
}

/** Weekday toggles for a batch's class days. */
function ClassDays({ label, names, value, onChange }: { label: string; names: string[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1 text-xs font-bold text-on-surface-variant">
      <legend className="mb-1">{label}</legend>
      {names.map((n, d) => {
        const on = value.includes(d);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={`h-8 min-w-10 rounded-full px-2 ${on ? "bg-primary text-on-primary" : "border border-outline-variant bg-white"}`}
          >
            {n}
          </button>
        );
      })}
    </fieldset>
  );
}
