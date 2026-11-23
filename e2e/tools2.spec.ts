import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, loginAs, test } from "./helpers";

const tool = async (page: Page, name: string) => {
  await loginAs(page, "institute"); // the owner sees every tool and every batch
  await page.goto("/institute");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
};
const asStudent = async (page: Page) => {
  await loginAs(page, "student");
  await page.goto("/student");
};

test("import students from Excel/CSV: checks every row, unique roll numbers", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Students" }).first().click();
  const csv = [
    "Student name,Student Gmail,Guardian name,Guardian Gmail,Guardian phone",
    "Imported One,imp.one@gmail.com,Parent One,par.one@gmail.com,1711000001", // Excel dropped the leading 0
    "Imported Two,imp.two@gmail.com,Parent Two,par.two@gmail.com,01711000002",
    "Bad Mail,bad@yahoo.com,Parent,par.bad@gmail.com,01711000003",
    "Copy One,imp.one@gmail.com,Parent,par.x@gmail.com,01711000004", // same Gmail as row 2
  ].join("\n");
  await page.getByLabel("Choose file").setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("2 ready to import · 2 need fixing")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 students" }).click();
  const one = page.locator("li", { hasText: "imp.one@gmail.com" });
  const two = page.locator("li", { hasText: "imp.two@gmail.com" });
  await expect(one).toContainText("01711000001");
  const roll = async (li: typeof one) => (await li.innerText()).match(/Roll (\d+)/)![1];
  expect(await roll(one)).not.toBe(await roll(two));
});

test("import students from a PDF table: its columns are found on this device and each row checked", async ({ page, browser }) => {
  // A PDF of a printed list, made here, laid out as Excel or Word would.
  const maker = await browser.newPage();
  await maker.setContent(`<table style="font: 12px Arial; border-spacing: 18px 6px"><tr><th>SL</th><th>Student name</th><th>Student Gmail</th><th>Guardian name</th><th>Guardian Gmail</th><th>Guardian phone</th></tr>
    <tr><td>1</td><td>Pdf One</td><td>pdf.one@gmail.com</td><td>Parent Pdf</td><td>parent.pdf@gmail.com</td><td>01711000021</td></tr>
    <tr><td>2</td><td>Pdf Two</td><td>pdf.two@yahoo.com</td><td>Parent Two</td><td>parent.two@gmail.com</td><td>+880 1711-000022</td></tr></table>`);
  const pdf = await maker.pdf();
  await maker.close();
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Students" }).first().click();
  await page.getByLabel("Choose file").setInputFiles({ name: "list.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText("1 ready to import · 1 need fixing")).toBeVisible();
  await expect(page.locator("li", { hasText: "Row 2:" })).toContainText("Pdf Two · pdf.two@yahoo.com · Parent Two · 01711000022"); // +880 1711-000022 as 01711000022
  await expect(page.locator("li", { hasText: "Row 2:" })).toContainText("Enter a Gmail address");
  // The row to fix goes out as a sheet in the template's columns, to fix in Excel and import again.
  const [sheet] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download the rows to fix (for Excel)" }).click()]);
  expect(sheet.suggestedFilename()).toBe("instanton-students-to-fix.csv");
  await page.getByRole("button", { name: "Import 1 student", exact: true }).click();
  await expect(page.locator("li", { hasText: "pdf.one@gmail.com" })).toContainText("01711000021");
});

test("import students: the template comes as Excel, CSV or PDF, and the Excel one reads back", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Students" }).first().click();
  let excel = Buffer.alloc(0);
  for (const [label, ext] of [["Excel", "xlsx"], ["CSV", "csv"], ["PDF", "pdf"]]) {
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: `Download template (${label})` }).click()]);
    expect(file.suggestedFilename()).toBe(`instanton-students-template.${ext}`);
    if (ext === "xlsx") excel = await readFile(await file.path());
  }
  // Read back: its headings say what every column holds, and its example student is ready to import.
  await page.getByLabel("Choose file").setInputFiles({ name: "template.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: excel });
  await expect(page.getByText("1 ready to import · 0 need fixing")).toBeVisible();
  await expect(page.locator("li", { hasText: "Row 2:" })).toContainText("Nusrat Jahan · nusrat@gmail.com · Kamal Jahan · 01711234511");
});

