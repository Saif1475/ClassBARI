# ClassBARI — website & app (front-end)

Material 3 Expressive design, built with **Next.js 16 + TypeScript + Tailwind CSS v4**.
English by default, with a **বাংলা** switch on the login page, landing page and app screens.

## Run it locally

You need **Node.js 20 or newer** (check with `node -v`).

```bash
npm install
npm run dev
```

Open http://localhost:3000

For a production build: `npm run build` then `npm start`.

## Pages

| URL | Screen |
|---|---|
| `/` | Landing page with teacher enquiry form (saved via `/api/leads`) |
| `/login` | Role choice · phone + OTP (demo) · English / বাংলা |
| `/teacher` | Instructor dashboard, course studio, calendar, inbox |
| `/teacher/batch` | Same studio, opened on Students & attendance |
| `/student` | My courses (modules, quizzes, grades, live) ⇄ Explore videos |
| `/student/watch/[id]` | Video player (YouTube link or .mp4) |
| `/parent` · `/parent/results` · `/parent/payments` · `/parent/receipt/[id]` | Parent home, attendance & marks, payment history, printable receipt |
| `/teacher/report/[id]` | Monthly report card (teacher writes the comment, sends on WhatsApp) |
| `/parent/messages` · `/parent/report` | Message the teacher · child's report card (child switcher at the top) |
| `/signup` | Teacher sign-up: profile + first batch |
| `/join/[batchId]` | Student invite link (copied from a batch card) |
| `/courses` · `/courses/[batchId]` | Public course list and course page: syllabus, free previews, enrol + pay |
| `/teacher/invoice/[id]` · `/parent/invoice` | Monthly invoice (fee, discount, late fine, payments, balance) |
| `/admin` | Enquiries from the landing form + teachers (needs `ADMIN_TOKEN`) |
| `/privacy` · `/terms` | Draft legal pages — get them reviewed before launch |

The login is a demo: any valid mobile number + any 6 digits. The chosen role is kept in a cookie and
`src/proxy.ts` sends visitors without it back to `/login` (not real security — see Next steps).
App data lives in the browser (`localStorage`); "Reset demo data" on the teacher dashboard starts over.

## Settings (`.env.local`)

```
NEXT_PUBLIC_WHATSAPP_NUMBER=8801XXXXXXXXX   # shows the WhatsApp buttons on the landing page
NEXT_PUBLIC_CONTACT_EMAIL=hello@example.com # footer "Contact" link
NEXT_PUBLIC_SITE_URL=https://your-domain    # absolute URL for the social preview image
LEADS_WEBHOOK_URL=https://…                 # where enquiries are POSTed (e.g. a Google Apps Script)
ADMIN_TOKEN=long-random-secret              # password for /admin
SMS_API_KEY=…                               # bulk-SMS provider key; without it SMS are only logged (test mode)
SMS_SENDER_ID=…                             # sender ID / masking name from the provider
SMS_API_URL=…                               # optional, default https://bulksmsbd.net/api/smsapi
VAPID_PUBLIC_KEY=…                          # push notifications: make both with `npx web-push generate-vapid-keys`
VAPID_PRIVATE_KEY=…                         # keep secret; without the pair, push is simply hidden
```

Without `LEADS_WEBHOOK_URL`, enquiries are appended to `data/leads.jsonl` — fine on your own server,
but serverless hosts (Vercel) can't write files, so set the webhook there.

## SMS to guardians

Teachers get an **SMS** button next to WhatsApp for absent notices (Attendance) and fee reminders (Fees, and "Send SMS to all" in Remind).
Buy credit from a Bangladeshi bulk-SMS provider (about ৳0.25–0.36 per English SMS; a Bangla SMS of more than 70 letters
counts as several), then set `SMS_API_KEY` and `SMS_SENDER_ID`. `src/lib/sms-server.ts` uses BulkSMSBD's request format;
check it against your provider's API page before going live. Until a key is set, nothing is sent: the admin panel's **SMS**
tab shows every message in "test" mode. The admin panel also has a site-wide **daily limit** (default 200) and an on/off switch.
Until real logins exist (Supabase), the daily limit is what protects your SMS credit, so keep it low.

## Teacher tools (Tools in the teacher menu)

