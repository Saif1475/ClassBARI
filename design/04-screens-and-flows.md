# 04 — Screen-by-Screen Redesign Blueprints (Web + 4 Flutter Apps)

This document maps out every major screen across the **Next.js Website** and **4 Flutter Mobile Apps** (`Instanton Student`, `Instanton Guardian`, `Instanton Campus`, and `Instanton AI`), showing the exact information hierarchy, decluttered layouts, and responsive transitions.

---

## 1. Marketing Landing Page (`/` — Website)

**Goal:** Immediately feel calm, trustworthy, and unmistakably Bangladeshi-academic—showing a coaching owner or parent in 5 seconds how simple Instanton Campus is, without visual gimmickry.

### Structure & Visual Upgrades
- **Top Nav (Frosted Chrome, `68px`):** `Logo` left · 3 clean links center (`Features`, `For Institutes`, `Pricing`) · `EN | বাং` + `Log In` + `Start Free` pill right.
- **Hero Section (Warm Paper Canvas `#FAF8F4`):**
  - Left column: Clean eyebrow pill (`Built for Bangladesh Coaching & Batches`), bold bilingual headline (`42–48px`), 2-line calm value prop, 2 clear CTAs (`Create Free Institute` primary pill + `Try Live Demo` outline pill), subtle trust row (`25 students free forever · Works on any Android phone`).
  - Right column: **Clean Interactive Preview Frame** (replaces mixed blob mockups) showing a real crisp Paper & Prism card stack: a Live Class Spine Card + a floating `✓ Attendance marked 28/30` pill + a `৳ 1,200 bKash Received` micro-toast that floats gently on hover.
- **Role Showcase Tabs (Sliding Segmented Control):** Interactive 4-tab switcher (`Student · Teacher · Guardian · AI Tutor`) displaying a focused 3-bullet benefit + clean mobile/desktop preview for each role.
- **3 Simple Steps Strip:** Clean numbered Paper Cards with `4px` subject spines (`1. Create Batch` → `2. Add Students via Excel/PDF` → `3. Teach, Test & Track`).
- **Deep Forest Toolkit Band (`--brand-deep`):** High-contrast showcase of Bangladesh-specific strengths (Bangla + English, Offline-tolerant mobile apps, Anti-piracy video, AI PDF Highlighter, QR Attendance, Seat Billing).

---

## 2. Unified Login & Onboarding (`/login` & Flutter `LoginScreen`)

**Goal:** Frictionless, calm entry whether the user is a 14-year-old student, a 55-year-old guardian, or a coaching director.

