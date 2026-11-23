# 02 — Visual Design System ("Paper & Prism")

This document defines every foundational visual token for **Instanton Campus (ClassBARI)** across both **Next.js (Tailwind CSS v4 CSS variables)** and **Flutter (`ColorScheme` + `ThemeExtension<PaperTokens>`)**.

---

## 1. Visual Signature: Why It Looks Unique

Three deliberate visual choices make Instanton Campus stand apart from generic SaaS and LMS templates while staying effortlessly simple:

1. **Warm Paper vs. Cool Chrome:** Content sits on warm ivory paper (`#FAF8F4`) with crisp white study cards (`#FFFFFF`), giving the calm, low-glare feeling of opening a fresh notebook. Navigation chrome floats above in softly frosted translucent glass.
2. **The "Book-Spine" Subject Accent:** Every Course/Batch card, Chapter folder, and Homework item features a signature **4px rounded vertical accent bar** along its left edge (or a 6px folded bookmark top ribbon on grid cards) drawn from an 8-color **Ink & Chalk** palette.
3. **Disciplined Geometry (Zero Blob Chaos):** Instead of inconsistent asymmetrical radii (`40px/12px`), the entire platform follows a strict, friendly **3-tier corner scale** (`12px` controls, `18px` cards, `26px` sheets/modals, `9999px` pills).

---

## 2. Color System

### 2.1 Neutral Paper & Ink Surfaces (Shared Across Tones)

| Token | Light Mode (Warm Paper) | Dark Mode (Night Study Ink) | Usage |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#FAF8F4` | `#0D1114` | Main page / scaffold background |
| `--bg-paper` | `#FFFFFF` | `#151B20` | Primary elevated content cards, inputs, modals |
| `--bg-paper-soft` | `#F3F0E9` | `#1C242B` | Subtle wells, grouped list chips, inactive pills |
| `--bg-paper-hover` | `#ECE8DE` | `#232D36` | Hover / active press well tint |
| `--ink-primary` | `#161B18` | `#F2F4F2` | Headlines, primary body copy (Contrast `>14:1`) |
| `--ink-secondary` | `#535E58` | `#9CA8A1` | Subtitles, metadata, timestamps (Contrast `>5.8:1`) |
| `--ink-muted` | `#7A857F` | `#6E7B74` | Placeholders, disabled labels, subtle icons |
| `--border-hairline` | `#E6E1D6` | `#26313A` | Card borders, list dividers (whisper-thin `1px`) |
| `--border-strong` | `#CFC8BA` | `#3A4956` | Form inputs, outlined buttons |

> **Why `#FAF8F4` & `#0D1114`?** Pure `#FFFFFF` backgrounds cause eye fatigue during long exam sessions on bright budget LCD screens; pure `#000000` dark mode causes halation (text smearing) on OLED screens. Warm ivory and deep ink-slate feel calm, readable, and editorial.

---

### 2.2 Brand Color Tones (User-Selectable in Settings)

Preserves the existing dual-tone personalization (`classbari-tone`) with refined, richer academic hues:

#### Tone A: **Forest Chalk** (`green` — Default)
Calm, trustworthy, rooted in classic green classroom chalkboards and Bangladeshi heritage.

| Token | Light Mode | Dark Mode | On-Color Text | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--brand-primary` | `#146C43` | `#3EC786` | `#FFFFFF` / `#062B19` | Primary buttons, active indicators, key links |
| `--brand-primary-hover` | `#0F5635` | `#58D69B` | `#FFFFFF` / `#062B19` | Hover/pressed state |
| `--brand-soft` | `#E4F4EC` | `#123526` | `#0C472B` / `#A7EBC9` | Active nav pills, subtle success badges |
| `--brand-deep` | `#0B3B25` | `#0A261A` | `#F2FAF6` | Desktop side rail, dark hero banners |
| `--accent-warm` | `#E5953A` | `#F2B161` | `#2D1902` | Streaks, highlights, live CTA badges, featured tags |
| `--accent-warm-soft` | `#FEF2E2` | `#332412` | `#7A4608` / `#FAD19E` | Warm attention banners, pending due chips |

#### Tone B: **Sky Blossom** (`sky` — Optional Tone)
Fresh, cheerful, airy classroom vibe keeping the beloved sky-blue & soft-pink personality while upgrading contrast to strict WCAG AA.

