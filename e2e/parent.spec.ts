import { expect, loginAs, test } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/parent");
});

test("home shows the child, attendance and upcoming", async ({ page }) => {
  await expect(page.getByText("Nusrat Jahan").first()).toBeVisible();
  await expect(page.getByText(/Came to \d+ of \d+ classes/)).toBeVisible();
  await expect(page.getByText("Fee paid ✓")).toBeVisible();
  await expect(page.getByRole("link", { name: /Call Tanvir Sir/ })).toHaveAttribute("href", /^tel:/);
});

test("switch child and pay an installment", async ({ page }) => {
  await page.getByRole("button", { name: "Ayaan Jahan" }).click();
  await expect(page.locator("header").getByText("Ayaan Jahan")).toBeVisible();
  const due = Number((await page.locator("#pay span.text-4xl").innerText()).replace(/[^\d]/g, "").slice(0, 6));
  await page.getByText("Pay only part of the fee").click();
  await page.getByLabel("Amount to pay").fill("400");
  await page.getByRole("button", { name: /Pay with bKash · ৳400/ }).click();
  await expect(page.locator("#pay span.text-4xl")).toContainText((due - 400).toLocaleString("en-IN"));
  await page.getByRole("link", { name: "Payments" }).first().click();
  await expect(page.getByText("৳400").first()).toBeVisible();
  await page.getByRole("link", { name: "Receipt" }).first().click();
  await expect(page.getByRole("heading", { name: "Fee receipt" })).toBeVisible();
});

test("invoice, results and report card", async ({ page }) => {
  await page.goto("/parent/invoice");
  await expect(page.getByRole("heading", { name: /Monthly invoice/ })).toBeVisible();
  await page.goto("/parent/results");
  await expect(page.getByRole("heading", { name: "Attendance log" })).toBeVisible();
  await page.getByRole("link", { name: "Report card" }).click();
  await expect(page.getByRole("heading", { name: "Monthly report card" })).toBeVisible();
  await expect(page.getByText("Model test — Gravitation")).toBeVisible();
});

test("message reaches the teacher's inbox", async ({ page }) => {
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByPlaceholder("Write to the teacher…").fill("Will Nusrat get extra class?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Will Nusrat get extra class?")).toBeVisible();

  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: /Inbox/ }).first().click();
  await page.getByRole("button", { name: /Nusrat Jahan — guardian/ }).click();
  await expect(page.locator("section").getByText("Will Nusrat get extra class?")).toBeVisible();
});

test("WhatsApp-style chat: reply, react, edit, delete for everyone, search and settings", async ({ page }) => {
  await page.getByRole("link", { name: "Messages" }).first().click();
  const box = page.getByPlaceholder("Write to the teacher…");
  await box.fill("Is there class on Friday?");
  await box.press("Enter"); // Enter is send (the default on a computer)
  const bubble = page.locator("section").getByText("Is there class on Friday?");
  await expect(bubble).toBeVisible();
  await expect(page.getByRole("img", { name: "Sent" }).last()).toBeVisible();

  const menu = () => page.getByRole("button", { name: "Message options" }).last();
  await menu().click();
  await page.getByRole("menuitem", { name: "👍" }).click();
  await expect(page.locator("section").getByText("👍")).toBeVisible();

  await menu().click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await box.fill("Or Saturday?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("section a[href^='#msg-']").getByText("Is there class on Friday?")).toBeVisible(); // the quote

  await menu().click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await box.fill("Or on Saturday?");
  await box.press("Enter");
  await expect(page.locator("section").getByText("Or on Saturday?")).toBeVisible();
  await expect(page.locator("section").getByText("edited")).toBeVisible();

  await menu().click();
  await page.getByRole("menuitem", { name: "Delete for everyone" }).click();
  await expect(page.getByText("You deleted this message")).toBeVisible();

  await page.getByRole("button", { name: "Search messages" }).click();
  await page.getByRole("textbox", { name: "Search messages" }).fill("friday");
  await expect(page.locator("section mark").getByText("Friday")).toBeVisible();

  await page.getByRole("button", { name: "Chat settings" }).click();
  await page.getByRole("button", { name: "Night" }).click();
  await page.getByRole("switch", { name: /Enter is send/ }).uncheck();
  await page.reload();
  await page.getByRole("button", { name: "Chat settings" }).click();
  await expect(page.getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true"); // kept on this device
  await expect(page.getByRole("switch", { name: /Enter is send/ })).not.toBeChecked();
});
