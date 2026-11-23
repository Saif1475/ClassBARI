# Instanton Campus — UI & Motion Design System ("Paper & Prism")

> **Scope:** Complete visual, structural, component, screen, and motion specification for the **Instanton Campus (ClassBARI)** web platform (Next.js + Tailwind CSS v4) and its four companion Flutter mobile apps (**Instanton Student**, **Instanton Guardian**, **Instanton Campus**, and **Instanton AI**).
>
> **Status:** Documentation & Design Blueprint (zero codebase changes made).

---

## 1. Design Vision: "Paper & Prism"

Most education platforms fall into one of two traps: they look like sterile enterprise spreadsheets (intimidating for students and older teachers), or they look like loud arcade games (exhausting for daily coaching management and exam prep).

**Instanton Paper & Prism** introduces a distinctive, calm, and unmistakably original identity rooted in how students and teachers in Bangladesh actually work:

1. **Warm Notebook Paper Canvas ("Kagoj"):** Instead of harsh clinical white or generic cold gray, every screen rests on a warm, eye-friendly ivory paper canvas (`#FAF8F4` in Light Mode; deep ink-slate `#0D1114` in Dark Mode). Crisp elevated white cards sit on top like clean study index cards.
2. **Signature "Book-Spine" Subject Ribbon:** Rather than mixing random organic blob shapes with generic cards, every batch, chapter, notice, and homework card carries a subtle **4px rounded vertical spine accent** (or top bookmark strip) color-coded by subject across an 8-color Ink & Chalk palette. It makes the platform recognizable from a single glance.
3. **Restrained "Frosted Chrome, Crisp Paper" Glass:** Translucent frosted glass is preserved—along with the user-controlled **Glass Intensity Slider (`0–3`)**—but applied *only* to navigation chrome (top bar, side rail, floating mobile dock, sliding segmented pill, popovers, and sheets). Content cards remain crisp, high-contrast, and blur-free so reading is effortless and low-end Android phones stay locked at 60 FPS.
4. **Student-Friendly, Teacher-Friendly, Parent-Reassuring:**
   - **Students** see *"Right Now"* first (live class or next lesson), a compact motivating daily rhythm strip (streak + attendance), and visual chapter spine cards immediately—never buried under ten utility rows.
   - **Teachers** get a calm *"Today's Desk"* with giant `≥48px` touch targets, 1-tap attendance flipping, grouped tool tiles instead of endless lists, and uncluttered desktop headers.
   - **Guardians** get plain-language *"3-Question Peace of Mind"* cards (Attendance, Last Test, Fee Status) built for effortless Bangla readability at up to `130%` text scale.
   - **Instanton AI** feels like an intelligent study notebook: crisp prompts on the right, clean distraction-free editorial answers directly on warm paper, and tactile tool pills (`Create PDF`, `Highlight`, `Think`).
5. **Purposeful, Tactile Motion:** Every transition behaves like real stationery and glass—swift, weighted, calm, never disorienting during exams, and strictly respecting `prefers-reduced-motion` and low-end Android frame budgets.

---

## 2. Core Design Principles

| Principle | What It Means in Practice |
| :--- | :--- |
| **Simple Before Clever** | Maximum 1 primary action per card, max 4–5 items in mobile bottom docks, max 4 control clusters in desktop headers. Secondary tools use progressive disclosure. |
| **Bilingual First (EN + বাংলা)** | All spacing, line heights (`1.58` for Bangla body), pill widths, and button containers are designed natively for `Plus Jakarta Sans` + `Hind Siliguri` from `90%` to `130%` user text scale. |
| **Thumb & Elder Friendly** | Every interactive control is at least `48×48dp` (`44–48px` web), primary teacher/guardian actions are `52–56px` tall, and WCAG AA contrast (`≥4.5:1` text, `≥3:1` UI) holds across Light, Dark, Forest Chalk, and Sky Blossom themes. |
| **One Brand, Five Surfaces** | Website, Student App, Guardian App, Campus (Teacher/Institute) App, and AI App share identical tokens, shapes, icons, and animation curves—differing only in role-appropriate content priority. |
| **60 FPS on Budget Android** | Animations use GPU-composited `transform` and `opacity` exclusively. Heavy backdrop blurs are excluded from scrollable cards and disabled below 768px on the web when scrolling. |

