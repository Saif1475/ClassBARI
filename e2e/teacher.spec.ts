import { readFile } from "node:fs/promises";
import { alertText, expect, expectVideoPlays, loginAs, test } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loginAs(page, "teacher");
});

const studio = async (page: import("@playwright/test").Page, section: string, area = "/teacher") => {
  await page.goto(area);
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: new RegExp(section) }).click();
};

test("dashboard shows money, income report, payroll and centre teachers", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await page.goto("/institute");
  await expect(page.getByText("Collected this month")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Income report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Teacher payroll/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Centre teachers" })).toBeVisible();
});

test("viewing as one teacher shows only their batches", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await page.goto("/institute");
  await page.getByLabel("Viewing as").first().selectOption("Rumana Ma'am");
  await expect(page.getByRole("heading", { name: "SSC Higher Math" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "HSC Physics · A" })).toHaveCount(0);
});

test("payroll: mark a teacher paid", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await page.goto("/institute");
  const row = page.locator("tr", { hasText: "Rumana Ma'am" });
  await row.getByRole("button", { name: /Mark paid/ }).click();
  await expect(page.getByText(/Payment to Rumana Ma'am recorded/)).toBeVisible();
  await expect(row.getByRole("button", { name: /Mark paid/ })).toHaveCount(0);
});

test("create a module and a quiz; a bad quiz format is rejected", async ({ page }) => {
  await studio(page, "Lessons");
  await page.getByRole("button", { name: "Module", exact: true }).click();
  await page.getByLabel("New chapter / module title").fill("Chapter 6 · Optics");
  await page.getByRole("button", { name: "Create module" }).click();
  await expect(page.getByText("Chapter 6 · Optics").first()).toBeVisible();

  await page.locator("aside").getByRole("button", { name: /Tests & exams/ }).click();
  await page.getByRole("button", { name: "New quiz" }).click();
  await page.getByLabel("Title").fill("Optics quiz");
  await page.getByRole("textbox", { name: /^Questions/ }).fill("Speed of light?\n3e8\n3e5");
  await page.getByRole("button", { name: "Publish item" }).click();
  await expect(alertText(page)).toContainText("Question 1");
  await page.getByRole("textbox", { name: /^Questions/ }).fill("Speed of light?\n*3e8 m/s\n3e5 m/s");
  await page.getByRole("button", { name: "Publish item" }).click();
  await expect(page.getByText("Optics quiz").first()).toBeVisible();
});

test("written exam with a question paper upload", async ({ page }) => {
  await studio(page, "Tests & exams");
  await page.getByRole("button", { name: "New written exam" }).click();
  await page.getByLabel("Title").fill("Optics written test");
  await page.getByLabel(/Question paper/).setInputFiles("e2e/fixtures/answer.jpg");
  await page.getByRole("button", { name: "Publish item" }).click();
  const card = page.locator("div.rounded-\\[16px\\]", { hasText: "Optics written test" });
  await expect(card.getByRole("button", { name: "Question paper" })).toBeVisible();
});

test("grade an assignment submission (no rubric: one grade box)", async ({ page }) => {
  await studio(page, "Homework");
  const row = page.locator("li", { hasText: "Rafsan Ahmed" });
  await row.getByLabel(/Grade/).fill("20");
  await row.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Grade saved ✓").first()).toBeVisible();
});

test("upload a video lecture; the student can play it", async ({ page }) => {
  await studio(page, "Lessons");
  await page.getByRole("button", { name: "Add item", exact: true }).first().click();
  await page.getByLabel("Title").fill("Uploaded lecture");
  await page.getByLabel(/upload a file from this device/).setInputFiles("public/samples/lecture-shm.mp4");
  await page.getByRole("button", { name: "Publish item" }).click();
  await expect(page.getByText("Uploaded lecture").first()).toBeVisible();

  await page.goto("/student");
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: "Uploaded lecture" }).first().click();
  await expectVideoPlays(page, "[role=dialog] video");
  expect(await page.locator("[role=dialog] video").getAttribute("src")).toMatch(/^blob:/);
});