| Tool | What it does |
|---|---|
| Merit list | Ranks a test; when published, each student/guardian sees only their own position. Print / CSV. |
| OMR scanner | Prints A4 answer sheets (up to 100 MCQs, sets A–D, roll bubbles); reads phone photos in the browser (`src/lib/omr.ts`), flags double/faint marks, saves marks. |
| Question bank | Teacher's own questions + all questions from their tests; "make a test" picks at random by subject/topic/difficulty. |
| ID cards, admit cards, certificates | Print pages at `/teacher/print` (photo + attendance QR on ID cards). |
| Doubts | Students ask with a photo; teacher answers with text, photo or a voice note (max 60 s). |
| Video watch time | Seconds each student actually played per video. |
| Class routine | Weekly timetable; warns about teacher/room/batch clashes. Students and guardians see their batch's routine. |
| Expenses & profit | Monthly fees collected − staff pay − other costs, CSV export. |
| Admission enquiries | Enquiry → called → visited → admitted (opens the enrol form pre-filled). |
| Staff attendance & leave | Owner marks staff present/absent and approves leave. |
| Parent meetings | Teacher opens slots; guardians book from their home page. |
| My website | Public page `/t/<name>` with bio, public courses and an average-mark badge; the bKash number for course sales. |
| Course shop & coupons | Coupons; buyers pay by bKash "Send Money" to the teacher and type the TrxID; the teacher confirms and the student is enrolled. ClassBARI never holds money or asks for PINs. |

Also new: negative marking, sections (`## Physics`) and per-student shuffling in MCQ tests; **Import from Excel** (.xlsx/.csv) on the Students page; push notifications for new news/homework/tests/results.
Limits: all of this lives in the demo's browser storage (5 MB), so photos, voice notes and big imports fill it fast; the public teacher page and shop only work in the same browser until Supabase. Push needs the site on HTTPS (or localhost) and, on iPhone, the app added to the home screen. "Class starts in 10 minutes" reminders need a scheduled job and are not built yet.

## Protected videos

Uploaded and linked video files play with the student's name and Gmail as a moving watermark, with no download button,
picture-in-picture or right-click menu, and a fullscreen that keeps the watermark (iPhones have no fullscreen for it).
This stops casual copying and shows who leaked a recording; it cannot stop screen recording. YouTube links are not protected.
For real DRM, put the videos on a paid DRM video service and play them through its player.

## Handwriting to text (optional local service)

Students' "Handwriting to text" button (dashboard → My notes) sends a photo to `ocr-service/`,
a small Python service: OpenCV finds each line of writing, Microsoft's TrOCR model (small,
English handwriting) reads it. Runs on CPU; about 10–60 s per page.

First time (downloads ~1.3 GB: PyTorch CPU + libraries, then the ~250 MB model on first start):

```bash
cd ocr-service
python3 -m venv .venv
.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt
```

Then run it next to the website: `npm run ocr` (port 8000). The website reaches it through
`/api/handwriting`; set `OCR_SERVICE_URL` if it runs on another machine. If it's not running,
students see "the handwriting reader isn't running". Line-finder tests: `cd ocr-service && .venv/bin/python -m unittest test_lines`.
Use another model with `OCR_MODEL=microsoft/trocr-base-handwritten npm run ocr` (more accurate, ~1.3 GB, slower).
Bangla handwriting needs a Bangla-trained model (not available yet).

## Android app (Google Play)

ClassBARI is an installable web app (manifest + offline service worker), so it can be wrapped as a
Play Store app (a "Trusted Web Activity") without writing Android code:

1. Deploy the site on HTTPS with your real domain (Play needs a public URL).
2. Open https://www.pwabuilder.com, enter the URL, choose **Android → Generate**. It gives you an
   `.aab` file to upload, plus a signing key — keep that key safe, you need it for every update.
3. PWABuilder also gives an `assetlinks.json`; put it at `public/.well-known/assetlinks.json` and
   redeploy. This proves you own the site, so the app opens without a browser bar.
4. Create a Google Play developer account (one-time fee), make a listing, upload the `.aab`.

A separate branded app per teacher needs one domain/subdomain and manifest per teacher — later.

## Staff admin panel (`/admin`)

For the ClassBARI team only. Set `ADMIN_TOKEN` in `.env.local` (a long random string; never commit it), restart the site, open `/admin` and enter the token.

