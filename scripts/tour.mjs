// Visits every page and feature of the demo site, calling `snap(page, group, title, caption)` on each screen.
// Shared by scripts/screenshots.mjs (pictures for the feature tour) and scripts/ui-audit.mjs (layout checks).
import english from "../src/lib/i18n/en.ts";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const settle = (page, ms = 900) => page.waitForLoadState("networkidle").catch(() => {}).then(() => page.waitForTimeout(ms));

/** `t`: the dictionary of the language the site is showing (button names are looked up in it). */
export async function tour({ page, ctx, BASE, snap, adminToken = "shots-token", t: en = english }) {
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      console.log(`✗ skipped ${label}: ${String(e.message).split("\n")[0]}`);
    }
  };
  const asRole = (c, role) => c.addCookies([{ name: "edunest-role", value: role, url: BASE }]);
  const go = async (url) => {
    await page.goto(BASE + url);
    await settle(page);
  };

  // ---------- Public website ----------
  const PUB = "1 · Public website";
  await step("landing", async () => (await go("/"), await snap(page, PUB, "Landing page", "What Instanton Campus is: one app for classes, fees, exams and parent updates, built for Bangladeshi coaching centres.")));
  await step("landing-pricing", async () => {
    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(700);
    await snap(page, PUB, "Landing page — more", "Features, pricing in taka and the free plan for small batches.");
  });
  await step("courses", async () => (await go("/courses"), await snap(page, PUB, "Course catalogue", "Public list of courses that teachers choose to show online.")));
  await step("course", async () => (await go("/courses/hsc-physics-a"), await snap(page, PUB, "Course page", "Course details, free preview lessons and online enrolment.")));
  await step("join", async () => (await go("/join/hsc-physics-a"), await snap(page, PUB, "Invite link", "A teacher shares one link; a student fills in their details and joins the batch.")));
  await step("login", async () => (await go("/login"), await snap(page, PUB, "Login", "Students and guardians sign in with Google; teachers and owners with their account.")));
  await step("signup", async () => (await go("/signup"), await snap(page, PUB, "Teacher sign-up", "A teacher signs up and creates the first batch in under a minute.")));
  await step("support", async () => (await go("/support"), await snap(page, PUB, "Help & support", "Contact form, WhatsApp and answers to common questions.")));

  // ---------- Institute owner (sees everything) ----------
  const OWN = "2 · Institute owner";
  await asRole(ctx, "institute");
  await go("/institute");
  // Publish the demo teacher's website so its public page can be shown later.
  await page.evaluate(() => {
    const k = "edunest-lms-state-v8";
    const s = JSON.parse(localStorage.getItem(k) || "{}");
    s.site = { ...(s.site || {}), slug: "tanvir-sir", published: true, bio: "HSC Physics and SSC Higher Math with live classes, weekly tests and monthly report cards for parents." };
    localStorage.setItem(k, JSON.stringify(s));
  });
  await go("/institute");
  const nav = async (name) => {
    await page.getByRole("button", { name, exact: true }).first().click();
    await settle(page, 700);
  };
  await step("dashboard", async () => (await nav(en.student.dashboard), await snap(page, OWN, "Owner dashboard", "Today's classes, fees collected and due, attendance, work to mark — the whole institute at a glance.")));
  await step("students", async () => (await nav(en.roster.nav), await snap(page, OWN, "All students", "Student directory with search, batches, Gmail logins for students and guardians, and Excel import.")));
  await step("calendar", async () => (await nav(en.student.calendar), await snap(page, OWN, "Calendar", "Classes, tests and homework due dates in one calendar.")));
  await step("inbox", async () => (await page.getByRole("button", { name: new RegExp(`${esc(en.student.inbox)}$`) }).first().click(), await settle(page, 700), await snap(page, OWN, "Inbox", "Messages with guardians and students.")));

  const SEC = "3 · Course studio (per batch)";
  const SECTION_TEXT = {
    home: "The batch's home: next class, latest work and quick actions.",
    modules: "Chapters with videos, PDFs, quizzes, homework and written exams.",
    assignments: "Homework handed in by students, with photos, rubrics and marking.",
    quizzes: "MCQ quizzes and written exams with negative marking, sections and shuffled questions.",
    people: "Attendance register, QR attendance and the student list.",
    fees: "Monthly fees, dues, discounts, late fines, bKash/cash payments and receipts.",
    grades: "Marks for every test, grades and report cards.",
    dojo: "Behaviour points and the class story for parents.",
    announcements: "Notices to the batch (also sent as push notifications and SMS).",
    files: "Notes and PDFs for the batch.",
    live: "Live classes, recorded lectures and the video library.",
  };
  await step("studio", async () => {
    await nav(en.teacher.courseStudio);
    for (const [id, label] of Object.entries(en.teacher.sections)) {
      await step(`section ${id}`, async () => {
        await page.getByRole("button", { name: new RegExp(`^${esc(label)}(\\s*\\d+)?$`) }).first().click();
        await settle(page, 700);
        await snap(page, SEC, label, SECTION_TEXT[id] ?? "");
      });
    }
  });

  const TOOLS = "4 · Teacher tools";
  await step("tools", async () => {
    await nav(en.tools.nav);
    await snap(page, TOOLS, "All tools", en.tools.sub);
    for (const [, [name, desc]] of Object.entries(en.tools.names)) {
      await step(`tool ${name}`, async () => {
        await page.getByRole("button", { name: new RegExp(`^${esc(name)}`) }).first().click();
        await settle(page, 1000);
        await snap(page, TOOLS, name, desc);
        await page.getByRole("button", { name: en.tools.all }).first().click(); // back to the list of tools
        await settle(page, 500);
      });
    }
  });
  await step("report card", async () => (await go("/teacher/report/1"), await snap(page, TOOLS, "Report card", "Printable report card for one student, with marks, attendance and the teacher's comment.")));
  await step("settings owner", async () => (await go("/settings"), await snap(page, OWN, "Settings", "Profile, institute name, bKash number, plan usage, appearance, language and backup.")));

  // ---------- Student ----------
  const STU = "5 · Student";
  await asRole(ctx, "student");
  await go("/student");
  const studentNav = async (name) => {
    await page.getByRole("button", { name, exact: true }).first().click();
    await settle(page, 700);
  };
  await step("student home", async () => (await studentNav(en.kid.navHome), await snap(page, STU, "Student home", "What to do next, streak and XP, today's class and fees — in Bangla or English.")));
  const STUDENT_TEXT = ["Class overview and progress.", "Notices from the teacher.", "Chapters: videos, PDFs and quizzes.", "Homework: hand in a photo, see marks and comments.", "Tests: timed MCQ with instant marks and rank.", "All marks, topic mastery and progress.", "Notes and PDFs; AI study help (coming soon).", "Join the live class.", "Practise mistakes and earn XP.", "Ask the teacher a doubt with a photo."];
  await step("student class", async () => {
    await studentNav(en.kid.navClass);
    for (const [i, label] of en.student.courseNav.entries()) {
      await step(`student ${label}`, async () => {
        await page.getByRole("button", { name: label, exact: true }).first().click();
        await settle(page, 700);
        await snap(page, STU, `My class — ${label}`, STUDENT_TEXT[i] ?? "");
      });
    }
  });
  await step("student calendar", async () => (await studentNav(en.student.calendar), await snap(page, STU, "Student calendar", "Classes, tests and due dates.")));
  await step("student community", async () => (await studentNav(en.community.nav), await snap(page, STU, "Community", "A safe, moderated class community: posts, likes, comments and friends.")));
  await step("student messages", async () => (await page.getByRole("button", { name: new RegExp(`${esc(en.kid.navMessages)}$`) }).first().click(), await settle(page, 700), await snap(page, STU, "Messages", "Chat with the teacher and classmates.")));
  await step("explore", async () => {
    await page.getByRole("tab", { name: en.student.explore }).first().click();
    await settle(page, 800);
    await snap(page, STU, "Explore videos", "Free lessons from teachers, by subject and level.");
  });
  await step("play", async () => (await go("/play"), await snap(page, STU, "Live quiz game", "Join the teacher's live quiz with a code, Kahoot-style.")));
  await step("settings student", async () => (await go("/settings"), await snap(page, STU, "Student settings", "Profile, notifications, theme and language.")));

  // ---------- Guardian ----------
  const PAR = "6 · Guardian";
  await asRole(ctx, "parent");
  for (const [url, title, cap] of [
    ["/parent", "Guardian home", "Attendance, fees, latest results and the next class for each child."],
    ["/parent/results", "Results", "Every mark with progress over time."],
    ["/parent/report", "Report card", "The monthly report card with the teacher's comment."],
    ["/parent/payments", "Payments", "Fee history and receipts."],
    ["/parent/messages", "Messages", "Chat with the teacher about the child."],
    ["/parent/invoice", "Invoice", "Printable fee invoice."],
  ]) await step(title, async () => (await go(url), await snap(page, PAR, title, cap)));

  // ---------- Teacher's public website ----------
  await step("website", async () => (await go("/t/tanvir-sir"), await snap(page, PUB, "Teacher's own website", "Each teacher gets a public page with their courses, results and a join button.")));

  // ---------- Instanton Campus admin ----------
  const ADM = "7 · Instanton Campus admin";
  await step("admin", async () => {
    await go("/admin");
    await page.getByLabel("Admin token").fill(adminToken);
    await page.getByRole("button", { name: "Open" }).click();
    await settle(page, 900);
    await snap(page, ADM, "Admin panel", "For the Instanton Campus team: institutes, sign-ups, feature switches and announcements.");
  });
}
