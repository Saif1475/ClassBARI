# 05 — Animation & Motion Design Specification ("Paper & Spring")

This document defines the complete motion language for **Instanton Campus (ClassBARI)** across **Next.js (CSS / Web Animations / View Transitions)** and **Flutter (`Curves` / `SpringSimulation` / `ImplicitlyAnimatedWidget`)**.

---

## 1. Motion Philosophy: Why Motion Matters Here

Motion in a learning platform has a very different job from motion in a gaming or marketing site:
- **During Exams & Reading:** Motion must disappear completely so students can concentrate without distraction or anxiety.
- **During Navigation & Everyday Use:** Motion should feel like **crisp stationery gliding smoothly across a desk**—spatial, predictable, tactile, and lightweight so users always understand *where they came from* and *that their tap registered*.
- **During Milestones & Motivation:** Tiny, warm, earned micro-celebrations (finishing a lesson, keeping a streak, getting a quiz right, marking attendance complete) make studying feel encouraging and human without feeling childish.

### Four Non-Negotiable Motion Laws
1. **Directional Honesty:** Vertical stacks enter vertically (`translateY`, *never* sideways `translateX`); tabs glide horizontally; drill-in pages push forward along the reading axis; sheets rise from the bottom edge.
2. **Exits Are Always Faster Than Entrances:** Entering elements take `240–340ms` with gentle deceleration; leaving elements clear out in `150–210ms` so the UI always feels snappy, never sluggish.
3. **GPU-Only Animation Budget:** Animate **ONLY** `transform`, `opacity`, and `clip-path` (Web) / `Transform`, `Opacity`, `SlideTransition`, `ScaleTransition` (Flutter). Never animate `width`, `height`, `top`, `left`, `margin`, or `backdrop-filter` blur radius per frame.
4. **Zero-Motion Safety:** Every non-essential motion collapses gracefully to instant cross-fade or zero movement under `prefers-reduced-motion: reduce` (Web) and `MediaQuery.disableAnimationsOf(context)` (Flutter).

---

## 2. Fixing Current Motion Issues (Audit Remediation)

Before adding new polish, four specific animation issues found in the current codebase should be replaced:

| Current Implementation | Problem | Paper & Spring Replacement |
| :--- | :--- | :--- |
| `globals.css`: `main > *` uses `ios-rise` with `translateX(24px)` + 40ms stagger | Vertically stacked dashboard cards fly in sideways from the right—visually disorienting on long pages | Gentle vertical settle `translateY(10px) → 0` + `opacity: 0 → 1` (`240ms`, `28ms` stagger, **strictly capped at first 4 children**) |
| `globals.css`: `.slide-pill` enforces `border-radius: 12px !important` | Rectangular pill clips awkwardly inside `rounded-full` nav bars and segmented pills | Sync pill `borderRadius` dynamically to `getComputedStyle(activeEl).borderRadius` |
| `ui.dart`: `Tabs` uses raw `IndexedStack` | Hard instant cut between bottom tabs feels rigid compared to Web | `TabFadeLift`: `180ms` opacity fade (`0.4 → 1`) + tiny `6px` upward settle while keeping scroll state preserved |
| `ui.dart`: `push()` uses default `MaterialPageRoute` | Generic OS slide/zoom doesn't share Web's refined feel | Custom `PaperPageRoute`: `280ms` subtle horizontal push (`24%` width, not full 100%) + cross-fade + incoming subtle shadow |

---

## 3. Core Physics: Curves, Springs & Duration Scale

### 3.1 Named Motion Curves (Exact Web ↔ Flutter Parity)