test("import students: a list with its own headings, in its own order: say which column is which, then import", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Students" }).first().click();
  const csv = ["Abba,Naam,Mail,Abba mail,Phone no", "Parent Map,Map One,map.one@gmail.com,map.p1@gmail.com,01711000051"].join("\n");
  await page.getByLabel("Choose file").setInputFiles({ name: "list.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  // Filled in from what the columns hold: the Gmails and the number are right, the two names the wrong way round.
  await expect(page.getByRole("combobox", { name: "Mail", exact: true })).toHaveValue("email");
  await expect(page.locator("li", { hasText: "Row 2:" })).toContainText("Parent Map · map.one@gmail.com · Map One");
  await page.getByRole("combobox", { name: "Naam" }).selectOption("name"); // "Abba" loses "Student name"
  await expect(page.getByText("Choose which column is: Guardian name.")).toBeVisible();
  await page.getByRole("combobox", { name: "Abba", exact: true }).selectOption("guardianName");
  await expect(page.locator("li", { hasText: "Row 2:" })).toContainText("Map One · map.one@gmail.com · Parent Map · 01711000051");
  await page.getByRole("button", { name: "Import 1 student", exact: true }).click();
  await expect(page.locator("li", { hasText: "map.one@gmail.com" })).toContainText("Map One");
});

test("routine: a clash is flagged; students see their routine", async ({ page }) => {
  await tool(page, "Class routine");
  await page.getByLabel("Day").selectOption({ label: "Sat" });
  await page.getByLabel("Starts").fill("17:00");
  await page.getByLabel("Ends").fill("18:30");
  await page.getByRole("combobox", { name: /^Batch/ }).selectOption("SSC Higher Math");
  await page.getByRole("button", { name: "Add to routine" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Clash on Sat" })).toContainText("same teacher, same room");
  await asStudent(page);
  await expect(page.getByRole("heading", { name: "Class routine" })).toBeVisible();
});

test("expenses lower the month's profit", async ({ page }) => {
  await tool(page, "Expenses & profit");
  const before = Number((await page.getByTestId("profit").innerText()).replace(/[^\d-]/g, ""));
  await page.getByLabel("Amount (৳)").fill("1500");
  await page.getByLabel("Note").fill("November rent");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("Rent · November rent")).toBeVisible();
  await expect(page.getByTestId("profit")).toContainText((before - 1500).toLocaleString("en-IN"));
});

test("admission enquiry → admitted creates the student", async ({ page }) => {
  await tool(page, "Admission enquiries");
  await page.getByLabel("Student's name").fill("Tahmid Enquiry");
  await page.getByLabel("Phone").fill("01811000009");
  await page.getByRole("button", { name: "Save enquiry" }).click();
  await page.getByLabel("Stage of Tahmid Enquiry").selectOption("admitted");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Student Gmail/).fill("tahmid.enq@gmail.com");
  await dialog.getByLabel(/Guardian name/).fill("Tahmid's Father");
  await dialog.getByLabel("Male or female").selectOption("male");
  await dialog.getByLabel(/Guardian Gmail/).fill("tahmid.father@gmail.com");
  await dialog.getByRole("button", { name: "Admit student" }).click();
  await expect(page.getByRole("article", { name: "Tahmid Enquiry" }).getByLabel("Stage of Tahmid Enquiry")).toHaveValue("admitted");
  await page.getByRole("button", { name: "Students" }).first().click();
  await expect(page.getByText("tahmid.enq@gmail.com")).toBeVisible();
});

test("staff absent today and leave approval", async ({ page }) => {
  await tool(page, "Staff attendance");
  await page.getByRole("button", { name: "Rumana Ma'am: Present" }).click();
  await expect(page.getByRole("button", { name: "Rumana Ma'am: Absent" })).toBeVisible();
  await page.getByLabel("Teacher").selectOption("Rumana Ma'am");
  await page.getByLabel("Reason").fill("Family wedding");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved")).toBeVisible();
});

test("parent books a meeting slot the teacher opened", async ({ page }) => {
  await tool(page, "Parent meetings");
  await page.getByLabel("How many").fill("2");
  await page.getByRole("button", { name: "Open slots" }).click();
  await loginAs(page, "parent");
  await page.goto("/parent");
  await page.getByRole("heading", { name: "Meet the teacher" }).scrollIntoViewIfNeeded();
  await page.locator("section", { hasText: "Meet the teacher" }).getByRole("button").first().click();
  await expect(page.getByText(/Your meeting: .* with Tanvir Sir/)).toBeVisible();
  await tool(page, "Parent meetings");
  await expect(page.getByText(/\(Nusrat Jahan\)/)).toBeVisible();
});

test("doubt: student asks, teacher answers and marks solved", async ({ page }) => {
  await asStudent(page);
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: "Ask a doubt" }).first().click();
  await page.getByLabel("Ask your teacher").fill("Why is the period independent of mass?");
  await page.getByRole("button", { name: "Send question" }).click();
  await tool(page, "Doubts");
  const d = page.getByRole("article", { name: /Why is the period/ });
  await d.getByLabel("Write your answer…").fill("Because mass cancels out in T = 2π√(L/g).");
  await d.getByRole("button", { name: "Send & mark solved" }).click();
  await asStudent(page);
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: "Ask a doubt" }).first().click();
  await expect(page.getByText("Because mass cancels out")).toBeVisible();
  await expect(page.getByText("Solved ✓").first()).toBeVisible();
});

