import { expect, loginAs, test } from "./helpers";

test("child's home: greeting, homework, one next lesson, fun buttons; tools folded away", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await expect(page.getByRole("heading", { name: "Hi Nusrat! 👋" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your homework" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Play a quiz game/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My notes" })).toBeHidden(); // inside "My notes, my work…"
  await page.getByRole("heading", { name: "Keep learning" }).locator("..").getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("institute dashboard starts with today and what needs attention", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await expect(page.getByRole("heading", { name: /^Today ·/ })).toBeVisible();
  await expect(page.getByLabel("Viewing as")).toHaveCount(1); // owner picker only in the Money section, not the top bar
  await expect(page.getByLabel("Monthly fee").or(page.getByText("Late fine (৳)")).first()).toBeHidden(); // settings folded
  await page.getByRole("button", { name: /students owe fees/ }).click();
  await expect(page.getByRole("heading", { name: "Fees", exact: true })).toBeVisible();
});

test("guardian's home answers attendance, fees and marks in plain words", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/parent");
  await page.getByRole("button", { name: "Ayaan Jahan" }).click();
  await expect(page.getByText(/fee due$/)).toBeVisible();
  await expect(page.getByLabel("Amount to pay")).toBeHidden(); // part payment only when asked for
  await expect(page.getByText(/^Last test:/)).toBeVisible();
});

test("text size: bigger text everywhere, remembered after reload", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/parent");
  await page.getByRole("button", { name: "Text size A++" }).first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-size"))).toBe("125%");
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-size"))).toBe("125%");
});

test("text size slider on the Settings page: any size from 90% to 130%, remembered after reload", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/settings");
  await page.getByRole("slider", { name: "Text size" }).fill("130");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--text-size"))).toBe("130%");
  await page.reload();
  await expect(page.getByRole("slider", { name: "Text size" })).toHaveValue("130");
});