---

## 3. Documentation, Interactive Prototype & Visual Mockups

Read the design specification in order, open the **clickable live prototype**, or browse the **2× retina visual mockups**:

| # | File / Folder | What It Covers |
| :---: | :--- | :--- |
| **Live** | [prototype.html](./prototype.html) | **Interactive clickable HTML prototype** (works offline in any browser): switch between Student, Teacher (live 1-Tap Attendance), Guardian, Instanton AI, and Animations Lab; toggle Desktop/Mobile, Forest Chalk/Sky Blossom, Light/Dark, EN/বাংলা, and Glass `0–3`. |
| **PNGs** | `mockups/` | High-resolution 2× visual design screens: [01-student-desktop-web.png](./mockups/01-student-desktop-web.png), [02-student-mobile-app.png](./mockups/02-student-mobile-app.png), [03-teacher-desk-attendance.png](./mockups/03-teacher-desk-attendance.png), [04-guardian-mobile-app.png](./mockups/04-guardian-mobile-app.png), [05-instanton-ai-mobile.png](./mockups/05-instanton-ai-mobile.png), [06-dark-mode-student.png](./mockups/06-dark-mode-student.png), [07-sky-blossom-theme.png](./mockups/07-sky-blossom-theme.png), [08-animations-lab.png](./mockups/08-animations-lab.png), [09-teacher-campus-mobile-app.png](./mockups/09-teacher-campus-mobile-app.png). |
| **01** | [01-current-ui-audit.md](./01-current-ui-audit.md) | Visual & UX audit of the current website and 4 Flutter apps: strengths to keep, clutter & visual inconsistencies to solve, motion bugs found in `globals.css` / `ui.dart`, and dev environment notes. |
| **02** | [02-visual-system.md](./02-visual-system.md) | Complete design token reference: Color palettes (Light/Dark, Forest Chalk & Sky Blossom tones, semantic statuses, 8 Subject Spine colors), English/Bangla typography scale, spacing, responsive grids, elevation, restrained glass levels (`0–3`), shapes, and brand mark usage. |
| **03** | [03-components.md](./03-components.md) | Detailed component library with anatomy, sizing, interactive states, accessibility, and Web (Tailwind v4) ↔ Flutter (Material 3) parity specs for every core UI element. |
| **04** | [04-screens-and-flows.md](./04-screens-and-flows.md) | Screen-by-screen redesign blueprints with ASCII wireframes, layout hierarchy, and responsive adaptation for Landing, Login, Student, Teacher, Institute, Guardian, AI Tutor, and Settings. |
| **05** | [05-animations-and-motion.md](./05-animations-and-motion.md) | **Comprehensive Motion Design Specification:** Motion personality, exact CSS `cubic-bezier` curves & Flutter `SpringDescription` physics, duration scale, 20+ choreographed interaction blueprints, gamification & study delight animations, teacher utility micro-interactions, low-end Android performance budget, and reduced-motion accessibility matrix. |

---

## 4. Suggested Implementation Roadmap (Future Phase)

When you are ready to apply this design to the codebase later, follow this low-risk sequence so Web and Flutter stay in lockstep:

1. **Phase 1 — Token & Motion Foundation:** Update `src/app/globals.css` and `flutter/lib/theme.dart` with the Paper & Prism surface tokens, 8 Subject Spine colors, restrained glass rules, and fixed entrance/tab motion curves.
2. **Phase 2 — Core Navigation & Primitives:** Unify Web (`Logo`, `BottomBar`, `SlidingSegmented`, `SlideIndicator`, desktop headers) and Flutter (`TopBar`, `Tabs`, `Box`, `CourseCard`, `Doing`, `Item`) with tactile press springs and synced sliding pills.
3. **Phase 3 — Role Dashboards:** Roll out the decluttered 3-zone **Student Home**, **Teacher Today's Desk** + grouped batch tools, **Guardian 3-Question Card**, and **Institute Executive Strip**.
4. **Phase 4 — Signature Flows & Delight:** Polish the **1-Tap Attendance Studio**, **Quiz Runner** (celebrations & calm timer), **Instanton AI Notebook**, **Bulk Import Mapper**, and **Unified Settings** live theme/glass previews.