| Token | Light Mode | Dark Mode | On-Color Text | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--brand-primary` | `#1769AA` | `#5BB2F5` | `#FFFFFF` / `#05233D` | Primary buttons, active indicators |
| `--brand-primary-hover` | `#115388` | `#7CC3F8` | `#FFFFFF` / `#05233D` | Hover/pressed state |
| `--brand-soft` | `#E4F1FC` | `#132B40` | `#0E436E` / `#B5DCFB` | Active nav pills, soft badges |
| `--brand-deep` | `#10395C` | `#0B2238` | `#F2F8FD` | Desktop side rail, dark hero banners |
| `--accent-warm` | `#D85B88` | `#F38FB2` | `#FFFFFF` / `#3D0B1F` | Streaks, live badges, celebratory pills |
| `--accent-warm-soft` | `#FCE8F0` | `#381826` | `#802246` / `#F8BBD0` | Blossom highlight chips, soft banners |

---

### 2.3 Semantic Status Colors

| Meaning | Light Fill / Ink | Dark Fill / Ink | Usage |
| :--- | :--- | :--- | :--- |
| **Success / Present / Paid** | Fill `#E6F5EC` · Ink `#11613C` | Fill `#113022` · Ink `#5BD99B` | Present pill, fee paid, quiz passed (`≥60%`), saved toast |
| **Warning / Due / Soon** | Fill `#FEF3E0` · Ink `#925309` | Fill `#332510` · Ink `#F5BA62` | Fee due soon, quiz under 5 min, offline queued |
| **Danger / Absent / Error** | Fill `#FDECEB` · Ink `#B42318` | Fill `#3A1718` · Ink `#F98078` | Absent pill, validation error, overdue fee, destructive actions |
| **Live Now** | Fill `#E11D48` · Ink `#FFFFFF` | Fill `#F43F5E` · Ink `#FFFFFF` | Live class beacon dot & badge (high visibility) |
| **bKash Brand** | Fill `#D12053` · Ink `#FFFFFF` | Fill `#D12053` · Ink `#FFFFFF` | Dedicated bKash payment button only |

---

### 2.4 Signature 8-Color "Ink & Chalk" Subject Spine Palette

Used deterministically for **Chapters (`moduleId % 8`)** and **Batches (`batchIndex % 8`)** across Web and Flutter:

| Index | Name | Light Spine / Ink | Light Soft Tint | Dark Spine / Ink | Suggested Subject Association |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `0` | **Chalk Emerald** | `#146C43` | `#E4F4EC` | `#4CD090` | Biology / General |
| `1` | **Physics Cobalt** | `#1D63B8` | `#E5F0FC` | `#66A8F5` | Physics / Higher Math |
| `2` | **Chemistry Amber** | `#C46D10` | `#FEF1E1` | `#F0A44B` | Chemistry / Practical |
| `3` | **Math Plum** | `#7A3EB1` | `#F3EAFD` | `#BE8DF0` | Mathematics / Statistics |
| `4` | **ICT Cyan** | `#0E7B8C` | `#E2F5F8` | `#4AC7D9` | ICT / Programming |
| `5` | **Literature Terracotta** | `#B84A39` | `#FCECE9` | `#EB8676` | Bangla / English |
| `6` | **Commerce Olive** | `#5B7A1E` | `#EEF5E1` | `#9EC454` | Accounting / Finance |
| `7` | **Exam Rose** | `#B8326A` | `#FDEAF2` | `#EE78AA` | Model Tests / Revision |

> **Accessibility Rule:** Every Light Spine color achieves `≥4.5:1` contrast against `#FFFFFF` so chapter titles can be tinted in their spine color safely. In Dark Mode, use the brighter Dark Spine value (`≥5.2:1` against `#151B20`).

---

## 3. Bilingual Typography System (English + বাংলা)

### 3.1 Font Families
- **Latin / Numerals:** `Plus Jakarta Sans` — warm geometric friendliness, clear open counters, crisp `tabular-nums` (`font-variant-numeric: tabular-nums`) for scores, fees (`৳ 1,200`), and exam timers.
- **Bangla:** `Hind Siliguri` — generous x-height and matra clarity that pairs seamlessly with Plus Jakarta Sans at matching optical weights.
- **Micro-Subsets (Preserved):** Keep the 1 KB `৳` (`taka`) and `বাংলা` (`bn-label`) local subsets on Web so English pages never wait for full Bangla font downloads.
- **Monospace (Institute Codes & Formulas):** `JetBrains Mono` / system monospace for 6-character institute codes (`EDU-429`) and OTP verification boxes.

### 3.2 Type Scale (Base `16px` Web / `15sp` Flutter, Scalable `90%–130%`)