test("watch time: what a student played shows up for the teacher", async ({ page }) => {
  await asStudent(page);
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: /Lecture 1: Definitions/ }).first().click();
  await page.locator("[role=dialog] video").evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 7000));
    v.pause();
  });
  await tool(page, "Video watch time");
  const card = page.getByRole("region", { name: /Lecture 1: Definitions/ });
  await expect(card.locator("div", { hasText: "Nusrat Jahan" }).last()).toContainText(/[1-9]\d?%/);
});

test("course shop: coupon + bKash TrxID, teacher confirms, student enrolled", async ({ page }) => {
  await tool(page, "My website");
  await page.getByLabel("Your bKash number for course payments").fill("01711999888");
  await page.getByLabel("Show my page to the public").check();
  await page.getByRole("button", { name: "All tools" }).click();
  await page.getByRole("button", { name: /^Course shop/ }).click();
  await page.getByLabel("Code").fill("eid20");
  await page.getByRole("button", { name: "Add coupon" }).click();

  await page.goto("/t/tanvir-sir");
  await page.getByRole("link", { name: /HSC Physics · A/ }).click();
  await page.getByLabel(/Student full name/).fill("Shop Buyer");
  await page.getByLabel(/Student Gmail/).fill("shop.buyer@gmail.com");
  await page.getByLabel(/Guardian name/).fill("Buyer Parent");
  await page.getByLabel(/Guardian Gmail/).fill("buyer.parent@gmail.com");
  await page.getByLabel(/Guardian mobile|Guardian phone/).first().fill("01711000077");
  await page.getByRole("button", { name: "Next: payment" }).click();
  await page.getByLabel("Coupon code").fill("EID20");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("EID20 applied: you save ৳240")).toBeVisible();
  await expect(page.getByText(/"Send Money" ৳960 to 01711999888/)).toBeVisible();
  await page.getByLabel("bKash TrxID").fill("9F4K2LQ8XZ");
  await page.getByRole("button", { name: "I have paid ৳960" }).click();
  await expect(page.getByText(/The teacher will check the payment/)).toBeVisible();

  await tool(page, "Course shop");
  const order = page.locator("div[aria-label='Shop Buyer']");
  await expect(order).toContainText("9F4K2LQ8XZ");
  await order.getByRole("button", { name: "Payment received ✓" }).click();
  await expect(order).toContainText("Enrolled");
  await expect(page.getByText("used 1 of 50")).toBeVisible();
});

test("push notifications API: subscribe validation, teachers only for sending", async ({ request, page }) => {
  expect((await (await request.get("/api/push")).json()).publicKey).toBeTruthy();
  expect((await request.post("/api/push", { data: { subscription: { endpoint: "http://x" }, role: "parent", batches: ["A"] } })).status()).toBe(400);
  const sub = { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-not-real", keys: { p256dh: "k", auth: "a" } }, role: "parent", batches: ["E2E only"] };
  expect((await request.post("/api/push", { data: sub })).status()).toBe(200);
  expect((await request.post("/api/push/send", { data: { batch: "E2E none", title: "t", body: "b" } })).status()).toBe(403);
  const sent = await request.post("/api/push/send", { headers: { Cookie: "edunest-role=teacher" }, data: { batch: "E2E none", title: "t", body: "b", url: "https://evil.example" } });
  expect(await sent.json()).toMatchObject({ sent: 0, of: 0 });
  expect((await request.delete("/api/push", { data: { endpoint: sub.subscription.endpoint } })).status()).toBe(200);
  await asStudent(page);
  // Offered on the student home (headless Chrome always reports notifications as blocked, which the panel explains).
  await expect(page.getByText(/Get class news, homework and results|Notifications are blocked/)).toBeVisible();
});
