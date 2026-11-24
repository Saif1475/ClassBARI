// Sample data so the screens look real. Replace with Supabase queries later.
// Dates are generated relative to today so the demo never goes stale.
import { at, dayFromToday } from "./dates.ts";
import type { QuizQuestion } from "./quiz.ts";
import type { XpLog } from "./xp.ts";
import type { Coupon, Expense, Slot } from "./centre.ts";
import type { CommunityPost, CommunityProfile, Friendship } from "./community.ts";

/** Day of the month after which an unpaid fee counts as late. */
export const FEE_DUE_DAY = 10;

export const subjects = ["Physics", "Math", "Chemistry", "Biology", "English"];
export const levels = ["SSC", "HSC", "Admission prep"];

export type ItemKind = "video" | "pdf" | "quiz" | "task" | "exam";

/** A position: 1 = best, out of how many. */
export type Rank = { rank: number; of: number };
export type ModuleItem = {
  id: number;
  kind: ItemKind;
  title: string;
  meta: string;
  done: boolean;
  doneBy?: number[]; // students who finished it (with real accounts `done` is worked out per student)
  points?: number;
  dueDate?: string; // YYYY-MM-DD
  url?: string; // video (YouTube or .mp4) or PDF link
  questions?: QuizQuestion[];
  scores?: Record<number, number>; // student id -> quiz marks (a student or guardian is sent only their own)
  ranks?: Record<number, Rank>; // their position among classmates, worked out on the server
  answers?: Record<number, boolean[]>; // student id -> right/wrong per question (topic mastery, mistakes)
  rubric?: RubricCriterion[]; // marking criteria for assignments / written exams
  submissions?: Record<number, Submission>; // student id -> assignment / written-exam hand-in
  preview?: boolean; // free preview on the public course page
  paper?: string; // written exam: question paper (data URL)
  paperName?: string;
  answerKey?: string; // shown to students once their answer is graded
  answerKeyName?: string;
  negative?: number; // marks lost per wrong MCQ answer (0 / unset = no negative marking)
  shuffle?: boolean; // each student gets the questions and options in their own order
  meritPublished?: boolean; // students and guardians see their position
  timeLimitMin?: number; // custom countdown duration in minutes (default: 1 min per question)
  passPct?: number; // custom pass percentage (default: 33%)
  antiCheat?: boolean; // track tab-switches and auto-submit after 3 violations
  tabSwitches?: Record<number, number>; // student id -> times they left the test (shown to the teacher)
  started?: Record<number, string>; // student id -> when they pressed Start (kept by the server)
  took?: Record<number, number>; // student id -> seconds from Start to handing in, measured by the server; -1: no start was recorded
};

// shortcut: files are kept as data URLs in localStorage (small files only); move to Supabase Storage / R2 with a backend.
export type Submission = { fileName: string; file?: string; at: string; grade?: number; comment?: string; rubricScores?: number[] };
export type RubricCriterion = { name: string; max: number };
/** ClassDojo-style feedback points. */
export const POINT_KINDS = { helping: 1, participation: 1, homework: 1, teamwork: 1, lateHomework: -1, offTask: -1 } as const;
export type PointKind = keyof typeof POINT_KINDS;
export type ClassPoint = { id: number; studentId: number; kind: PointKind; at: string };
export type StoryPost = { id: number; batch: string; author: string; text: string; image?: string; at: string };
export type PortfolioItem = { id: number; studentId: number; title: string; image: string; at: string };
/** salary: fixed monthly pay (৳); share: % of fees collected from the teacher's batches. */
export type Staff = { name: string; phone: string; salary: number; share: number; email?: string }; // email: their login with real accounts
export type StaffPayment = { id: number; name: string; month: string; amount: number; at: string };
export type Note = { id: number; title: string; text: string; at: string; by?: number };
export type Admission = { id: number; name: string; guardian: string; phone: string; wants: string; stage: "enquiry" | "called" | "visited" | "admitted" | "lost"; followUp?: string; note: string; at: string };
export type StaffLeave = { id: number; name: string; from: string; to: string; reason: string; status: "pending" | "approved" | "rejected" };
export type Meeting = { id: number; start: string; minutes: number; teacher: string; batch: string; bookedBy?: number };
export type DoubtReply = { by: string; text: string; image?: string; audio?: string; at: string };
export type Doubt = { id: number; studentId: number; batch: string; text: string; image?: string; at: string; solved: boolean; replies: DoubtReply[] };
export type Order = { id: number; batchId: string; student: { name: string; email: string; guardianName: string; guardianEmail: string; phone: string }; price: number; coupon?: string; trxId: string; at: string; status: "pending" | "confirmed" | "rejected" };
export type TeacherSite = { slug: string; bio: string; bkash: string; published: boolean };
export type BankQuestion = QuizQuestion & { id: number; subject: string; difficulty: "easy" | "medium" | "hard" };

