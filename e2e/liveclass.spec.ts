import { expect, loginAs, test } from "./helpers";

test("live class: teacher goes live; a student on another device joins, raises a hand, asks, chats; attendance and board work", async ({ page, browser }) => {
  // Teacher
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: /Live class/ }).click();
  await page.getByRole("button", { name: /Go live/ }).click();
  await expect(page.getByText("0 of 7 joined")).toBeVisible();
  const teacherRoom = await page.getByRole("link", { name: /Open the class room/ }).getAttribute("href");

  // Student on a separate device (nothing shared with the teacher's browser)
  const phone = await browser.newContext();
  await phone.addCookies([{ name: "edunest-role", value: "student", url: "http://localhost:3100" }]);
  const s = await phone.newPage();
  await s.goto("/student");
  await s.getByRole("button", { name: "My class" }).first().click();
  await s.getByRole("button", { name: "Live class" }).first().click();
  await expect(s.getByText(/LIVE · /)).toBeVisible();
  const room = (href: string | null) => href?.split("#")[0];
  expect(room(await s.getByRole("link", { name: /Open the class room/ }).getAttribute("href"))).toBe(room(teacherRoom)); // same secret room
  await expect(s.getByRole("link", { name: /Audio only/ })).toHaveAttribute("href", /startAudioOnly=true/);
  await s.getByRole("button", { name: /Raise hand/ }).click();
  await s.getByLabel("Ask a question…").fill("Why is SHM periodic?");
  await s.getByRole("button", { name: "Ask", exact: true }).click();
  await s.getByLabel("Write a message…").fill("Hello sir");
  await s.locator("section[aria-label='Class chat']").getByRole("button", { name: "Send" }).click();

  // Teacher sees everything and saves attendance from who joined
  await expect(page.getByText("1 of 7 joined")).toBeVisible();
  await expect(page.getByRole("region", { name: "Raised hands" })).toContainText("Nusrat Jahan");
  await expect(page.getByRole("region", { name: "Questions" })).toContainText("Why is SHM periodic?");
  await expect(page.getByRole("region", { name: "Class chat" })).toContainText("Hello sir");
  await page.getByRole("region", { name: "Raised hands" }).getByRole("button", { name: "Lower" }).click();
  await expect(s.getByRole("button", { name: /Raise hand/ })).toBeVisible(); // lowered on the student's phone too
  await page.getByRole("button", { name: "Save as today's attendance" }).click();
  await expect(page.getByText("Attendance saved: 1 present, 6 absent")).toBeVisible();

  // Board shared from the whiteboard reaches the student
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^Interactive Whiteboard/ }).click();
  await page.getByLabel(/Show my board in the live class/).check();
  await expect(s.getByRole("img", { name: "Teacher's board" })).toBeVisible({ timeout: 15_000 });

  // End the class
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: /Live class/ }).click();
  await page.getByRole("button", { name: "End class" }).click();
  await expect(s.getByText("No live class right now.")).toBeVisible();
  await phone.close();
});

test("live class API: only teachers start classes or delete messages; made-up rooms refused", async ({ request }) => {
  expect((await request.post("/api/class", { data: { action: "start", batch: "X", room: "ClassBARI-" + "a".repeat(32) } })).status()).toBe(403);
  const staff = { Cookie: "edunest-role=teacher" };
  expect((await request.post("/api/class", { headers: staff, data: { action: "start", batch: "X", room: "evil" } })).status()).toBe(400);
  expect((await request.post("/api/class", { headers: staff, data: { action: "start", batch: "X", room: "ClassBARI-" + "b".repeat(32) } })).status()).toBe(200);
  expect((await request.post("/api/class", { data: { action: "deleteChat", batch: "X", id: 1 } })).status()).toBe(403);
  expect((await request.post("/api/class", { headers: staff, data: { action: "end", batch: "X" } })).status()).toBe(200);
});