Bangla script has ascenders (kar/phola) and descenders (u-kar/ri-kar) that clip if line-heights are too tight. Always apply generous line-heights (`+0.12` on Bangla body text):

| Role | Size | Weight | Line Height (EN / BN) | Tracking | Usage |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Display Hero** | `32px` (mobile `26px`) | `800` | `1.15` / `1.28` | `-0.025em` | Landing headline, big stat hero numbers |
| **Page Title (`H1`)** | `26px` (mobile `22px`) | `800` | `1.20` / `1.32` | `-0.02em` | Greeting (`Hi, Rafi`), page headers |
| **Section Heading (`H2`)** | `19px` (mobile `18px`) | `700` | `1.28` / `1.38` | `-0.01em` | Card titles, section labels |
| **Card Title (`H3`)** | `16px` | `700` | `1.35` / `1.45` | `0` | Chapter name, lesson item title, student row name |
| **Body Primary** | `15px` | `500` | `1.50` / `1.62` | `0` | Paragraphs, AI answers, notices, quiz questions |
| **Body Secondary** | `13.5px` | `500` | `1.45` / `1.55` | `0` | Metadata (`Sat, Mon · 4:30 PM`), helper hints |
| **Label / Pill** | `12.5px` | `700` | `1.20` / `1.30` | `+0.01em` | Status tags, tab bar labels, subject pills |
| **Kicker / Eyebrow** | `11.5px` | `800` | `1.20` / `1.30` | `+0.06em` | Uppercase EN kickers (never uppercase Bangla!) |

> **Bangla Typography Rule:** Never apply `text-transform: uppercase` or tight negative letter-spacing to Bangla strings (`:lang(bn)` sets `letter-spacing: 0 !important`).

---

## 4. Spacing, Layout Grids & Responsive Breakpoints

### 4.1 4px Spatial Scale
- **Micro (`4px`, `8px`):** Icon-to-label gaps, chip inner gaps, title-to-subtitle gap.
- **Component (`12px`, `16px`, `20px`):** Card padding (`16px` mobile / `20px` desktop), form field gaps (`14px`), list row horizontal padding (`16px`).
- **Section (`24px`, `32px`):** Breathing room between major dashboard zones.
- **Page Gutter:** `16px` on phones (`<640px`), `24px` on tablets (`640px–1023px`), `32px` on desktop (`≥1024px`).

### 4.2 Responsive Shell Breakpoints

| Breakpoint | Layout Shell | Content Max-Width | Grid Columns |
| :--- | :--- | :--- | :--- |
| **Phone (`< 768px` & Flutter)** | Sticky compact Top Bar (`56px`) + Floating Bottom Dock (`64px` + safe area) | `100%` (16px padding) | 1 col list / 2 col Chapter Spine Grid (auto-drops to 1 col if user text scale `> 120%`) |
| **Tablet (`768px–1023px`)** | Slim Left Icon Rail (`76px`) + Top Header (`64px`) | `900px` centered | 2 col cards |
| **Desktop (`≥ 1024px`)** | Left Icon Rail (`80px`) + Contextual Secondary Drawer (`232px` only inside Course Studio) + Clean Top Header (`68px`) | `1120px` centered for dashboards (`760px` for AI reading / Quiz focus) | 2–3 col cards, 12-col underlying grid (`20px` gutter) |

---

## 5. Elevation & Restrained Glassmorphism ("Frosted Chrome, Crisp Paper")

### 5.1 Restrained Glass Levels (Mapped to Existing Glass Slider `0–3`)

**Golden Rule:** Frosted blur applies **ONLY** to floating chrome: Top Header, Floating Mobile Bottom Dock, Desktop Side Rail, Sliding Segmented Well, Dropdown Popovers, and Modal Sheets. **Scrollable content cards (`Box`, `CourseCard`, `Group`, list items) are ALWAYS solid paper surfaces**—sharp, legible, and fast.

| Level | Label | Chrome Surface Fill (Light / Dark) | Backdrop Blur (Web / Flutter) | Border Highlight |
| :---: | :--- | :--- | :--- | :--- |
| **`0`** | **Paper (Off)** | `100%` `#FAF8F4` / `#151B20` | `none` / `sigma 0` | `1px solid var(--border-hairline)` |
| **`1`** | **Whisper** | `rgba(255,253,249, 0.90)` / `rgba(21,27,32, 0.88)` | `blur(10px)` / `sigma 10` | `1px solid rgba(255,255,255, 0.60)` |
| **`2`** | **Frosted (Default)** | `rgba(255,253,249, 0.78)` / `rgba(21,27,32, 0.76)` | `blur(18px) saturate(140%)` / `sigma 16` | `1px solid rgba(255,255,255, 0.75)` + soft inner sheen |
| **`3`** | **Crystal** | `rgba(255,253,249, 0.64)` / `rgba(21,27,32, 0.62)` | `blur(26px) saturate(165%)` / `sigma 24` | `1px solid rgba(255,255,255, 0.85)` + ambient canvas wash |