export type CourseModule = { id: number; batch: string; title: string; tag: "inProgress" | "new" | "completed"; published: boolean; items: ModuleItem[] };
/** classDays: 0 = Sunday … 6 = Saturday. teacher: staff name that runs the batch. */
export type Batch = {
  id: string;
  name: string;
  short: string;
  days: string;
  classDays: number[];
  fee: number;
  lateFine: number; // added once a month when the fee is unpaid after FEE_DUE_DAY
  teacher: string;
  subject?: string;
  public?: boolean; // listed on /courses with an enrol form
  hideLeague?: boolean; // teacher can switch off the weekly XP league
  about?: string;
  pastTeachers?: { name: string; until: string }[]; // who taught it before, oldest first, and when they stopped (for payroll of late-synced fees)
};
export type StudentRecord = {
  id: number;
  name: string;
  email: string; // student's Gmail: the only way into the student panel
  guardianName: string;
  guardianEmail: string; // guardian's Gmail: opens the parent panel for all their children
  phone: string; // guardian mobile (WhatsApp, SMS)
  studentPhone?: string;
  dob?: string; // YYYY-MM-DD
  school?: string;
  address?: string;
  mode: "offline" | "online";
  pending?: boolean; // joined from a link and waiting for the institute to accept them: can't log in yet
  gender?: "male" | "female"; // chosen by the institute; also picks the student's default colours
  batch: string;
  feeDue: number;
  ch4Score: number;
  ch3Score: number;
  discount?: number; // monthly discount / scholarship (৳)
  chargedDiscount?: number; // the discount this month's fee was charged with (missing in data saved before it was kept)
  photo?: string; // small JPEG data URL for the ID card
  fineMonth?: string; // YYYY-MM a late fine was last added
  joined?: string; // YYYY-MM the student was added: no "late" and no late fine in that month
  premiumUntil?: string; // YYYY-MM-DD: premium (highlighted PDFs, AI help) until this day; set by the institute
  aiPack?: number; // which AI pack (৳150 / 400 / 800 / 1500) the premium is; none: the smallest
  packPays?: string[]; // the last pay_requests ids whose months were added: an approval sent again after a lost answer adds nothing
};
export type Payment = { id: number; studentId: number; batch: string; teacher?: string; amount: number; at: string; method: "bkash" | "cash" };
export type Announcement = { id: number; title: string; body: string; author: string; batch: string; at: string; pinned?: boolean };
export type ExploreVideo = {
  id: number;
  title: string;
  thumb: string;
  subject: string;
  level: string;
  teacher: string;
  views: number;
  postedAt: string;
  length: string;
  free: boolean;
  url?: string;
};
export type EnrolledCourse = { id: string; title: string; teacher: string; schedule: string; progress: number; nextTopic: string; next?: string };
export type CalendarEvent = { id: number; title: string; start: string; end?: string; meta: string; kind: "live" | "exam" | "due"; batch?: string }; // batch: whose calendar it is on (none: everyone's)
export type LiveClassInfo = { batch: string; topic: string; start: string; link: string };
export type ChatMessage = {
  id: number;
  sender: string;
  text: string;
  at: string;
  mine?: boolean; // written by the student or guardian (else by the teacher's side)
  reply?: number; // the message it answers
  photo?: string;
  edited?: true;
  deleted?: true; // taken back for everyone: the text and photo are gone
  react?: { family?: string; staff?: string }; // one reaction per side
  teacher?: string; // a student's private chat: the teacher it was with when sent, so a later teacher or the owner can't read it
};
// readFamily / readStaff: when each side last opened the chat (the ticks). Not sent when that side turned read receipts off.
export type ChatThread = { id: string; name: string; role: string; unread: number; online: boolean; messages: ChatMessage[]; readFamily?: string; readStaff?: string };