| Token Name | Web CSS `cubic-bezier` | Flutter Equivalent | Character & Usage |
| :--- | :--- | :--- | :--- |
| **`--ease-paper`** *(Standard Glide)* | `cubic-bezier(0.22, 1, 0.36, 1)` | `const Cubic(0.22, 1.0, 0.36, 1.0)` | Smooth, swift start with long calm settle. Used for sliding pills, page pushes, bottom sheets, accordions, drawers. |
| **`--ease-tactile`** *(Micro-Spring)* | `cubic-bezier(0.34, 1.45, 0.64, 1)` | `SpringDescription(mass: 1, stiffness: 420, damping: 28)` | Crisp, restrained bounce (max ~4% overshoot). Used for button release, checkmarks, attendance toggles, streak badges, quiz select. |
| **`--ease-exit`** *(Quick Clear)* | `cubic-bezier(0.4, 0, 1, 1)` | `Curves.easeInCubic` | Clean, brisk acceleration out of view. Used for dismissing dialogs, sheets, popovers, toasts. |
| **`--ease-calm`** *(Breathing)* | `cubic-bezier(0.37, 0, 0.63, 1)` | `Curves.easeInOutSine` | Slow, zero-jolt oscillation. Used for live class beacons, skeleton shimmer, AI thinking dots. |

### 3.2 Duration Tokens

| Tier | Duration | When to Use |
| :--- | :---: | :--- |
| **`--dur-instant`** | `90ms` | Pointer-down tactile press scale, focus ring glow, hover border tint |
| **`--dur-fast`** | `160ms` | Checkbox/switch toggle, icon rotation, popover exit, toast dismiss |
| **`--dur-standard`** | `240ms` | Card entrance settle, tab cross-fade, accordion expand, attendance pill morph, modal open |
| **`--dur-glide`** | `320ms` | Floating sliding pill travel across tabs, page drill-in, bottom sheet rise, drawer slide |
| **`--dur-celebrate`** | `520ms` | Lesson completion ring draw, quiz correct celebration burst, fee receipt stamp |
| **`--dur-ambient`** | `1800–2400ms` | Live beacon pulse, warm skeleton shimmer sweep, AI thinking wave (looping, paused off-screen) |

---

## 4. Complete Choreographed Interaction Catalog

### 4.1 Brand Mark Wake-Up (Splash Screen & Landing Hero Load)
Uses the existing **Instanton Power-Ring + Particle (`Mark`)** SVG icon:
- **Sequence (`680ms` total, plays once on app cold start / landing mount):**
  1. `0ms → 360ms`: Outer power-ring arc draws smoothly via `stroke-dashoffset` (`--ease-paper`).
  2. `180ms → 420ms`: Center vertical stem rises `6px` from bottom and fades in (`--ease-paper`).
  3. `340ms → 640ms`: Top particle dot pops up (`translateY(6px) scale(0.4) → translateY(0) scale(1)`) using `--ease-tactile` spring bounce!
- **Flutter:** Custom `CustomPainter` with single `AnimationController(duration: 680ms)` using three `Interval` curves (`0.0–0.53`, `0.26–0.62`, `0.50–1.0`).

---

### 4.2 Floating Sliding Pill (Bottom Dock, Segmented Controls, Side Rail)
The signature tactile connector across Web (`SlidingSegmented` & `[data-slide]`) and Flutter (`SlidingDock` & `SlidingChips`):
- **Behavior:** When switching from Option A to Option B, a single translucent/tonal pill glides continuously across the track rather than flashing off/on.
- **Subtle Stretch-and-Settle Feel:**
  - `transform: translate3d(x, y, 0)` + `width` transition over `320ms` with `--ease-paper`.
  - Target `border-radius` matches the active button's own radius (fixing the old `12px` pill bug).
  - Active icon performs a gentle `scale(1 → 1.12 → 1)` pop (`220ms`, `--ease-tactile`) at arrival.
- **Flutter Implementation:** Use `Stack` + `AnimatedPositioned` (or `AnimatedAlign` + `TweenAnimationBuilder` for exact pill width) with `duration: Duration(milliseconds: 300)` and `curve: const Cubic(0.22, 1.0, 0.36, 1.0)`.

---

### 4.3 Tactile Press & Desktop Hover ("Paper Touch")
Every clickable card (`SpineCard`, `CourseCard`), primary button (`Doing`), and quick-tool tile responds physically to touch:

- **Touch / Pointer Down (`90ms`, linear-out):**
  - Buttons & Chips: `scale(0.97)`
  - Cards (`SpineCard`, `PaperRow` tap): `scale(0.985)` + subtle background tint (`--bg-paper-hover`)
