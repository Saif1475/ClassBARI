import { expect, loginAs, test } from "./helpers";

// Runs on a Pixel 7 screen (412×915). The app pages must scroll like normal web pages.
const scrolls = async (page: import("@playwright/test").Page) => {
  const before = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: window.innerHeight }));
  expect(before.h, "page taller than the screen").toBeGreaterThan(before.vh);
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
};
const noSidewaysScroll = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

test("landing page fits the phone and scrolls", async ({ page }) => {
  await page.goto("/");
  await noSidewaysScroll(page);
  await scrolls(page);
});

test("student: scrolls, drawer menu, bottom tabs", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await noSidewaysScroll(page);
  await scrolls(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "My marks" }).click();
  await expect(page.getByRole("heading", { name: "My progress" })).toBeVisible();
  // Explore lives under "More" in the phone tab bar.
  await page.getByRole("navigation").last().getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Explore" }).click();
  await expect(page.getByRole("link", { name: /Simple Harmonic Motion — full chapter/ })).toBeVisible();
});

test("teacher: scrolls and drawer opens a section", async ({ page }) => {
  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await noSidewaysScroll(page);
  await scrolls(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Attendance" }).click();
  await expect(page.getByRole("button", { name: "Scan QR attendance" })).toBeVisible();
});

test("parent: scrolls, bottom navigation works", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/parent");
  await noSidewaysScroll(page);
  await scrolls(page);
  await page.getByRole("navigation").last().getByRole("link", { name: "Payments" }).click();
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
});

test("item viewer opens as a bottom sheet and the video fits", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("navigation").last().getByRole("button", { name: "My class" }).click();
  await page.getByRole("button", { name: /Lecture 1: Definitions/ }).first().click();
  const box = await page.getByRole("dialog").boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box!.y + box!.height).toBeGreaterThan(vh - 2); // sits on the bottom edge
  const v = await page.locator("[role=dialog] video").boundingBox();
  expect(v!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