```
┌────────────────────────────────────────┐
│  [⚡ Instanton]             [EN | বাং]  │
├────────────────────────────────────────┤
│                                        │
│  Welcome back                          │
│  Sign in to continue to your campus.   │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ [Student][Teacher][Inst][Parent] │  │  ← SlidingSegmented (Web)
│  ├──────────────────────────────────┤  │    or PanelChoice (Campus App)
│  │  Find your institute             │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │ 🔍 Search name or code  ▾  │  │  │  ← Clean dropdown card
│  │  └────────────────────────────┘  │  │
│  │                                  │  │
│  │  [ Continue →                  ] │  │
│  │                                  │  │
│  │  ────────── or ──────────        │  │
│  │      ( G  Continue with Google ) │  │  ← Clear labeled pill button
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Key Improvements Over Current Login
1. **Calm Background Geometry:** Remove the 3 competing asymmetrical floating blobs (`rounded-[120px_40px_...]`); replace with a single subtle warm paper dot-grid watermark + soft brand top glow.
2. **Clear Google Button:** Replace Flutter's tiny unlabeled circle `'G'` icon button with a clear, high-trust full-width outline pill (`Continue with Google` + official colored G glyph) so non-technical students and guardians instantly recognize it.
3. **Guided Step Transitions:** Moving from `Institute Picker → Email → Password / Create → 6-Digit OTP` animates horizontally along a gentle shared axis (`220ms`) with a visible back pill (`Change institute` / `Change email`).

---

## 3. Student Experience (`/student` Web + `Instanton Student` Flutter App)

**Core Problem Solved:** Previously, Flutter dumped 10 utility rows above Chapters, and Web stacked 12+ cards in a single noisy column.

### 3.1 Redesigned Student Home ("3-Zone Calm Focus")

```
MOBILE / FLUTTER (390px)                  DESKTOP WEB (1280px)
┌──────────────────────────────┐          ┌────┬──────────────────────────────┐
│ (R) Home          [🔍] [🔔]  │          │Rail│ Top Bar: Courses|Explore  (R)│
│     HSC Physics · Batch A    │          ├────┼──────────────────────────────┤
├──────────────────────────────┤          │Home│ Hi, Rafi 👋                  │
│ ┌──────────────────────────┐ │          │Chap│ ┌──────────────────┐ ┌─────┐ │
│ │ ● LIVE IN 18 MIN   Phys  │ │          │Prac│ │ RIGHT NOW HERO   │ │DAILY│ │
│ │ Vector Calculus Part 2   │ │          │AI  │ │ Live / Next Less │ │RHYTH│ │
│ │ Sir Tariq · 4:30 PM      │ │          │Chat│ │ [ Join Class → ] │ │7d🔥 │ │
│ │ [ 🎥 Join Live Class → ] │ │          │    │ └──────────────────┘ │92%✓ │ │
│ └──────────────────────────┘ │          │    │                      └─────┘ │
│                              │          │    │ MY CHAPTERS         [See all]│
│ [🔥 7d] [✓ 92%] [🕒 4:30 PM] │          │    │ ┌────────┐┌────────┐┌───────┐│
│                              │          │    │ │┃Ch 1   ││┃Ch 2   ││┃Ch 3  ││
│ MY CHAPTERS         See all  │          │    │ │███░ 75%││██░░ 40%││█░░ 15%││
│ ┌────────────┐┌────────────┐ │          │    │ └────────┘└────────┘└───────┘│
│ │━━━         ││━━━         │ │          │    │                              │
│ │⚛ Ch 1      ││🧪 Ch 2     │ │          │    │ DUE SOON (max 3)  │ NOTICES  │
│ │Vectors     ││Thermodyn.  │ │          │    │ • Quiz 4 (Tomor)  │ • Exam   │
│ │████░ 80%   ││██░░░ 45%   │ │          │    │ • HW Sheet 2      │   dates  │
│ └────────────┘└────────────┘ │          │    └──────────────────────────────┘
│                              │
│ DUE SOON (max 3)             │
│ ┌──────────────────────────┐ │
│ │┃ 📝 Quiz 4 · Tomorrow  › │ │
│ │┃ 📄 HW Sheet · Fri     › │ │
│ └──────────────────────────┘ │
│                              │
│ QUICK TOOLS (4-tile row)     │
│ [✨ AI] [📅 Routine] [📷 QR] [•••]
│                              │
│  ╭────────────────────────╮  │
│  │ (Home) Chap  AI   Chat │  │ ← Floating Frosted Dock
│  ╰────────────────────────╯  │
└──────────────────────────────┘
```

### Hierarchy Rules
1. **Zone 1 — Right-Now Hero Card (Adaptive):**
   - Priority 1: Live class active or starting within 2 hours → Primary `Join Live Class` CTA.
   - Priority 2: Unfinished lesson or homework due today → `Continue Watching` / `Open Homework`.
   - Priority 3: All caught up → Calm celebratory card (`You're all caught up!`) with 1-tap `5-min Quick Practice` CTA.
2. **Zone 2 — Compact Daily Rhythm Strip:** 3 small scannable pills (`Streak`, `Attendance %`, `Next Class`). Tapping `Streak` opens the full Streak & Dojo Points detail sheet.
3. **Zone 3 — My Chapters Grid (Promoted Above Utilities!):** 2-column Book-Spine Grid on mobile, 3-column on desktop. Shows subject color top ribbon, chapter name, remaining count, and smooth `MarkBar`.
4. **Zone 4 — Due Soon & Latest Notice:** Capped strictly at **3 items** each with `See all` links.
5. **Zone 5 — Compact 4-Tile Quick Tools Row:** `AI Study Hub`, `Routine & Calendar`, `My QR ID`, and `More Tools` (opens a tidy bottom sheet holding Scan Notes, Handwriting OCR, Portfolio, Doubts, Skill Mastery, and Class Story—zero home clutter!).

### 3.2 Chapter & Lesson Viewer (`LessonScreen` / Web Lesson Modal)
- **Clean Spine Accent Header:** Chapter name + progress bar (`4 / 6 completed`) at top.
- **Clear Type Chips:** Videos (Teal glyph), PDFs (Amber glyph), Quizzes (Emerald glyph), Assignments (Plum glyph) grouped with crisp completion checkmarks.
- **Sticky Bottom Action Bar (Flutter & Mobile Web):** Always keeps `Mark as Complete` or `Submit Homework` comfortably under the thumb.

---

## 4. Teacher / Instructor Experience (`/teacher` Web + `Instanton Campus` Flutter App)

**Core Problem Solved:** Previously, Web packed 9 controls in the header, and Flutter stacked 9 menu rows before showing a batch's students.

### 4.1 Redesigned "Teacher Calm Desk" (Home / Today Tab)