const ch4Quiz: QuizQuestion[] = [
  { q: "In SHM, acceleration is proportional to…", options: ["velocity", "displacement", "time", "mass"], answer: 1, topic: "SHM basics" },
  { q: "Time period of a simple pendulum depends on…", options: ["mass of the bob", "amplitude (small swings)", "length and g", "material of the string"], answer: 2, topic: "Pendulum" },
  { q: "If the length of a pendulum is made 4 times, its period becomes…", options: ["2 times", "4 times", "½ times", "unchanged"], answer: 0, topic: "Pendulum" },
  { q: "Two springs of constant k in series give an effective constant of…", options: ["2k", "k", "k/2", "k²"], answer: 2, topic: "Springs" },
  { q: "At the mean position of SHM, the kinetic energy is…", options: ["zero", "maximum", "half of total", "negative"], answer: 1, topic: "Energy in SHM" },
];

const PH = "HSC Physics · A";
const MA = "SSC Higher Math";

export function seed() {
  const teacherName = "Tanvir Sir";
  const staff: Staff[] = [
    { name: teacherName, phone: "01711-000001", salary: 0, share: 0 }, // the owner
    { name: "Rumana Ma'am", phone: "01811-000002", salary: 4000, share: 20 },
  ];
  const batches: Batch[] = [
    {
      id: "hsc-physics-a", name: PH, short: "Ph", days: "Sat, Mon, Wed · 4:30 PM", classDays: [6, 1, 3], fee: 1200, lateFine: 100, teacher: teacherName,
      public: true, about: "Full HSC Physics 1st paper with live classes, recorded lectures, weekly MCQ and written tests, and monthly report cards for parents.",
    },
    { id: "ssc-higher-math", name: MA, short: "Ma", days: "Sun, Tue · 6:00 PM", classDays: [0, 2], fee: 1000, lateFine: 50, teacher: "Rumana Ma'am" },
  ];

  const names = ["Nusrat Jahan", "Rafsan Ahmed", "Tasnim Haque", "Arif Hossain", "Mahin Rahman", "Sadia Islam", "Imran Kabir", "Ayaan Jahan", "Riya Saha"];
  // Nusrat (1) and Ayaan (8) are siblings: one guardian Gmail sees both in the parent panel.
  const guardians = ["Kamal Jahan", "Shahid Ahmed", "Farida Haque", "Mosharraf Hossain", "Rina Rahman", "Nazrul Islam", "Habib Kabir", "Kamal Jahan", "Gopal Saha"];
  const gmail = (n: string) => `${n.toLowerCase().replace(/[^a-z]+/g, ".")}@gmail.com`;
  const phones = ["01711-234511", "01819-442109", "01912-883401", "01715-990123", "01611-334982", "01722-761209", "01521-409812", "01711-234511", "01817-552210"];
  const dueIds = [3, 6, 8]; // Ayaan (8) owes, so the parent demo can pay
  const students: StudentRecord[] = names.map((name, i) => {
    const batch = i < 7 ? PH : MA;
    return {
      id: i + 1,
      name,
      email: gmail(name),
      guardianName: guardians[i],
      guardianEmail: gmail(guardians[i]),
      phone: phones[i],
      mode: i % 2 === 0 ? "offline" : "online",
      batch,
      feeDue: dueIds.includes(i + 1) ? (batch === PH ? 1200 : 1000) - (i === 2 ? 200 : 0) : 0,
      ch4Score: [23, 27, 19, 25, 22, 18, 28, 21, 26][i],
      ch3Score: [26, 28, 21, 24, 25, 20, 29, 24, 27][i],
      discount: i === 2 ? 200 : undefined, // Tasnim has a ৳200 scholarship
    };
  });

  // Fees: everyone not in dueIds paid this month; plus the last 5 months for the income report.
  const payments: Payment[] = [];
  students.forEach((s, i) => {
    const amount = s.batch === PH ? 1200 : 1000;
    if (s.feeDue === 0) payments.push({ id: 1000 + s.id, studentId: s.id, batch: s.batch, amount, at: at(-Math.min(i + 1, new Date().getDate() - 1), 10 + (i % 8)), method: i % 3 === 2 ? "cash" : "bkash" });
    for (let m = 1; m <= 5; m++) {
      if ((s.id + m) % 7 === 0) continue; // a few missed months
      const d = new Date();
      d.setMonth(d.getMonth() - m, 3 + (i % 20));
      d.setHours(11, 0, 0, 0);
      payments.push({ id: 2000 + s.id * 10 + m, studentId: s.id, batch: s.batch, amount, at: d.toISOString(), method: i % 3 === 2 ? "cash" : "bkash" });
    }
  });

  // Attendance: date -> absent roll numbers, recorded on each batch's class days over the last 4 weeks.
  const attendance: Record<string, number[]> = {};
  for (let k = 28; k >= 0; k--) {
    const day = dayFromToday(-k);
    const wd = new Date(`${day}T00:00`).getDay();
    const absent: number[] = [];
    if (batches[0].classDays.includes(wd)) absent.push(...(k === 0 ? [3, 6] : k % 9 === 2 ? [1, 3] : k % 4 === 0 ? [6] : [3]));
    if (batches[1].classDays.includes(wd)) absent.push(...(k % 5 === 0 ? [9] : []));
    if (batches[0].classDays.includes(wd) || batches[1].classDays.includes(wd)) attendance[day] = absent;
  }

  const modules: CourseModule[] = [
    {
      id: 1, batch: PH, title: "Chapter 4 · Simple Harmonic Motion", tag: "inProgress", published: true,
      items: [
        { id: 101, kind: "video", title: "Lecture 1: Definitions & equations", meta: "72 min", done: true, preview: true, url: "/samples/lecture-shm.mp4" },
        { id: 102, kind: "video", title: "Lecture 2: Pendulums & springs", meta: "65 min", done: true },
        { id: 103, kind: "pdf", title: "Formula sheet — Chapter 4", meta: "1 page", done: true, preview: true, url: "/samples/shm-formula-sheet.pdf" },
        {
          id: 104, kind: "quiz", title: "MCQ quiz — Chapter 4", meta: "5 questions", done: false, points: 30, dueDate: dayFromToday(2), questions: ch4Quiz,
          scores: { 2: 30, 3: 12, 4: 24, 5: 18, 7: 30 },
          answers: { 2: [true, true, true, true, true], 3: [true, false, false, true, false], 4: [true, true, false, true, true], 5: [true, false, true, false, true], 7: [true, true, true, true, true] },
        },
        { id: 105, kind: "task", title: "Submit creative questions 1–5", meta: "Written answers", done: false, points: 20, dueDate: dayFromToday(4), submissions: { 2: { fileName: "rafsan-cq-1-5.jpg", at: at(-1, 21) } } },
        {
          id: 106, kind: "exam", title: "Written test — Chapter 4", meta: "Creative questions · 40 min", done: false, points: 25, dueDate: dayFromToday(6),
          rubric: [{ name: "Method", max: 10 }, { name: "Final answer", max: 10 }, { name: "Presentation", max: 5 }],
          submissions: {
            2: { fileName: "rafsan-written.jpg", at: at(-1, 20), grade: 22, rubricScores: [9, 9, 4] },
            4: { fileName: "arif-written.jpg", at: at(-1, 20), grade: 18, rubricScores: [7, 7, 4] },
            5: { fileName: "mahin-written.jpg", at: at(-1, 20) },
          },
        },
      ],
    },
    {
      id: 2, batch: PH, title: "Chapter 5 · Waves", tag: "new", published: true,
      items: [
        { id: 201, kind: "video", title: "Lecture 1: Types of waves", meta: "Recording after today's live class", done: false },
        { id: 202, kind: "pdf", title: "Lecture notes (scanned)", meta: "1 page", done: false, url: "/samples/waves-notes-scanned.pdf" },
      ],
    },
    {
      id: 3, batch: PH, title: "Chapter 3 · Gravitation", tag: "completed", published: true,
      items: [
        { id: 301, kind: "video", title: "Revision class", meta: "65 min", done: true },
        { id: 302, kind: "quiz", title: "Model test — Gravitation", meta: "30 marks", done: true, points: 30, dueDate: dayFromToday(-10), scores: { 1: 26, 2: 28, 3: 19, 4: 25, 5: 22, 6: 18, 7: 29 } },
      ],
    },
    {
      id: 4, batch: MA, title: "Chapter 1 · Sets & Functions", tag: "inProgress", published: true,
      items: [
        { id: 401, kind: "pdf", title: "Sets formula sheet", meta: "3 pages", done: false },
        {
          id: 402, kind: "quiz", title: "Sets MCQ", meta: "", done: false, points: 10, dueDate: dayFromToday(3),
          questions: [
            { q: "How many subsets does a set with 3 elements have?", options: ["3", "6", "8", "9"], answer: 2 },
            { q: "A ∪ ∅ equals…", options: ["∅", "A", "U", "A′"], answer: 1 },
          ],
        },
      ],
    },
  ];

  const announcements: Announcement[] = [
    {
      id: 1,
      title: "Chapter 4 MCQ quiz",
      body: "The Chapter 4 (Simple Harmonic Motion) MCQ quiz is open in Modules. Revise pendulum and spring combination formulas before you start.",
      author: teacherName,
      batch: PH,
      at: at(0, 11),
      pinned: true,
    },
    {
      id: 2,
      title: "Chapter 5 lecture notes uploaded",
      body: "The 6-page Waves & Sound notes are in Module 2. Keep them open during the next live class.",
      author: teacherName,
      batch: PH,
      at: at(-1, 18, 40),
    },
    { id: 3, title: "Welcome to SSC Higher Math", body: "Bring a scientific calculator to every class.", author: "Rumana Ma'am", batch: MA, at: at(-3, 18) },
  ];

  const exploreVideos: ExploreVideo[] = [
    { id: 1, title: "Simple Harmonic Motion — full chapter in 1 video", thumb: "Simple Harmonic Motion", subject: "Physics", level: "HSC", teacher: "Tanvir Sir", views: 12000, postedAt: at(-2, 20), length: "0:20", free: true, url: "/samples/lecture-shm.mp4" },
    { id: 2, title: "Calculus: differentiation shortcuts", thumb: "d/dx shortcuts", subject: "Math", level: "HSC", teacher: "Rumana Ma'am", views: 8400, postedAt: at(-7, 19), length: "32:45", free: true },
    { id: 3, title: "Organic chemistry — naming made easy", thumb: "IUPAC naming", subject: "Chemistry", level: "HSC", teacher: "Sakib Sir", views: 5100, postedAt: at(-3, 21), length: "1:05:20", free: false },
    { id: 4, title: "SSC Higher Math: Trigonometry", thumb: "Trigonometry", subject: "Math", level: "SSC", teacher: "Tanvir Sir", views: 15000, postedAt: at(-30, 18), length: "41:00", free: true },
    { id: 5, title: "Cell division — mitosis & meiosis", thumb: "Cell division", subject: "Biology", level: "SSC", teacher: "Nadia Ma'am", views: 9900, postedAt: at(-5, 17), length: "27:30", free: false },
    { id: 6, title: "English Grammar: Narration in 30 min", thumb: "Narration", subject: "English", level: "SSC", teacher: "Farhan Sir", views: 20000, postedAt: at(-14, 16), length: "30:12", free: true },
    { id: 7, title: "Medical admission: 100 Biology MCQs", thumb: "100 MCQs", subject: "Biology", level: "Admission prep", teacher: "Nadia Ma'am", views: 31000, postedAt: at(-7, 20), length: "1:22:05", free: false },
    { id: 8, title: "Waves & sound — basics to creative", thumb: "Waves", subject: "Physics", level: "HSC", teacher: "Tanvir Sir", views: 4200, postedAt: at(0, 9), length: "55:40", free: true },
  ];

  const enrolledCourses: EnrolledCourse[] = [
    { id: "hsc-physics-a", title: "HSC Physics · A", teacher: "Tanvir Sir", schedule: "Sat, Mon, Wed · 4:30 PM", progress: 0, nextTopic: "" },
    { id: "hsc-math-b", title: "HSC Higher Math — Batch B", teacher: "Rumana Ma'am", schedule: "Sun, Tue, Thu · 6:00 PM", progress: 74, nextTopic: "Calculus: Integration by Parts", next: at(1, 18) },
    { id: "hsc-chem-a", title: "HSC Organic Chemistry", teacher: "Sakib Sir", schedule: "Fri, Sat · 7:30 PM", progress: 42, nextTopic: "IUPAC Naming & Isomerism", next: at(3, 19, 30) },
  ];

  const calendarEvents: CalendarEvent[] = [
    { id: 1, title: "HSC Higher Math: Integration", start: at(1, 18), end: at(1, 19, 15), meta: "Rumana Ma'am · Zoom", kind: "live" },
    { id: 2, title: "HSC Organic Chemistry: Isomerism", start: at(3, 19, 30), end: at(3, 20, 45), meta: "Sakib Sir · Zoom", kind: "live" },
    { id: 3, title: "HSC Physics: Standing Waves & Beats", start: at(5, 16, 30), end: at(5, 17, 45), meta: "Tanvir Sir · Zoom", kind: "live" },
  ];

  // Starts in ~20 minutes from when the demo data is created.
  const start = new Date(Date.now() + 20 * 60000);
  start.setSeconds(0, 0);
  const liveClass: LiveClassInfo = { batch: "HSC Physics · A", topic: "Chapter 5: Waves & Sound", start: start.toISOString(), link: "https://zoom.us/j/882019482" };

  const chats: ChatThread[] = [
    {
      id: "tanvir-sir", name: "Tanvir Sir", role: "HSC Physics · A", unread: 1, online: true,
      messages: [
        { id: 1, sender: "Tanvir Sir", text: "Hello Nusrat! Have you gone through the Chapter 4 formula sheet?", at: at(0, 15, 15) },
        { id: 2, sender: "Nusrat Jahan", text: "Yes sir, I practised the pendulum problems. I had a small doubt on phase difference.", at: at(0, 15, 18), mine: true },
        { id: 3, sender: "Tanvir Sir", text: "Great, I will cover phase difference in the first 10 minutes of the next live class.", at: at(0, 15, 22) },
      ],
    },
    {
      id: "physics-group", name: "HSC Physics · A — Group", role: "Class announcements & Q&A", unread: 2, online: true,
      messages: [
        { id: 1, sender: "Tanvir Sir", text: "Reminder: the Chapter 4 MCQ quiz is open in Modules.", at: at(0, 11) },
        { id: 2, sender: "Rafsan Ahmed", text: "Sir, will spring combination problems be included?", at: at(0, 11, 14) },
        { id: 3, sender: "Tanvir Sir", text: "Yes, series and parallel spring constants are in the quiz.", at: at(0, 11, 20) },
      ],
    },
    {
      id: "rumana-maam", name: "Rumana Ma'am", role: "HSC Higher Math — Batch B", unread: 0, online: false,
      messages: [
        { id: 1, sender: "Rumana Ma'am", text: "Uploaded the differentiation shortcut notes in Modules > Files.", at: at(-1, 20) },
        { id: 2, sender: "Nusrat Jahan", text: "Thank you Ma'am! Downloaded the PDF.", at: at(-1, 20, 30), mine: true },
      ],
    },
  ];

  // XP per student per day. Nusrat (1) has a 4-day streak up to yesterday, so studying today makes 5.
  const xp: Record<number, XpLog> = {};
  students.forEach((s) => {
    xp[s.id] = {};
    for (let d = 1; d <= 12; d++) if (s.id === 1 ? d <= 4 : (s.id * 3 + d) % 4 !== 0) xp[s.id][dayFromToday(-d)] = 10 + ((s.id * 7 + d * 5) % 40);
  });
  const points: ClassPoint[] = [
    { id: 1, studentId: 1, kind: "participation", at: at(-1, 17) },
    { id: 2, studentId: 1, kind: "homework", at: at(-3, 17) },
    { id: 3, studentId: 2, kind: "helping", at: at(-1, 17) },
    { id: 4, studentId: 3, kind: "lateHomework", at: at(-2, 17) },
  ];
  const story: StoryPost[] = [
    { id: 1, batch: PH, author: teacherName, text: "Great pendulum experiment today! Everyone measured the time period for 3 different lengths.", at: at(-1, 18) },
  ];

  return {
    teacherName,
    staff,
    viewer: "all", // teacher studio: "all" (centre owner) or one staff name
    instituteName: "", // shown on ID cards, certificates, receipts and print-outs (falls back to the owner's name)
    teacherLogin: "", // staff name that logged in with their mobile; "" or the owner = whole-institute view
    meId: 1, // the student account this browser is logged in as
    parentChildren: [1, 8], // the parent account's children
    nextStudentId: students.length + 1, // the next new student's roll number: only ever goes up, so nobody is given a removed student's number (0: not counted yet)
    feeMonth: dayFromToday(0).slice(0, 7), // last month fees were charged (YYYY-MM)
    reportComments: {} as Record<number, string>,
    xp,
    publicStats: null as null | { students: number; average: number | null }, // a public page's totals, counted on the server (nobody's marks are sent)
    leagueRank: {} as Record<number, Rank>, // weekly XP position in the batch, for the students this person may see (set by the server)
    points,
    story,
    portfolio: [] as PortfolioItem[],
    staffPayments: [] as StaffPayment[],
    notes: [] as Note[], // the student's saved key points
    routine: [
      { id: 1, day: 6, start: "16:30", end: "18:00", batch: PH, teacher: teacherName, room: "Room 1" },
      { id: 2, day: 1, start: "16:30", end: "18:00", batch: PH, teacher: teacherName, room: "Room 1" },
      { id: 3, day: 0, start: "17:00", end: "18:30", batch: MA, teacher: "Rumana Ma'am", room: "Room 2" },
    ] as Slot[],
    expenses: [] as Expense[],
    admissions: [] as Admission[],
    staffLeave: [] as StaffLeave[],
    staffAbsent: {} as Record<string, string[]>, // date -> staff names absent
    meetings: [] as Meeting[],
    doubts: [] as Doubt[],
    watch: {} as Record<number, Record<number, { sec: number; dur: number }>>, // video item id -> student id -> furthest second watched
    site: { slug: "tanvir-sir", bio: "", bkash: "", published: false } as TeacherSite,
    coupons: [] as Coupon[],
    community: [
      { id: 1, author: "teacher", text: "Welcome to our class community! Share useful notes and ask questions. Be kind — teachers can see and remove posts.", at: at(-6, 10), likes: [1, 2, 3], comments: [], reports: [], pinned: true },
      { id: 2, author: 2, text: "Uploaded my summary of SHM formulas — hope it helps for Sunday's test 📘", at: at(-1, 21), likes: [1, 4], comments: [{ id: 1, author: 1, text: "Thanks Rafsan, really helpful!", at: at(-1, 21, 30) }], reports: [] },
      { id: 3, author: 3, text: "Does anyone have the page number for the pendulum practice problems?", at: at(0, 9), likes: [], comments: [], reports: [] },
      { id: 4, author: 4, text: "Which chapter should we revise first for the #physics model test?", at: at(-2, 18), likes: [2], comments: [], reports: [], poll: { options: ["Waves", "Gravitation", "SHM"], votes: { 2: 0, 3: 2 } }, audience: "batch", batch: "HSC Physics · A" },
    ] as CommunityPost[],
    communityProfiles: { 2: { bio: "HSC Physics · loves solving numericals 🔢" } } as Record<number, CommunityProfile>,
    friendships: [
      { from: 1, to: 2, status: "friends" },
      { from: 3, to: 1, status: "pending" },
    ] as Friendship[],
    liveRooms: {} as Record<string, string>, // batch -> secret video-room name (unguessable, so strangers can't walk in)
    orders: [] as Order[],
    bank: [] as BankQuestion[], // teacher's own question bank (plus questions from their tests)
    batches, students, payments, attendance, modules, announcements, exploreVideos, enrolledCourses, calendarEvents, liveClass, chats,
  };
}

export const taka = (n: number) => "৳" + n.toLocaleString("en-IN");