- **Pointer Up / Release (`220ms`, `--ease-tactile`):**
  - Springs smoothly back to `scale(1.0)` with whisper-light organic bounce.
- **Desktop Hover Only (`@media (hover: hover)`):**
  - `SpineCard`: lifts `translateY(-2px)` (`180ms`, `--ease-paper`), shadow deepens `E1 → E2`, and the `4px` left Subject Spine thickens optically via soft glow (`box-shadow: 0 0 0 3px <subjectSoft>`).
- **Flutter Widget (`TactileTap`):** Reusable lightweight `StatefulWidget` wrapping `Listener` (`onPointerDown` / `onPointerUp` / `onPointerCancel`) driving an `AnimatedScale` (`scale: down ? 0.975 : 1.0`, `duration: down ? 90ms : 220ms`, `curve: down ? Curves.easeOut : Curves.easeOutBack`) plus subtle `HapticFeedback.selectionClick()` on primary actions!

---

### 4.4 Page & Tab Navigation Choreography

#### A. Top-Level Tab Switch (Bottom Dock / Left Rail)
- **Motion:** No horizontal slide (since tabs sit at peer hierarchy). Instead, incoming tab fades `opacity: 0.35 → 1` and rises gently `translateY(6px) → 0` over `180ms` (`--ease-paper`).
- **Scroll Preservation:** Both Web and Flutter preserve scroll position per tab; the subtle `6px` lift reassures the eye that content updated without resetting scroll.

#### B. Drill-In Navigation (Home → Chapter → Lesson, Batch → Student Profile)
- **Forward Push (`280ms`, `--ease-paper`):**
  - Incoming page slides in from right `translateX(20%) → 0` + `opacity: 0 → 1` (shorter 20% distance feels modern and calm, never sweeping wildly across a huge desktop screen).
  - Outgoing page shifts slightly left `0 → translateX(-6%)` + dims `opacity: 1 → 0.92` for realistic layered paper depth.
- **Back Pop (`220ms`, `--ease-paper`):** Exact reverse; supports native iOS/Android swipe-back edge gesture in Flutter (`CupertinoPageTransitionsBuilder` physics tuned with fade).

#### C. Staggered Section & Card Reveal (Initial View Load Only)
```css
@keyframes paper-settle {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
/* Applied ONLY to first 4 primary cards on mount, never on scroll re-renders */
.paper-reveal { animation: paper-settle 240ms var(--ease-paper) both; }
.paper-reveal:nth-child(2) { animation-delay: 28ms; }
.paper-reveal:nth-child(3) { animation-delay: 56ms; }
.paper-reveal:nth-child(4) { animation-delay: 84ms; }
```
- **Cap Rule:** Children `#5+` receive `animation-delay: 84ms` (no cascading waits on long lists!).

---

### 4.5 Overlays: Bottom Sheets, Modals, Popovers & Accordions

| Overlay | Enter Animation | Exit Animation | Interactive Gesture |
| :--- | :--- | :--- | :--- |
| **Bottom Sheet (Mobile)** | Backdrop fades `0→1` (`200ms`); Sheet rises `translateY(100%)→0` (`320ms`, `--ease-paper`) | Sheet drops `translateY(100%)` (`200ms`, `--ease-exit`); Backdrop fades `160ms` | Interactive vertical drag on handle/header with `0.35×` upward rubber-band resistance; flick down `>300px/s` dismisses |
| **Centered Modal (Desktop)** | Backdrop fades (`180ms`); Card scales `0.95 → 1` + `translateY(8px) → 0` (`240ms`, `--ease-paper`) | Scales `1 → 0.97` + fade out (`150ms`, `--ease-exit`) | Escape key or backdrop click |
| **Dropdown / `More` Popover** | Anchored at trigger corner (`transform-origin: top right` or `bottom right`); scales `0.93 → 1` + `translateY(±6px) → 0` (`200ms`, `--ease-paper`) | Scales `1 → 0.95` + fade (`140ms`, `--ease-exit`) | Tap outside dismiss |
| **Chapter Accordion / `<details>`** | CSS `grid-template-rows: 0fr → 1fr` (`260ms`, `--ease-paper`) + chevron rotates `0deg → 180deg` (`220ms`) | `1fr → 0fr` (`200ms`, `--ease-paper`) + chevron returns | Flutter: `AnimatedSize(240ms)` + `AnimatedRotation` |