### 5.2 Paper Elevation Shadows (Warm Stone Tint, Never Harsh Black)

| Elevation | Web Box-Shadow (Light Mode) | Flutter `BoxShadow` | Usage |
| :--- | :--- | :--- | :--- |
| **Flat (`E0`)** | `none` + `1px solid #E6E1D6` | `border` only | Grouped wells, nested strips, low-priority tiles |
| **Paper Card (`E1`)** | `0 2px 8px rgba(28, 36, 30, 0.045), 0 1px 2px rgba(28, 36, 30, 0.03)` | `blurRadius: 10, offset: (0, 3), alpha: 0.05` | Standard dashboard cards, chapter cards |
| **Floating Chrome (`E2`)** | `0 10px 28px rgba(22, 32, 26, 0.10), 0 2px 6px rgba(22, 32, 26, 0.04)` | `blurRadius: 22, offset: (0, 8), alpha: 0.10` | Floating mobile dock, dropdowns, hovered interactive cards |
| **Sheet / Dialog (`E3`)** | `0 24px 56px rgba(16, 26, 20, 0.18)` | `blurRadius: 32, offset: (0, 12), alpha: 0.18` | Modals, bottom sheets, QR scanner, lesson viewer |

> **Dark Mode Shadow Rule:** Shadows barely read on `#0D1114`. In Dark Mode, replace shadow lift with subtle top-edge luminance (`inset 0 1px 0 rgba(255,255,255, 0.06)`) and step surface lightness cleanly (`#0D1114` → `#151B20` → `#1E2730`).

---

## 6. Shape System & The "Book-Spine" Signature

| Token | Radius | Where Used |
| :--- | :---: | :--- |
| `--radius-xs` | `8px` | Inline tags, code badges, compact checkboxes |
| `--radius-sm` | `12px` | Text inputs, dropdowns, icon tiles (`Glyph`), table rows |
| `--radius-md` | `16px` | Secondary buttons, nested inner cards, alert boxes |
| `--radius-lg` | `20px` | Primary content cards (`PaperCard`), `CourseCard`, hero focus banners |
| `--radius-xl` | `26px` | Bottom sheets, centered modal dialogs, floating dock container |
| `--radius-pill` | `9999px` | Primary CTAs, segmented controls, filter chips, status pills, avatars |

### Signature "Book-Spine" Anatomy
```
┌─────────────────────────────────────────┐
│ ┃  [Icon]  Chapter 04: Newtonian Mech   │  ← 4px vertical rounded spine
│ ┃          6 lessons · 1 quiz due       │    in Subject Color (inset 10px
│ ┃          ████████░░░░  68%            │    top & bottom, radius 99px)
└─────────────────────────────────────────┘
```
- **Why it works:** It replaces heavy full-bleed colored gradients (which can feel childish or visually loud) with a refined, unmistakable academic motif that works equally well in Light Mode, Dark Mode, Forest Chalk, and Sky Blossom!

---

## 7. Iconography & Brand Mark

- **Brand Mark (`Mark`):** Preserve the distinctive **Instanton power-ring with jumping particle** (`Brand.tsx`). Always sit it inside a `rounded-[14px]` badge filled with `--brand-primary` (`40×40px` in nav, `52×52px` on Login/Splash).
- **UI Iconography:** Uniform `1.85px` stroke weight with rounded caps & joins (Lucide-aligned custom icon set already shared between Web `Icon.tsx` and Flutter `icons.g.dart`).
- **Two-Tone Active State:** Inactive icons use `stroke` in `--ink-secondary`; active navigation icons use a soft `14%` brand-tinted fill inside the glyph or inside a softly gliding active pill container.
- **Avoid Emoji Overload:** Replace raw system emojis (`📅`, `💳`, `📝`, `📞`, `⚙`) in Guardian and Teacher cards with crisp colored `Glyph` icon tiles (`36×36px`, `radius 11px`, soft subject tint background + solid icon stroke). Keep expressive vector/emoji accents *only* for playful student gamification (Streak flame, Live reactions).