```
MOBILE / FLUTTER                          DESKTOP WEB
┌──────────────────────────────┐          ┌────┬──────────────────────────────┐
│ (T) Today            [+ New] │          │Rail│ [HSC Phys ▾] [+ Create] (T)  │
│     Sunrise Coaching         │          ├────┼──────────────────────────────┤
├──────────────────────────────┤          │Day │ Good afternoon, Sir Tariq    │
│ ┌──────────────────────────┐ │          │Btch│ ┌──────────────────────────┐ │
│ │ TODAY · TUE 24 NOV       │ │          │Std │ │ TODAY'S CLASSES          │ │
│ │                          │ │          │Tool│ │ HSC Physics A · 4:30 PM  │ │
│ │ HSC Physics A · 4:30 PM  │ │          │Chat│ │ [✓ Attendance 26/28][Live]│ │
│ │ [✓ Attendance] [🎥 Live] │ │          │    │ │                          │ │
│ │                          │ │          │    │ │ SSC Math B · 6:00 PM     │ │
│ │ SSC Math B · 6:00 PM     │ │          │    │ │ [✓ Attendance 0/32]      │ │
│ │ [✓ Attendance]           │ │          │    │ └──────────────────────────┘ │
│ └──────────────────────────┘ │          │    │                              │
│                              │          │    │ NEEDS ATTENTION (max 3)      │
│ NEEDS ATTENTION              │          │    │ ┌────────────┐┌────────────┐ │
│ ┌──────────────────────────┐ │          │    │ │┃ 4 HW to   ││┃ 2 student │ │
│ │┃ 4 Homework to grade   › │ │          │    │ │  grade   › ││  doubts  › │ │
│ │┃ 2 Unanswered doubts   › │ │          │    │ └────────────┘└────────────┘ │
│ └──────────────────────────┘ │          │    │                              │
│                              │          │    │ MY BATCHES                   │
│ MY BATCHES                   │          │    │ ┌─────────┐┌─────────┐┌────┐ │
│ ┌──────────────────────────┐ │          │    │ │┃HSC Phy ││┃SSC Mat ││┃Bio│ │
│ │┃ HSC Physics A   28 std  │ │          │    │ │[Studio] ││[Studio] ││... │ │
│ │┃ Sat, Mon, Wed · 4:30 PM │ │          │    │ └─────────┘└─────────┘└────┘ │
│ │  [Studio]   [Attendance] │ │          │    └──────────────────────────────┘
│ └──────────────────────────┘ │
│  ╭────────────────────────╮  │
│  │ (Today) Batch Std Chat │  │
│  ╰────────────────────────╯  │
└──────────────────────────────┘
```

### 4.2 Redesigned Batch Studio (`BatchScreen` Flutter & Course Tab Web)
Instead of a 9-row vertical menu wall, group batch tools into **4 Clean Visual Buckets (2×2 Tile Grid on Mobile, Clean Left Sub-Nav on Desktop)**:
1. **Teach:** Chapters & Lessons · Live Classroom · Recorded Videos
2. **Assess:** Quizzes & Exams · Gradebook · Merit List
3. **Roster:** 1-Tap Attendance · QR Scanner · Student List
4. **Engage:** Notices · Dojo Points · Class Calendar

### 4.3 1-Tap Attendance Screen
- Top date strip (`< Today, 24 Nov >`) + quick search bar + `QR Scan` pill.
- Large `60px` student rows with instant `Present ✓` / `Absent ✕` spring toggle pills (one tap anywhere on the row!).
- Sticky frosted bottom bar showing real-time tallies (`Present: 26 · Absent: 2`) and a `Mark All Present` shortcut.

---

## 5. Institute Owner Experience (`/institute` Web + `Instanton Campus` Owner Mode)

**Goal:** Executive clarity on fees, staff, and student capacity without cluttering daily teaching flows.

- **Clean Financial Overview Strip (Top):**
  - 3 crisp Spine Metric Cards: **Collected This Month** (Emerald), **Fees Due** (Amber, with 1-tap `Send Reminders` pill), **Student Seats Used** (`142 / 250` with clean threshold color bar).
- **Teacher Filter Pill:** Compact horizontal segmented switcher (`All Teachers · Tariq Sir · Nadia Ma'am`) smoothly filters batches, income, and attendance without jarring page reloads.
- **Batch Settings Slide-Over Sheet:** Removes inline `<details>` form dumps inside Web batch cards! Clicking the clean `⚙ Settings` icon on a batch opens a spacious right-side drawer (desktop) / bottom sheet (mobile) containing Monthly Fee, Late Fine, Assigned Teacher, Class Days, Public Course toggle, and 1-tap Copy Invite Link.
- **Dedicated Fees & Payroll View:** Clean tabular layout (`tabular-nums`), quick `Record Fee` modal with instant bKash/Cash/Nagad pill picker, and printable receipt preview.

