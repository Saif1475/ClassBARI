import type { Page } from "@playwright/test";
import { expect, loginAs, test } from "./helpers";

const tool = async (page: Page, name: string) => {
  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
};

test("negative marking, sections and shuffled questions", async ({ page }) => {
  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: /Tests & exams/ }).click();
  await page.getByRole("button", { name: "New quiz" }).click();
  await page.getByLabel("Title").fill("Admission mock");
  await page.getByLabel("Total marks").fill("4");
  await page.getByLabel(/^Questions/).fill("## Physics\nQ1\n*a\nb\n\nQ2\n*a\nb\n\n## Chemistry\nQ3\n*a\nb\n\nQ4\n*a\nb");
  await page.getByLabel(/Negative marking/).fill("0.25");
  await page.getByLabel(/Shuffle questions/).check();
  await page.getByRole("button", { name: "Publish item" }).click();

  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: /Admission mock/ }).first().click();
  await expect(page.getByText("Negative marking: −0.25")).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Physics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chemistry" })).toBeVisible();
  // Right answer is "a" everywhere: answer Q1, Q2 right, Q3 wrong, skip Q4 -> 2 - 0.25 = 1.75
  for (const [q, opt] of [["Q1", "a"], ["Q2", "a"], ["Q3", "b"]]) await page.getByRole("group", { name: q }).getByText(opt, { exact: true }).click();
  await page.locator("div.fixed.inset-0").getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("status")).toContainText("1.75");
  await expect(page.getByRole("status")).toContainText("Chemistry: 0 right · 1 wrong · 1 skipped");
});

test("merit list: published positions reach the guardian, never others' marks", async ({ page }) => {
  await tool(page, "Merit list");
  await page.getByLabel("Test").selectOption({ label: "Model test — Gravitation · HSC Physics · A" });
  await expect(page.locator("ol li").first()).toContainText("29 / 30");
  await page.getByLabel("Show positions to students and guardians").check();

  await loginAs(page, "parent");
  await page.goto("/parent/results");
  const row = page.locator("div", { hasText: "Model test — Gravitation" }).last();
  await expect(row).toContainText("Position in class: 3 of 7"); // Nusrat 26: behind 29 and 28
  await expect(page.getByText("29 / 30")).toHaveCount(0);
});

test("OMR: print a sheet, fill it, photograph it, marks are saved", async ({ page }) => {
  await loginAs(page, "teacher");
  // The printed sheet for the 5-question Chapter 4 quiz, filled in: roll 0001, set A, answers B C A C B (all right).
  await page.goto("/teacher/print?kind=omr&n=5&title=Chapter%204");
  await expect(page.locator("svg circle").first()).toBeAttached();
  await page.evaluate(() => {
    const circles = [...document.querySelectorAll("svg circle")] as SVGCircleElement[];
    const at = (x: number, y: number) => circles.find((c) => Math.abs(+c.getAttribute("cx")! - x) < 0.01 && Math.abs(+c.getAttribute("cy")! - y) < 0.01)!;
    const fill = (x: number, y: number) => at(x, y).setAttribute("fill", "#111");
    [0, 0, 0, 1].forEach((d, col) => fill(24 + col * 7, 58 + d * 6)); // roll 0001
    fill(82, 58); // set A
    [1, 2, 0, 2, 1].forEach((opt, q) => fill(26 + opt * 7, 128 + q * 6.2));
  });
  await page.locator("svg").screenshot({ path: "e2e-results/omr-filled.png" });

  await page.goto("/teacher");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^OMR scanner/ }).click();
  await page.getByLabel("Test").selectOption({ label: "MCQ quiz — Chapter 4 · HSC Physics · A (5)" });
  await page.getByText("Add photos of sheets").locator("input").setInputFiles("e2e-results/omr-filled.png");
  const sheet = page.getByRole("article", { name: /omr-filled\.png/ });
  await expect(sheet.getByLabel("Student")).toHaveValue("1");
  await expect(sheet.getByText("30 / 30")).toBeVisible();
  await sheet.getByRole("button", { name: "Question 2: C" }).click(); // teacher corrects a mark: C -> D
  await expect(sheet.getByText("24 / 30")).toBeVisible();
  await sheet.getByRole("button", { name: "Save marks" }).click();
  await expect(sheet.getByRole("button", { name: "Saved ✓" })).toBeVisible();
  await page.getByRole("button", { name: "All tools" }).click();
  await page.getByRole("button", { name: /^Merit list/ }).click();
  await page.getByLabel("Test").selectOption({ label: "MCQ quiz — Chapter 4 · HSC Physics · A" });
  await expect(page.locator("ol li", { hasText: "Nusrat Jahan" })).toContainText("24 / 30");
});

test("question bank: add questions, make a test from them", async ({ page }) => {
  await tool(page, "Question bank");
  await page.getByRole("textbox", { name: "Add questions to the bank" }).fill("[Optics] Speed of light?\n*3×10⁸ m/s\n340 m/s\n\n[Optics] Lens power unit?\n*Dioptre\nWatt");
  await page.getByLabel("Difficulty").nth(1).selectOption("easy");
  await page.getByRole("button", { name: "Add to bank" }).click();
  await page.getByLabel("Topic").selectOption("Optics");
  await expect(page.getByText("2 questions match")).toBeVisible();
  await page.getByLabel("Test name").fill("Optics quick test");
  await page.getByLabel("How many").fill("2");
  await page.getByRole("button", { name: "Make test" }).click();
  await expect(page.getByText('"Optics quick test" made with 2 questions')).toBeVisible();
});

test("ID cards print with photo and QR code", async ({ page }) => {
  await tool(page, "ID cards");
  await page.getByLabel("Photo of Nusrat Jahan").setInputFiles("e2e/fixtures/answer.jpg");
  await expect(page.locator("li", { hasText: "Nusrat Jahan" }).getByText("Change photo")).toBeVisible();
  const [print] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: /Print \d+ ID cards/ }).click()]);
  await expect(print.getByText("Student ID").first()).toBeVisible();
  await expect(print.getByRole("img", { name: "Nusrat Jahan" })).toBeVisible();
  await expect(print.getByRole("img", { name: "QR" }).first()).toBeVisible();
});
