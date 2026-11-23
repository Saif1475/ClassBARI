# 03 — Component Library Specification (Web + Flutter Parity)

Every component below is specified for simultaneous parity across **Next.js (React + Tailwind CSS v4)** and **Flutter (`flutter/lib/ui.dart`)**. Touch targets are strictly `≥48px` (`48dp`) so students on compact Android screens and older teachers can tap confidently without mis-taps.

---

## 1. Navigation Shell Components

### 1.1 Uncluttered Top Bar (`TopHeader` / `TopBar`)
Replaces the crowded 9-item desktop header in `TeacherApp.tsx` and brings crisp calm structure to phones.

- **Desktop Height:** `68px` · Sticky · Restrained frosted chrome (`--glass-level`) with `1px` bottom hairline.
- **Desktop Maximum 4 Clusters:**
  1. **Left:** `Logo` (Mark + `Instanton Campus`) + subtle Role Pill (`Teacher` / `Institute` / `Student`).
  2. **Center-Left:** Contextual Switcher — **Batch Pill Selector** (Teacher/Institute) or **Course / Explore Sliding Pill** (Student) or **Child Switcher** (Guardian).
  3. **Center-Right:** Compact Search pill (Student/Teacher roster) OR Primary `+ Create` split button (Teacher).
  4. **Right:** Compact `EN | বাং` toggle + **Avatar Menu Button** (`40×40px` circle — opens quick popover for Theme, Text Size `90%–130%`, `Student View` preview, Settings, and Log Out).
- **Mobile & Flutter Height:** `56px` + safe area inset.
  - **Root Tab:** Left `Avatar` (`38px`, opens Side Drawer) + Tab Title (`21px` bold) + Context subtitle (`13px` muted, e.g., batch or child name) + max 1 right action icon (e.g., `+` or Search).
  - **Drill-in Page:** Left Back button (`48×48` hit box) + Page Title (`18px` bold) + optional 4px Subject Spine top tint bar instead of loud full-gradient headers (preserves clean legibility and calm eyes).

### 1.2 Floating Mobile Bottom Dock (`BottomBar` / `Tabs`)
Replaces full-bleed edge-to-edge bottom bars with a signature airy **Paper & Prism** dock.

- **Visual Form:**
  - Floats `10px` above the bottom safe-area inset (`margin: 0 12px 10px`), `height: 64px`, `border-radius: 24px`, Frosted Chrome (`E2` shadow + `1px` top specular edge).
  - Falls back to docked flush bar automatically when screen width `< 340px` or user text scale `≥ 120%`.
- **Tab Capacity:** Strictly **4 tabs** (max 5 including overflow `More` popover).
  - **Student:** `Home · Chapters · AI / Practice · Chat`
  - **Teacher:** `Today · Batches · Students · Chat`
  - **Institute:** `Overview · Batches · Fees · People`
  - **Guardian:** `Home · Results · Notices · Chat`
- **Active State:** Single shared sliding frosted pill (`52×32px`, `radius: 9999px`, `--brand-soft` fill) glides smoothly horizontally between tabs (see `05-animations-and-motion.md` §4.2). Label shifts to `--ink-primary` bold `11.5px`.
- **Notification Badge:** Warm accent pill (`--accent-warm`), `min-width: 18px`, `height: 18px`, `tabular-nums`, Bangla digits when `lang === 'bn'`.

### 1.3 Desktop Left Navigation Rail
- **Width:** `80px` · Fill `--brand-deep` (Forest Deep `#0B3B25` or Sky Deep `#10395C`) with subtle frosted texture.
- **Active Item:** Vertical gliding indicator capsule (`52×36px`, `radius: 14px`) in `--brand-soft` with `--brand-deep` icon color.
- **Contextual Secondary Drawer (Course Studio Only):** `232px` wide, warm `#F5F2EC` paper-soft panel (`#12171C` dark) with `1px` border—never competes visually with the deep primary rail.

---

## 2. Signature Content Cards

### 2.1 "Right Now" Focus Hero Card (`FocusHeroCard`)
Used at the top of Student Home, Teacher Today's Desk, and Guardian Home.