---

## 6. Guardian Experience (`/parent` Web + `Instanton Guardian` Flutter App)

**Goal:** Designed specifically for Bangladeshi parents—warm, jargon-free, high-contrast, comfortable at `115%–130%` text size, and reassuring in under 3 seconds.

```
┌──────────────────────────────┐
│ (A) Home              [বাং]  │
│     Arafat · HSC Physics A   │
├──────────────────────────────┤
│ [Arafat] [Nusrat]            │ ← Shown only if 2+ children
│                              │
│ ┌──────────────────────────┐ │
│ │ THIS MONTH AT A GLANCE   │ │ ← Warm Calm Card (Crisp Paper +
│ │                          │ │   Emerald top bar, high contrast)
│ │ [📅] Attended 11 of 12 › │ │
│ │ ──────────────────────── │ │
│ │ [📝] Last test: 26/30  › │ │
│ │      Chapter 4 MCQ       │ │
│ │ ──────────────────────── │ │
│ │ [💳] ৳ 1,200 fee due     │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ TALK TO TEACHER          │ │
│ │ [ 📞 Call Tariq Sir    ] │ │ ← 54px high-contrast primary pill
│ │ [ 💬 Message Teacher   ] │ │ ← 54px soft tonal pill
│ └──────────────────────────┘ │
│                              │
│ UPCOMING CLASSES             │
│ ┌──────────────────────────┐ │
│ │ [24 TUE] Vector Live     │ │
│ │          4:30 PM · Live  │ │
│ └──────────────────────────┘ │
│                              │
│  ╭────────────────────────╮  │
│  │ (Home) Res  Notc  Chat │  │
│  ╰────────────────────────╯  │
└──────────────────────────────┘
```

### Key Guardian Upgrades
1. **Replace Raw Emojis with Crisp Colored Icon Glyphs:** Clean accessible vector icons inside tinted `38×38px` badges instead of mismatched OS emojis (`📅`, `💳`, `📝`).
2. **Visual Attendance Strip (Results Tab):** Compact color-coded calendar pills (`12 Nov ✓`, `14 Nov ✓`, `16 Nov ✕`) with clear Present/Absent legend and subtle checkmark/cross icons so colorblind parents never rely on red/green alone.
3. **Calm Fee Banner:** Amber warm-paper tone (never aggressive shouting red unless overdue), plain-language instructions (`Pay at institute office` or `Pay via bKash`), and 1-tap Receipt download.

---

## 7. Instanton AI Tutor (`Instanton AI` Flutter App + Web AI Tab)

**Goal:** Calm, notebook-like study partner—feels faster, smarter, and far more legible than generic dark chat clones.

- **Top Bar (`56px`):** Left Drawer icon (Topic-grouped chat history) · Center **Model Selector Pill** (`Gemini / Claude · Free or Pack badge ▾`) · Right `New Chat` pencil icon.
- **Empty Welcome Canvas:** Centered Instanton AI mark (`52px`), warm personal greeting (`What are we studying today, Rafi?`), horizontal Subject Topic chips (`⚛️ Physics · 4`, `🧪 Chemistry · 2`) if chats exist, and 3 clean starter prompt cards with subtle `4px` spines.
- **Conversation Stream:**
  - User prompt: Clean right-aligned warm stone bubble (`max-width: 82%`).
  - AI answer: Clean **full-width editorial layout directly on Warm Paper** (`max-width: 720px` centered on desktop) with styled callout boxes for key formulas, crisp tables, and quiet bottom action icons (`Copy`, `Try Again`, `Save PDF`).
- **Floating Composer Dock:** Rounded `24px` frosted container with inline attachment preview chips (photo thumbnail or attached `.docx`/`.pdf` pill) and compact toggle pills for `Create PDF`, `Highlight PDF`, and `Think`.

---

## 8. Unified Settings (`/settings` Web + Flutter `SettingsScreen`)

- **Profile Header Card:** Clean horizontal identity card with `56px` Avatar, Name, Email, and Role tag.
- **Live Interactive Appearance Preview Card (New!):** A compact mini-card preview right at the top of the Appearance box that immediately reflects changes as the user switches **Forest Chalk / Sky Blossom**, **Light / Dark / System**, drags the **Text Size Slider (`90%–130%`)**, or scrubs the **Glass Slider (`0–3`)**!
- **Grouped Settings Cards:**
  1. `Appearance & Reading` (Tone radio preview cards, Theme segmented pill, Text Size slider, Glass slider, Language segmented pill)
  2. `Notifications` (Clean toggle switches synced across Web & Mobile)
  3. `Security & Password`
  4. `Institute Plan & Backup` (Owner only)
  5. `Help & About` + Soft Danger `Log Out` button at bottom.
