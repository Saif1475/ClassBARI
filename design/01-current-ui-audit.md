# 01 — Current UI & UX Audit (Website + 4 Flutter Apps)

This audit captures the exact state of the **Instanton Campus (ClassBARI)** user interface across the Next.js website (`src/`) and all four Flutter apps (`flutter/`), including rendered visual checks (`data/app-screens/`), stylesheet/theme analysis (`src/app/globals.css`, `flutter/lib/theme.dart`, `flutter/lib/ui.dart`), and role-by-role layout review.

---

## 1. Environment & Inspection Notes

- **Next.js Dev Server (`npm run dev`):** Started cleanly on `http://localhost:3000` (Next.js 16.4.6 webpack). Note for future engineering work: `src/instrumentation.ts` → `src/lib/notify-server.ts` → `web-push` currently emits a webpack compilation error (`Module not found: Can't resolve 'http'` inside `agent-base`) when compiling the edge/instrumentation bundle. Per task rules, **no codebase files were modified**.
- **Rendered Visual References Inspected:** Actual rendered captures from `data/app-screens/` (e.g., `import-columns-website.png` and `import-columns-app.png`) confirmed the live visual appearance of both Web and Flutter side-by-side: mint-tinted surface gradients, pill buttons, soft white elevated containers, green emerald accents (`#157347`), and clean field cards.
- **Full Source Audit:** Reviewed `globals.css`, `fonts.ts`, `theme.ts`, `Brand.tsx`, `SlidingSegmented.tsx`, `SlideIndicator.tsx`, `BottomBar.tsx`, `page.tsx`, `login/page.tsx`, `student/page.tsx`, `TeacherApp.tsx`, `parent/page.tsx`, `settings/page.tsx`, and Flutter's `theme.dart`, `ui.dart`, `login.dart`, `student.dart`, `teacher.dart`, `institute.dart`, `guardian.dart`, `lesson.dart`, `ai_chat.dart`, and `settings.dart`.

---

## 2. What Already Works Great (Keep & Elevate)

Before redesigning anything, it is critical to preserve the genuinely smart engineering and UX decisions already built into Instanton Campus:

1. **Bilingual Typography & Subset Engineering:** Pairing `Plus Jakarta Sans` (English) with `Hind Siliguri` (Bangla), plus 1 KB micro-subsets for `৳` and `বাংলা`, gives instant rendering and legible Bangla glyphs.
2. **User-Controlled Personalization:** Light / Dark / System mode, **Green** and **Sky & Pink** color tones (with respectful defaults), **Text Size Slider (`90%–130%`)**, and **Glass Slider (`0–3`)** synchronized conceptually between Web and Flutter.
3. **Accessibility Foundations:** Large touch targets in Flutter (`minHeight: 48–56`, `Doing` buttons `52px`), semantic wrappers (`Semantics`, `liveRegion: true`, `aria-current`, `aria-expanded`), and `prefers-reduced-motion: reduce` hooks in CSS.
4. **Low-End Android Empathy:** `globals.css` already turns off `backdrop-filter` on scrolling cards below `768px`, and Flutter's `_Frost` restricts `BackdropFilter` to large chrome panels rather than list rows.
5. **Plain-Language Guardian Framing:** The Guardian portal's *"This month at a glance"* card (Attendance, Fees, Last Test) speaks like a caring human rather than an ERP system.
6. **Clean Bulk Import Verification UX:** As seen in the rendered Web & Flutter import screenshots, showing column auto-mapping with inline live row previews and color-coded error explanations is remarkably clear and trustworthy.

---

## 3. Key Visual & UX Friction Points to Solve

### A. Visual Identity Dilution (3 Competing Design Languages)
Currently, the app blends three incompatible aesthetics without a unifying signature:
- **Material 3 Expressive organic blobs** on Landing & Login (`rounded-[40px_40px_40px_12px]`, `rounded-[160px_48px_...]`, asymmetrical avatar badges).
- **iOS 26 3D liquid glass** in `globals.css` (`.glass-3d` with multi-stop glossy inset highlights, saturated `backdrop-filter`, and heavy shadows).
- **Standard flat Material 3 cards** in Flutter (`CourseCard`, `Box`, `Group`) sitting over diffuse green/pink radial blobs (`Backdrop`).

**Impact:** The platform looks clean and functional, but feels "assembled from parts" rather than crafted under one iconic, memorable visual identity.

### B. Student Home Overload (Both Flutter & Web)
- **Flutter (`student.dart`):** `StudentHome` renders a hero card, then dumps **10 stacked utility rows** inside a `Group` labeled `"More for you"` (Calendar, Routine, Practice, Dojo Points, Story, Skills, Portfolio, Doubts, My QR, Scan Notes) **above** the `"Chapters"` grid. A student opening the app to watch today's lecture has to scroll past 10 secondary tools first!
- **Web (`student/page.tsx`):** The Dashboard stacks **12+ vertical sections** in a single column (Greeting, Live Banner, Homework, Keep Learning, Live Poll, AI Study Hub, Routine, Push Toggle, Streak Card, Game/Practice tiles, Points + StoryFeed, Announcements, and a `"My things"` accordion). Even with good cards, the vertical stack feels busy rather than focused.