- **Anatomy:**
  - `border-radius: 22px`, padding `20px` (mobile) / `24px` (desktop).
  - **Background:** Rich calm tonal gradient (`--brand-primary` → `--brand-deep` for active Live/Today state; OR warm crisp white Paper Card with a `6px` top accent bar when in calm study mode so the screen isn't visually heavy).
  - **Top Eyebrow Row:** Live status dot (`● LIVE IN 15 MIN` or `TODAY · 24 NOV`) + compact secondary tag (`HSC Physics`).
  - **Headline:** `20–22px` bold (max 2 lines).
  - **Supporting Line:** `14px` at `85%` opacity (teacher name, time, or due countdown).
  - **Action Row:** Maximum **1 primary high-contrast pill CTA** (`height: 48–52px`, pure white pill with `--brand-deep` text on dark hero; `--brand-primary` pill on paper hero) + optional 1 subtle ghost action.

### 2.2 Signature "Book-Spine" Chapter & Batch Card (`SpineCard` / `CourseCard`)
Replaces heavy colored-header gradient boxes with our signature modern-notebook identity.

```
┌─────────────────────────────────────────┐
│ ╭─╮  ┌────┐                     [68%]   │
│ │ │  │ ⚛ │  Ch 4: Newtonian Mechanics  │
│ │ │  └────┘  6 lessons · 1 quiz left    │
│ │ │                                     │
│ ╰─╯  ████████████░░░░░░                 │
└─────────────────────────────────────────┘
  ↑ 4px rounded subject spine (inset 12px vertically)
```

- **Surface:** Crisp Paper (`--bg-paper`), `1px solid var(--border-hairline)`, `border-radius: 18px`, shadow `E1`.
- **Book-Spine Bar:** `4px` wide vertical pill bar on the left edge (inset `12px` top/bottom, `margin-left: 6px`) colored in the chapter/batch's **Subject Spine Color** (`0–7`).
- **Grid Variant (2-column Student Chapters):** Places a `5px` horizontal **Bookmark Top Ribbon** across the top edge (with a subtle soft-tinted header strip `44px` tall showing the subject glyph + completion badge) so narrow 2-column cards keep maximum horizontal room for Bangla titles!
- **Auto-Reflow Rule:** Just like Flutter's `CardGrid`, automatically drops from 2 columns to 1 column whenever user text scale exceeds `120%`.
- **Progress Bar (`MarkBar`):** `7px` tall, full pill ends, `--bg-paper-soft` track, filled with the chapter's Subject Spine Color (`>=60%` green or subject color; `<60%` exam warning tint on grade cards).

### 2.3 Grouped List Card (`PaperGroup` / `Group` & `PaperRow` / `Item`)
- **Container:** `--bg-paper`, `border-radius: 18px`, `1px solid var(--border-hairline)`, zero blur.
- **Row Height:** Minimum `56px` (`60px` when subtitle is present).
- **Anatomy:** Leading `Glyph` (`38×38px`, `radius: 11px`, soft tint fill + `20px` stroke icon) → Title (`15.5px` semi-bold) + Subtitle (`13px` muted) → Trailing value/pill OR `chevronRight` (`18px`, `--ink-muted`).
- **Dividers:** `1px solid var(--border-hairline)`, inset `66px` on the left (aligned cleanly under text, never cutting under the leading icon tile!).

### 2.4 Daily Rhythm Strip (Student) & Executive Stat Strip (Institute)
- **Compact Metric Pill/Card:**
  - Student Rhythm Strip: Horizontal flex/scroll strip of **3 lightweight pills** (`🔥 7-day streak`, `✓ 92% attendance`, `🕒 Next: 4:30 PM`). Keeps motivation front-and-center in just `52px` of height!
  - Institute Executive Strip: 2-column (mobile) / 3-column (desktop) crisp Paper cards with `4px` semantic left spine:
    - Collected This Month (Emerald spine, `tabular-nums` bold `৳ 48,500`, `78% collected` sub-chip)
    - Pending Dues (Amber spine, `৳ 13,200`, `11 students` sub-chip)
    - Active Seats / Plan Meter (Primary spine, `142 / 250 students` + slim progress bar).

---

## 3. Buttons, Controls & Form Inputs

### 3.1 Action Buttons (`Button` / `Doing`)
All buttons share identical visual weights and built-in **loading / anti-double-tap** protection (`Doing` pattern from Flutter carried to Web!).

| Variant | Fill | Ink | Border | Height (Default / Compact) | Usage |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Primary** | `--brand-primary` | `#FFFFFF` (Dark: `#062B19`) | None | `48–52px` / `40px` | Main screen action (`Join Class`, `Save`, `Submit Quiz`) |
| **Soft Tonal** | `--brand-soft` | `--brand-primary` | None | `48px` / `40px` | Secondary positive action (`Attendance`, `Download Template`) |
| **Outline Paper** | `--bg-paper` | `--ink-primary` | `1.5px solid --border-strong` | `48px` / `40px` | Neutral actions (`Cancel`, `Preview`, `Filter`) |
| **Warm Highlight** | `--accent-warm` | `#2D1902` (Sky: `#FFFFFF`) | None | `48–52px` | Live Class CTA, Upgrade / High-priority action |
| **Danger Soft** | `--danger-soft` | `--danger-ink` | None | `48px` / `40px` | `Log out`, `Delete chat`, `Remove student` |

- **Radius:** `9999px` (full pill) for hero/standalone actions; `14px` rounded-rect inside dense modal/dialog footers and full-width Flutter `Doing` blocks so stacked buttons look grounded and calm.
- **Loading State:** Label subtly fades to `75%` and leading icon swaps seamlessly into an `18px` smooth spinner without shifting button width!

### 3.2 Sliding Segmented Control (`SlidingSegmented` & Flutter `SlidingChips`)
Fixes the current Web `.slide-pill` radius mismatch and brings the beloved gliding pill to Flutter too!

- **Container ("Well"):** `--bg-paper-soft` (or frosted well at Glass `≥2`), `padding: 4px`, `border-radius: 14px` (or `9999px` when pill-shaped).
- **Gliding Thumb:** Pure `--bg-paper` (light) / `#25313B` (dark) with shadow `E1` for neutral switches (`Light | Dark | System`, `EN | বাং`), OR `--brand-primary` for high-emphasis role/mode toggles.
- **Radius Sync Rule:** Thumb radius ALWAYS equals `containerRadius - 4px` (e.g., `14px` container → `10px` thumb; `9999px` pill container → `9999px` pill thumb).

### 3.3 Form Inputs & Pickers
- **Height:** `50px` (`min-height: 48px`) for comfortable tapping and generous Bangla vertical padding.
- **Resting State:** `--bg-paper` fill, `1.5px solid --border-strong`, `border-radius: 12px`.
- **Focus State:** `2px solid --brand-primary` + subtle `4px` soft halo (`rgba(20, 108, 67, 0.14)`). Never jarring black outlines.
- **Error State:** `1.5px solid --danger-ink` + inline plain-language helper message underneath with a tiny alert icon (never color-only!).
- **Institute Search Picker:** Keep the clean Canvas-style searchable dropdown (`InstitutePicker`), upgrading list items to use the **Book-Spine initial tile** (`40×40px`, `radius: 12px`) + crisp monospace institute code badge.

---

## 4. Domain-Specific Signature Components

### 4.1 1-Tap Attendance Row (`AttendanceRow`)
Designed so a teacher can mark 40 students in under 25 seconds with one thumb:
- **Row Height:** `60px` · Full row is tappable.
- **Left:** Student Initial Avatar (`38px`) + Student Name (`15.5px` bold) + Roll / Mode tag (`Offline` / `Online`).
- **Right:** Spring-animated status pill (`96px` fixed width so rows align cleanly):
  - **Present:** Soft Emerald fill + `✓ Present`
  - **Absent:** Soft Coral fill + `✕ Absent`
- **Sticky Summary Dock (Bottom):** Floating frosted bar displaying live counters (`Present 26 · Absent 2`) + `QR Scan` icon button + `Done` pill.

### 4.2 Quiz & Exam Runner (`QuizRunner` / `QuizBox`)
Built for **zero visual distraction** and **calm exam focus**:
- **Focus Header:** Progress bar (`Question 4 of 15`) + Calm Exam Timer Pill (static warm stone normally → amber under 5 min → soft rose pulse under 60 sec).
- **Option Cards:** Full-width `min-height: 54px` paper tiles with a clear circular option badge (`A`, `B`, `C`, `D` / `ক`, `খ`, `গ`, `ঘ`). Tapping fills the badge in `--brand-primary` and tints the card border + background (`--brand-soft`).
- **Question Navigator Strip:** Compact scrollable numbered dots at top/bottom showing answered (solid primary), flagged for review (warm amber ring), and unanswered (hairline outline).
- **Result Card:** Celebratory calm score ring (`24 / 30 · 80%`), personal rank pill (privacy-preserving: never exposes other students' scores), and clear expandable Mistake Review cards.

### 4.3 Anti-Piracy Smart Video Player (`VideoPlayer` / `VideoBox`)
- **Frame:** `16:9` container, `border-radius: 16px`, deep charcoal `#0C0F12` cinema canvas.
- **Floating Watermark:** Discreet low-opacity (`14%`) student identity tag (`Name · Phone/Email`) that drifts gently every 30s without obstructing whiteboard equations.
- **Controls:** Clean bottom frosted control bar (`48px` play/pause, `-10s / +10s`, speed pill `1× / 1.25× / 1.5× / 2×`, fullscreen) + watched-progress indicator bar synced to teacher analytics.

### 4.4 Instanton AI Study Chat (`AiChat` / `AiChatApp`)
- **Student Bubble (Right):** Compact warm stone pill (`--bg-paper-soft`, max-width `82%`, `border-radius: 20px 20px 6px 20px`).
- **AI Answer (Editorial Canvas):** Rendered **directly on the warm paper canvas** (no heavy outer bubble box!) with crisp typography, formatted math/code blocks, subtle collapsible source/thinking pill, and quiet action icons underneath (`Copy`, `Retry`, `Save as PDF`).
- **Generated / Highlighted PDF Card:** Paper card with `4px` Emerald spine, file icon, highlight count badge, and primary `Download PDF` pill.
- **Floating Composer Dock:** Rounded `24px` frosted paper input sitting `10px` above bottom edge:
  - Top row: Auto-expanding textarea (`Ask anything from your chapter…`) + circular Send/Stop button (`40px`).
  - Bottom compact tool strip: `+ Attach` (Camera / Photo / Word / Excel / PDF) + compact toggle chips for `PDF`, `Highlight`, `Think` (active pills glow in `--brand-soft` with `--brand-primary` text).

### 4.5 Bulk Student Import Mapper (Web & Flutter)
Building directly on the strong existing screen inspected in `import-columns-website.png` and `import-columns-app.png`:
- **3 Clear Numbered Step Indicators:** `1. Upload File` → `2. Match Columns` → `3. Review & Import`.
- **Column Mapping Rows:** Crisp Paper cards on warm canvas (higher separation than current mint-on-mint), with detected header bold on left, sample values in muted italic, and clean rounded dropdown on right.
- **Validation Preview:** Ready rows carry a green `✓` leading glyph; fix-needed rows carry a soft coral surface + `4px` red left spine + bold actionable fix hint (e.g., *"Enter a Gmail address (name@gmail.com)"*) + `Download rows to fix` soft button.

### 4.6 Dialogs, Bottom Sheets, Toasts & Empty States
- **Mobile Sheets:** `border-radius: 26px 26px 0 0`, centered `36×4px` warm stone drag handle at top, Frosted Chrome surface (`E3`), max height `90dvh`.
- **Desktop Modals:** Centered, `max-width: 560px` (or `720px` for Lesson Viewer), `border-radius: 24px`, soft dimmed backdrop `rgba(13, 17, 20, 0.42)`.
- **Toasts / Snackbars:** Floating pill (`border-radius: 16px`), deep ink `#18211C` (light mode) / warm paper `#F2F4F2` (dark mode), optional inline `Undo` pill button, sits `14px` above the mobile bottom dock.
- **Friendly Empty States:** Never leave a cold one-line text string alone. Pair a soft `56×56px` tinted circular icon badge + friendly 1-sentence message + 1 clear next-step button (e.g., *"No homework due today — enjoy a quick 5-minute practice!"* → `[Start Practice]`).
- **Skeleton Loaders:** Warm paper-tinted rounded blocks (`#EFECE4` → `#F8F6F0` sheen in light; `#1C242B` → `#242E37` in dark) matching the exact card silhouette so layout never jumps on load.