---

### 4.6 Student Delight & Learning Animations (Motivating, Never Distracting)

#### 1. Lesson Complete Check-Pop
When a student taps **Mark as Complete**:
- Button circle draws an SVG checkmark stroke (`240ms`, `--ease-paper`) with a `scale(0.85 → 1.08 → 1)` tactile pop (`320ms`, `--ease-tactile`).
- Chapter `MarkBar` smoothly glides to the new percentage (`420ms`, `--ease-paper`) with a brief subtle sheen pulse across the bar tip.
- Flutter triggers `HapticFeedback.mediumImpact()`.

#### 2. Quiz Option Pick & Answer Feedback
- **During Timed Exam (Distraction-Free):**
  - Selecting an option smoothly fills the letter circle (`A/B/C/D`) (`160ms`) and scales the badge `0.92 → 1.06 → 1` (`200ms`, `--ease-tactile`). No fireworks or noise while answering!
  - Advancing questions uses a crisp `180ms` horizontal shared-axis cross-fade (`translateX(14px) → 0`) so focus stays glued to the question stem.
- **Exam Timer Calm Progression:**
  - `> 5 min left`: 100% static neutral stone pill (zero animation).
  - `1–5 min left`: Smooth color transition (`300ms`) to warm amber soft fill (still static—no stressful blinking!).
  - `< 60 sec left`: Gentle slow opacity pulse (`1 → 0.72 → 1`, `1600ms`, `--ease-calm`) on the clock icon only.
- **Practice Mode / Quiz Submit Result:**
  - **Correct Answer:** Emerald border glow expands (`200ms`) + checkmark draws (`240ms`) + for score `≥80%` on submit, a **12-particle lightweight micro-confetti burst** (4 Subject Spine colors, `700ms`, fades out cleanly, zero canvas bloat).
  - **Wrong Answer (Kind, Never Punishing):** Gentle 2-beat horizontal nudge (`0 → -5px → +5px → -3px → 0` over `260ms`, `--ease-paper`) + calm rose-tinted explanation slide-down so the student learns without feeling shamed.

#### 3. Daily Streak Flame & XP Roll-Up
- **Streak Badge:** On Home mount (when streak `≥ 1`), the flame glyph plays a single warm welcoming sway (`rotate(-6deg → +6deg → 0)` + `scale(1 → 1.12 → 1)`, `480ms`), then rests calmly—never looping endlessly in the student's peripheral vision!
- **XP Counter Tick-Up:** When XP increases, the `tabular-nums` number rolls up smoothly over `450ms` (`--ease-paper`) while a tiny `+15 XP` green chip floats `16px` upward and fades out (`650ms`).

#### 4. Live Classroom Beacon & Floating Reactions
- **Live Beacon (`● LIVE`):** Two concentric circles—solid `8px` rose core + soft outer ring expanding `scale(1 → 2.2)` and fading `opacity: 0.55 → 0` over `1800ms` (`--ease-calm`). Pauses automatically when tab is hidden (`visibilitychange`).
- **Live Poll Bar:** Option bars grow smoothly (`scaleX` from left origin, `420ms`, `--ease-paper`) as votes arrive; percentages count smoothly with `tabular-nums`.
- **Live Reactions (`👏`, `🔥`, `💡`, `❤️`):** Upgraded `reaction-float` drifts `110px` upward over `1500ms` with a subtle sinusoidal horizontal sway (`±10px`), scaling `0.7 → 1.1 → 0.9` and fading out cleanly at the top.

#### 5. Instanton AI Thinking, Streaming & PDF Highlighting
- **Connecting / Thinking State:** Three warm brand-tinted dots ripple gently in vertical wave (`translateY(0 → -4px → 0)`, `1200ms`, `160ms` phase offset) beside a quiet label (`Thinking…` / `Highlighting PDF…`).
- **Token Streaming:** New text chunks appear smoothly with zero scroll-jump jitter (debounced smooth auto-scroll only if the user is already near the bottom—never hijacks scroll if the student scrolled up to re-read!).
- **PDF Highlight Ready:** A soft golden-emerald diagonal highlighter sweep (`480ms`) glides once across the newly created `Highlighted PDF` card spine on arrival.