### C. Teacher & Institute Chrome Density
- **Web Desktop Header (`TeacherApp.tsx`):** Packs **9 distinct controls** into one horizontal bar: Logo + Studio Badge + Batch `<select>` + `+ Post Item` + `Student View` + `A / A+ / A++` + `EN / বাং` + `Theme Orb` + `Avatar`. For less tech-savvy teachers on 1280px–1366px laptops, this top bar feels crowded and wraps unpredictably.
- **Flutter Batch Screen (`teacher.dart`):** `BatchScreen` places **9 vertical menu rows** (`Course studio`, `Grades`, `Live`, `Live Room`, `Explore Video`, `Dojo`, `Calendar`, `Recorded`, `Merit`) above the student list. Teachers mostly want 3 daily things: **Attendance**, **Post/Open Lesson**, and **Message/Notice**.
- **Inline Batch Settings (`TeacherApp.tsx`):** Expanding `<details>` inside a 3-column grid batch card turns a neat overview card into an awkward tall form with tiny `h-9` inputs.

### D. Surface Contrast & Form Consistency
- As visible in `import-columns-website.png`, subtle green-tinted mint containers stacked inside light mint backgrounds can blur visual boundaries between the page canvas, container groups, and individual input rows.
- Some Web buttons are `rounded-full`, inputs are `rounded-xl`, cards are `rounded-[18px]` or `rounded-[20px]`, and `.slide-pill` forces `border-radius: 12px !important`—creating subtle corner-radius clashes where a `12px` sliding pill appears inside a `rounded-full` group.

### E. Motion & Animation Friction Points
Auditing `globals.css`, `SlideIndicator.tsx`, `SlidingSegmented.tsx`, and Flutter `ui.dart` revealed several specific motion flaws:

| Location | Current Behavior | Why It Feels Wrong | Redesign Fix |
| :--- | :--- | :--- | :--- |
| `globals.css` (`main > *`) | Every direct child of `<main>` animates horizontally from `translateX(24px)` (`ios-rise`) with 40ms stagger | Vertical stacks sliding sideways feel jumpy/seasick; long pages stall waiting for stagger | Gentle **vertical** `translateY(10px) → 0` fade-up, tight `28ms` stagger, capped at first 4 elements |
| `globals.css` (`.slide-pill`) | Hardcoded `border-radius: 12px !important` | Clashes visually inside `rounded-full` nav pills (`TextSize`, `BottomBar`, side rail) | Inherit target element's computed `borderRadius` dynamically |
| `globals.css` (`.glass-3d` buttons) | Heavy multi-layered specular shadow + `scale(0.96)` active press | Feels overly glossy/plastic compared to the calm academic content | Crisp tactile surface with subtle `scale(0.975)` spring press and clean elevation |
| Flutter `Tabs` (`ui.dart`) | Raw `IndexedStack` switch | Instant zero-transition hard cut between tabs feels rigid | Subtle `180ms` cross-fade + `6px` vertical settle (`AnimatedSwitcher` or fade-lift wrapper) |
| Flutter `push()` (`ui.dart`) | Default platform `MaterialPageRoute` | Generic OS transition; no shared personality with Web | Custom `PaperPageRoute` (shared-axis subtle slide + fade, `280ms`, `Cubic(0.22, 1, 0.36, 1)`) |
| Flutter `CourseCard` / `Doing` | Standard `InkWell` splash only | Lacks the tactile physical spring feedback students love | Add `TactileTap` press wrapper (`scale 1.0 → 0.975` in `90ms`, spring release `220ms`) |
| Gamification & Study Feedback | Static text / instant color swaps on quiz submit, streak, attendance | Misses joyful student motivation & reassuring teacher confirmation | Purposeful, lightweight micro-celebrations (check-pop, streak glow, gentle wrong-answer nudge, 1-tap attendance flip) |

---

## 4. Summary of Strategic Shifts

| Dimension | Current State | New "Paper & Prism" Direction |
| :--- | :--- | :--- |
| **Background Canvas** | Cool pale mint (`#f6fbf9`) + diffuse blobs | Warm notebook ivory (`#FAF8F4`) / deep ink-slate (`#0D1114`) |
| **Signature Visual Hook** | Mixed M3 blobs + glossy iOS glass | **4px Subject Book-Spine Ribbon** + warm paper index cards + frosted chrome only |
| **Glassmorphism** | Applied to cards, pills, headers, inputs | **Chrome-only** (headers, docks, rails, sheets, sliding pills); crisp blur-free content cards |
| **Student Home** | 10+ stacked utilities before chapters | **3-Zone Calm Focus:** Right-Now Hero → Daily Rhythm Strip → Visual Chapter Spine Grid |
| **Teacher Experience** | 9-control header + 9-row tool menu | **4-cluster header** + **Today's Desk** hero + **4-bucket grouped tool tiles** + slide-over batch settings |
| **Motion System** | Horizontal `ios-rise`, radius clashes, abrupt Flutter cuts | Cohesive **Paper & Spring** motion grammar with Web ↔ Flutter exact physics parity |