test("students: attendance, installment, discount, invoice", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await studio(page, "Attendance", "/institute");

  const nusrat = page.locator("li", { hasText: "Nusrat Jahan" });
  await nusrat.getByRole("button", { name: "Present" }).click();
  await expect(nusrat.getByRole("button", { name: "Absent" })).toBeVisible();

  await page.locator("aside").getByRole("button", { name: /Fees/ }).click();
  const tasnim = page.locator("li", { hasText: "Tasnim Haque" });
  const before = Number((await tasnim.getByRole("button", { name: /Due ৳/ }).innerText()).replace(/[^\d]/g, ""));
  await tasnim.getByRole("button", { name: /Due ৳/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (৳)").fill("400");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(tasnim.getByRole("button", { name: /Due ৳/ })).toContainText((before - 400).toLocaleString("en-IN"));

  await tasnim.getByRole("button", { name: /Due ৳/ }).click();
  await page.getByRole("dialog").getByLabel(/Monthly discount/).fill("300");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Invoice" }).click();
  await expect(page.getByRole("heading", { name: /Monthly invoice/ })).toBeVisible();
  await expect(page.getByText("Discount / scholarship")).toBeVisible();
});

test("QR attendance marks the scanned student present (fake camera)", async ({ page }) => {
  await studio(page, "Attendance");
  await page.getByRole("button", { name: "Scan QR attendance" }).click();
  await expect(page.getByText("Nusrat Jahan — present ✓")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("li", { hasText: "Nusrat Jahan" }).getByRole("button", { name: "Present" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Rafsan Ahmed" }).getByRole("button", { name: "Absent" })).toBeVisible();
});

test("fee reminder by SMS (test mode: saved for the admin, not really sent)", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await studio(page, "Fees", "/institute");
  const first = page.locator("li").filter({ has: page.getByRole("button", { name: "SMS", exact: true }) }).first();
  const name = (await first.locator("span.font-bold").first().textContent())!;
  const row = page.locator("li").filter({ hasText: name });
  await row.getByRole("button", { name: "SMS", exact: true }).click();
  await expect(row.getByRole("button", { name: "Saved (test) ✓" })).toBeVisible();
  const data = await (await page.request.get("/api/platform/admin", { headers: { Authorization: "Bearer e2e-token" } })).json();
  expect(data.smsLog.some((e: { text: string; status: string }) => e.status === "test" && e.text.includes(name))).toBe(true);
});

test("CSV export downloads the roster with attendance", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await studio(page, "Fees", "/institute");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain('"Roll","Name","Phone"');
  expect(csv).toContain("Nusrat Jahan");
});

test("report card comment is saved", async ({ page }) => {
  await page.goto("/teacher/report/1");
  await expect(page.getByRole("heading", { name: "Monthly report card" })).toBeVisible();
  await page.getByLabel("Teacher's comment").fill("Strong in SHM, practise pendulum problems.");
  await page.getByRole("heading", { name: "Monthly report card" }).click(); // blur saves
  await page.reload();
  await expect(page.getByLabel("Teacher's comment")).toHaveValue("Strong in SHM, practise pendulum problems.");
});

test("announcement reaches the student view", async ({ page }) => {
  await studio(page, "Announcements");
  await page.getByPlaceholder(/Title \(e.g. Extra/).fill("Test on Sunday");
  await page.getByPlaceholder("Write the details for students…").fill("Bring a calculator.");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await page.goto("/student");
  await expect(page.getByText("Test on Sunday").first()).toBeVisible();
});

test("calendar event and inbox reply", async ({ page }) => {
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Calendar" }).first().click();
  await page.getByPlaceholder(/Event title/).fill("Extra revision class");
  await page.getByRole("button", { name: "+ Add to calendar" }).click();
  await expect(page.getByText("Extra revision class")).toBeVisible();

  await page.getByRole("button", { name: /Inbox/ }).first().click();
  await page.getByPlaceholder(/Reply as Tanvir Sir/).fill("See you in class.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("section").getByText("See you in class.")).toBeVisible();
});

test("copy a module to another batch and delete a module", async ({ page }) => {
  await studio(page, "Lessons");
  const header = page.locator("div.overflow-hidden.rounded-\\[18px\\]", { hasText: "Chapter 3 · Gravitation" });
  await header.getByLabel("Copy to batch…").selectOption("SSC Higher Math");
  await expect(page.getByText("Module copied ✓")).toBeVisible();
  await header.getByRole("button", { name: "Delete module" }).click();
  await expect(page.getByText("Chapter 3 · Gravitation")).toHaveCount(0);
});

test("laptop: module cards not clipped, header controls not overlapping", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  await studio(page, "Lessons");
  const clipped = await page.locator("main div.overflow-hidden").evaluateAll((els) =>
    els.filter((e) => e.scrollHeight - e.clientHeight > 2).map((e) => e.textContent?.slice(0, 40)),
  );
  expect(clipped).toEqual([]);
  const header = await page.locator("header.md\\:flex").boundingBox();
  const buttons = await page.locator("header.md\\:flex button, header.md\\:flex select").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  for (const b of buttons) expect(b).toBeLessThanOrEqual(header!.y + header!.height + 1);
});

test("Students page: enrol with Gmail, rules enforced, then edit", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await page.goto("/institute");
  await page.getByRole("button", { name: "Students" }).first().click();
  await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
  const form = page.locator("section", { hasText: "Enrol a new student" });
  await form.getByLabel("Student full name *").fill("New Kid");
  await form.getByLabel("Student Gmail *").fill("new.kid@yahoo.com");
  await form.getByLabel("Guardian name *").fill("Parent Kid");
  await form.getByLabel("Male or female").selectOption("male");
  await form.getByLabel("Guardian Gmail *").fill("nusrat.jahan@gmail.com"); // belongs to a student
  await form.getByLabel("Guardian mobile *").fill("1234");
  await form.getByRole("button", { name: "Enrol student" }).click();
  await expect(form.getByText("Enter a Gmail address (name@gmail.com).")).toBeVisible();
  await expect(form.getByText("This Gmail belongs to a student, not a guardian.")).toBeVisible();
  await expect(form.getByText("Enter a valid mobile number (01XXXXXXXXX).")).toBeVisible();

  await form.getByLabel("Student Gmail *").fill("new.kid@gmail.com");
  await form.getByLabel("Guardian Gmail *").fill("parent.kid@gmail.com");
  await form.getByLabel("Guardian mobile *").fill("01755555555");
  await form.getByLabel("School / college").fill("Dhaka College");
  await form.getByRole("button", { name: "Enrol student" }).click();
  await expect(page.getByText(/New Kid enrolled/)).toBeVisible();
  const row = page.locator("li", { hasText: "new.kid@gmail.com" });
  await expect(row).toContainText("parent.kid@gmail.com");

  await row.getByRole("button", { name: "Edit New Kid" }).click();
  await page.getByRole("dialog").getByLabel("Guardian name *").fill("Parent Kid Sr");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(row).toContainText("Parent Kid Sr");
});

test("attendance screen shows no fees, phone numbers or report cards (students may see it)", async ({ page }) => {
  await loginAs(page, "institute"); // fees, payroll and enrolment belong to the institute owner
  await studio(page, "Attendance", "/institute");
  const list = page.locator("main ul").first();
  await expect(list.locator("li", { hasText: "Tasnim Haque" })).toBeVisible();
  await expect(list).not.toContainText("৳");
  await expect(list).not.toContainText(/Due|Paid|Late/);
  await expect(list).not.toContainText(/01\d{3}-?\d{6}/); // no phone numbers
  await expect(page.getByRole("link", { name: "Report card" })).toHaveCount(0);
  await expect(page.getByText("Fee status")).toHaveCount(0);

  await page.locator("aside").getByRole("button", { name: /Fees/ }).click();
  await expect(page.locator("li", { hasText: "Tasnim Haque" })).toContainText(/Due ৳/);

  await page.locator("aside").getByRole("button", { name: "Marks" }).click();
  await expect(page.getByRole("link", { name: "Report card" }).first()).toBeVisible();
});