- **Overview:** institutes, monthly income (active institutes × plan price), trials ending within 7 days, open support requests.
- **Institutes:** everyone who signs up at `/signup`. Set plan, status (trial / active / suspended), trial end date, internal notes.
- **Enquiries:** the landing-page form, with follow-up status.
- **Support:** requests from the public `/support` page (linked from the landing footer and the login page).
- **Announcements:** a banner on every page (English + Bangla) and a maintenance notice.
- **Features:** switch off the live game, handwriting reader, public course pages or new sign-ups for everyone (the server refuses them too).
- **Plans:** monthly price per plan. **Activity:** every change made in the panel.

Data is saved in `data/platform.json` on the server (gitignored). Like `data/leads.jsonl`, this needs a normal server, not Vercel/serverless; it moves into Supabase later. "Suspended" is a label for now: blocking the institute's logins needs the Supabase accounts. Tests use `data/e2e-platform.json` instead.

## Database (Supabase) — in progress

`supabase/migrations/0001_institutes.sql` is the institute schema: institutes → branches → members
(owner / branch manager / teacher, with pay settings), then Class → Subject → Shift → Teacher(s):
the institute assigns teachers to shifts. Guardians; each student is in one class and takes several
subjects (one shift per subject); fees and payments per enrolment; attendance; staff payouts.
Only the institute (owner / branch manager) enrols students. Row-level security keeps each
institute's data apart; managers see only their branch, teachers only the shifts assigned to them
(and those shifts' classes, subjects and students), students only themselves, guardians only their children. Access is by the
signed-in Gmail (`my_access()`); sign-up calls `create_institute(...)`.

The rules are tested on real Postgres in Node (`npm test` → `scripts/rls.test.mjs`, uses PGlite).
To load it into a Supabase project: Dashboard → SQL Editor → paste the file → Run.
The app itself still uses browser storage until it is switched over (Phase 1).

## Demo limits

All app data lives in each browser's localStorage, so a teacher's phone and a parent's phone don't see
each other's changes, invite links only work in the browser that created the batch, and uploaded
assignment files must be small (800 KB). These all go away with the Supabase backend.
The app is installable (manifest + `public/sw.js`); pages you've opened keep working offline.

## Tests

`npm test` checks the MCQ quiz parser and marking (`src/lib/quiz.ts`).

## Where things live

```
src/
  app/                 one folder per page (Next.js App Router)
    globals.css        colours, fonts — the whole theme is here
  components/
    AppShell.tsx       bottom nav (phone) / nav rail (desktop)
    Brand.tsx          Logo + language switch
    Icon.tsx           icon set — add new icons to the map
  lib/
    i18n/en.ts         all English text
    i18n/bn.ts         all Bangla text (TypeScript errors if a key is missing)
    i18n/LanguageProvider.tsx   useLang() hook, saves choice in the browser
    mock-data.ts       sample data + types (dates are relative to today) — replace with real data
    lms-store.tsx      app state, actions, derived to-dos / calendar; saved in localStorage
    dates.ts, quiz.ts, site.ts, role.ts   small helpers
```

## Common changes

- **Change a colour:** edit `--color-*` in `src/app/globals.css`, then use it as `bg-primary`, `text-on-surface`, etc.
- **Add or edit text:** add the key in `en.ts` and `bn.ts`, then use `const { t } = useLang(); t.section.key`.
- **Add a page:** create `src/app/your-page/page.tsx`. Put `"use client";` at the top if it uses `useLang()` or state.
- **Add a nav item:** edit the `nav` list in `src/app/teacher/layout.tsx` or `src/app/parent/layout.tsx`.

## Next steps (need accounts / keys)

1. Supabase: phone-OTP auth (replace the role cookie), tables for batches, students, attendance, payments, modules.
2. Replace `mock-data.ts` + localStorage with Supabase queries; batches should own their modules (today modules are shared).
3. bKash / SSLCommerz merchant account — the parent "Pay with bKash" button is a clearly-labelled demo.
4. SMS gateway for automatic absence / fee messages (today: one-tap WhatsApp messages from the teacher's roster).
5. Video upload (Cloudflare R2) + protected player; today teachers paste YouTube / .mp4 links.
6. AI question builder (needs an LLM API key) — the landing page still advertises it.