---

### 4.7 Teacher & Institute Utility Animations (Fast, Reassuring, Zero Friction)

#### 1. 1-Tap Attendance Pill Flip
- Tapping any student row instantaneously morphs the right pill (`180ms`, `--ease-tactile`):
  - Background cross-fades Emerald ↔ Coral.
  - Leading icon (`✓` ↔ `✕`) rotates `45deg` while cross-scaling (`scale(0.6 → 1)`).
  - Sticky bottom summary bar (`Present: 26 · Absent: 2`) bumps the changed digit vertically (`translateY(6px) → 0`, `160ms`) so the teacher feels instant confirmation without looking away from the roster.
  - Flutter: `HapticFeedback.lightImpact()` on Present, double tiny tick (`selectionClick`) on Absent.

#### 2. QR Attendance Scanner Lock-On
- Camera viewfinder corners gently breathe (`scale(1 → 1.03)`, `2000ms`, `--ease-calm`) while scanning.
- On student QR match: Corner brackets snap tight (`140ms`, `--ease-tactile`) in bright Emerald, a subtle translucent green flash (`opacity: 0.22 → 0`, `280ms`) pulses inside the frame, and a student toast card (`✓ Rafi Ahmed marked Present`) slides up from the bottom (`220ms`).

#### 3. Bulk Import Row Verification
- After file parse completes, summary banner (`2 ready · 1 needs fixing`) settles in smoothly (`220ms`), and fix-needed rows show a subtle `4px` coral spine highlight so errors jump off the page effortlessly.

#### 4. Fee Recorded Receipt Stamp
- When an Institute Owner confirms a payment, the success banner stamps in a crisp `PAID ✓` badge (`scale(1.22 → 1)` + `rotate(-6deg → -2deg)`, `280ms`, `--ease-tactile`) before offering `Print / Share Receipt`.

#### 5. Toasts & Undo Snackbars
- **Enter:** Slides `18px` upward from above the bottom dock + `opacity: 0 → 1` (`240ms`, `--ease-paper`).
- **Auto-Dismiss Progress:** Subtle `2px` hairline progress strip along the bottom edge shrinks via `scaleX(1 → 0)` over `3500ms` (pauses on hover/touch!).
- **Exit:** Drops `10px` + fades out (`160ms`, `--ease-exit`), or follows horizontal swipe-to-dismiss.

---

### 4.8 System & Personalization Animations

#### 1. Light / Dark Mode Switch
- **Web (Supported Browsers):** Uses the existing `document.startViewTransition` API for a seamless `280ms` whole-page luminance cross-fade (no harsh white flash!), while the Sun/Moon icon rotates `180deg` and cross-scales (`260ms`, `--ease-tactile`).
- **Flutter:** `AnimatedTheme(duration: Duration(milliseconds: 260), curve: Curves.easeOutCubic)` smoothly interpolates Paper canvas, ink, borders, and subject colors.

#### 2. Glass Intensity Slider (`0 → 3`) & Text Size Slider (`90% → 130%`)
- As the user drags the slider in Settings, the **Live Appearance Preview Card** updates immediately with `160ms` background-alpha transitions (never animating blur radius on every drag frame on budget phones—snaps blur cleanly on step change `0 / 1 / 2 / 3`).

#### 3. Warm Paper Skeleton Shimmer
```css
@keyframes paper-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.skeleton-block {
  position: relative;
  overflow: hidden;
  background: var(--bg-paper-soft);
}
.skeleton-block::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
  animation: paper-shimmer 1600ms var(--ease-calm) infinite;
}
```
> Using a pseudo-element `transform: translateX()` instead of animating `background-position` keeps skeleton loading 100% GPU-composited and zero-paint on cheap Android GPUs!

---

## 5. Low-End Android Performance Budget (Bangladesh Device Reality)

Many students and guardians access Instanton Campus on **3 GB–4 GB RAM Android phones** (60Hz displays, MediaTek Helio / Unisoc chipsets). Every animation must obey these guardrails:

1. **Zero Blur on Scrollable Lists:** Never place `backdrop-filter` (Web) or `BackdropFilter` (Flutter) on list rows, `SpineCard`, or scrollable children. Reserve blur strictly for static floating chrome (Header, Floating Bottom Dock, Modal Sheet), and disable blur during active touch-scroll if FPS dips below 50.
2. **Strict Compositor Whitelist:** Only animate `transform` (`translate3d`, `scale`, `rotate`) and `opacity`. Never animate `box-shadow` directly on every frame (instead fade the `opacity` of a pre-rendered shadow pseudo-element or swap elevation cleanly on desktop hover only).
3. **Particle & Loop Cap:** Confetti bursts are strictly capped at `12` elements and destroyed immediately after `750ms`. Never run more than **1 ambient looping animation** (e.g., Live dot or Skeleton shimmer) simultaneously on screen.
4. **Pause Off-Screen & Backgrounded Loops:** Stop ambient CSS/Flutter controllers when `document.hidden === true` or `AppLifecycleState.paused`.
5. **No `will-change` Spam:** Apply `will-change: transform` only to actively sliding indicators (`.slide-pill`, bottom sheets during drag)—never globally across all cards (which wastes GPU texture memory on low-RAM phones).

---

## 6. Accessibility & Reduced Motion Matrix

Respects CSS `@media (prefers-reduced-motion: reduce)` and Flutter `MediaQuery.disableAnimationsOf(context)` automatically:

| Interaction | Standard Motion | Reduced Motion Fallback |
| :--- | :--- | :--- |
| **Page Push / Pop** | `280ms` subtle slide (`20%`) + fade | `120ms` pure opacity cross-fade (`0px` movement) |
| **Tab Switch & Sliding Pill** | `300ms` gliding pill + `6px` lift | Instant pill snap + `100ms` opacity fade |
| **Card Entrance Stagger** | `240ms` vertical `10px` settle + `28ms` stagger | Immediate render (`animation: none`) |
| **Bottom Sheets & Modals** | `320ms` rise / `240ms` scale-fade | `140ms` opacity fade in place |
| **Button Tactile Press** | `scale(0.97)` spring bounce | Instant subtle tonal darken (no scale) |
| **Quiz Correct / Wrong** | Micro-confetti / gentle `±5px` nudge | Crisp static color + icon badge swap (no shake/particles) |
| **Attendance Pill Flip** | Spring morph + icon spin | Instant crisp color + `✓`/`✕` swap |
| **Live Beacon & Skeleton** | Slow pulsing ring / diagonal sheen | Static high-contrast `● LIVE` pill / solid subtle tinted skeleton |
| **Theme Switch** | `280ms` ViewTransition cross-fade + icon spin | Instant color swap |

---

## 7. Quick Implementation Reference (Copy-Ready Tokens)

### Web CSS Custom Properties (`globals.css` Reference)
```css
:root {
  --ease-paper:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-tactile:  cubic-bezier(0.34, 1.45, 0.64, 1);
  --ease-exit:     cubic-bezier(0.4, 0, 1, 1);
  --ease-calm:     cubic-bezier(0.37, 0, 0.63, 1);

  --dur-instant:   90ms;
  --dur-fast:      160ms;
  --dur-standard:  240ms;
  --dur-glide:     320ms;
  --dur-celebrate: 520ms;
}
```

### Flutter Dart Constants (`motion.dart` Reference)
```dart
abstract final class PaperMotion {
  static const Curve paper   = Cubic(0.22, 1.0, 0.36, 1.0);
  static const Curve tactile = Cubic(0.34, 1.45, 0.64, 1.0);
  static const Curve exit    = Curves.easeInCubic;
  static const Curve calm    = Curves.easeInOutSine;

  static const SpringDescription spring = SpringDescription(mass: 1, stiffness: 420, damping: 28);

  static const Duration instant   = Duration(milliseconds: 90);
  static const Duration fast      = Duration(milliseconds: 160);
  static const Duration standard  = Duration(milliseconds: 240);
  static const Duration glide     = Duration(milliseconds: 320);
  static const Duration celebrate = Duration(milliseconds: 520);
}
```
