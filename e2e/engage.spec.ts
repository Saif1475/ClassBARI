import { BASE, alertText, expect, loginAs, test } from "./helpers";
import type { Browser, Page } from "@playwright/test";

const teacherStudio = async (page: Page, section: string) => {
  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: new RegExp(section) }).click();
};

test("daily streak grows when the student finishes something today", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await expect(page.getByTestId("streak")).toHaveText("4-day streak");
  await expect(page.getByText("Study today to keep your streak!")).toBeVisible();
  await page.getByText("See the weekly league").click(); // folded so the home stays simple
  await expect(page.getByRole("heading", { name: "Weekly league" })).toBeVisible();

  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: /Lecture 1: Types of waves/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark complete ✓" }).click();
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await expect(page.getByTestId("streak")).toHaveText("5-day streak");
  await expect(page.getByText("Studied today ✓")).toBeVisible();
});

test("teacher can hide the weekly league", async ({ page }) => {
  await loginAs(page, "institute"); // batch settings belong to the institute
  await page.goto("/institute");
  await page.getByText("Batch settings").first().click();
  await page.getByRole("checkbox", { name: "Show the weekly league to students" }).first().uncheck();
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await expect(page.getByTestId("streak")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly league" })).toHaveCount(0);
});

async function player(browser: Browser, pin: string, name: string) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/play`);
  await p.getByLabel("Game PIN").fill(pin);
  await p.getByLabel("Your name").fill(name);
  await p.getByRole("button", { name: "Join" }).click();
  await expect(p.getByText("Get ready — the teacher will start soon")).toBeVisible();
  return p;
}

test("live quiz game: teacher hosts, two phones play, ranking at the end", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await teacherStudio(page, "Tests & exams");
  await page.getByRole("button", { name: "Play live" }).first().click();
  const pin = (await page.getByTestId("game-pin").innerText()).trim();
  expect(pin).toMatch(/^\d{6}$/);

  const rafi = await player(browser, pin, "Rafi");
  const mim = await player(browser, pin, "Mim");
  await expect(page.getByText("2 players")).toBeVisible();

  // A taken name is refused.
  const dup = await (await browser.newContext()).newPage();
  await dup.goto(`${BASE}/play`);
  await dup.getByLabel("Game PIN").fill(pin);
  await dup.getByLabel("Your name").fill("rafi");
  await dup.getByRole("button", { name: "Join" }).click();
  await expect(alertText(dup)).toContainText("taken");

  await page.getByRole("button", { name: "Start game" }).click();
  for (let q = 0; q < 5; q++) {
    // Rafi always picks the right answer on question 1; Mim picks the first option.
    await rafi.getByRole("button", { name: q === 0 ? /displacement/ : /^A/ }).click();
    await mim.getByRole("button", { name: /^A/ }).click();
    if (q === 0) {
      await expect(rafi.getByText("Correct!")).toBeVisible();
      await expect(mim.getByText("Not this time")).toBeVisible();
    }
    await page.getByRole("button", { name: q < 4 ? "Next question" : "See results" }).click();
  }
  await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible();
  await expect(rafi.getByText(/You're #1/)).toBeVisible();
  await expect(mim.getByText(/You're #2/)).toBeVisible();

  // Wrong PIN on the play page.
  await dup.goto(`${BASE}/play`);
  await dup.getByLabel("Game PIN").fill("000000");
  await dup.getByLabel("Your name").fill("X");
  await dup.getByRole("button", { name: "Join" }).click();
  await expect(alertText(dup)).toContainText("No game with that PIN");
});

test("class points and class story reach student and parent", async ({ page }) => {
  await teacherStudio(page, "Points & class story");
  const before = Number((await page.getByTestId("points-1").innerText()).replace(/[^\d-]/g, ""));
  await page.getByRole("button", { name: "Helping others — Nusrat Jahan" }).click();
  await expect(page.getByTestId("points-1")).toHaveText(`+${before + 1}`);
  await page.getByLabel("Share what happened in class today…").fill("Science fair practice today!");
  await page.getByRole("button", { name: "Post to class story" }).click();

  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await expect(page.getByText("Science fair practice today!")).toBeVisible();
  await expect(page.getByTestId("my-points")).toHaveText(`+${before + 1}`);

  // Student adds work to the portfolio; the parent sees it.
  await page.getByText("My notes, my work and my QR code").click(); // tools are folded on the home
  await page.getByLabel("What is it?").fill("Pendulum diagram");
  await page.getByLabel("Photo of your work").setInputFiles("e2e/fixtures/answer.jpg");
  await page.getByRole("button", { name: "Add to portfolio" }).click();
  await expect(page.getByRole("img", { name: "Pendulum diagram" })).toBeVisible();

  await loginAs(page, "parent");
  await page.goto("/parent");
  await expect(page.getByText("Science fair practice today!")).toBeVisible();
  await page.goto("/parent/results"); // points and portfolio live under Results
  await expect(page.getByTestId("my-points")).toHaveText(`+${before + 1}`);
  await expect(page.getByRole("img", { name: "Pendulum diagram" })).toBeVisible();
});

test("rubric: bad format rejected, criteria marks add up", async ({ page }) => {
  await teacherStudio(page, "Homework");
  await page.getByRole("button", { name: "New assignment" }).click();
  await page.getByLabel("Title").fill("Lab report");
  await page.getByLabel(/Rubric/).fill("Method 10");
  await page.getByRole("button", { name: "Publish item" }).click();
  await expect(alertText(page)).toContainText("Name: marks");
  await page.getByLabel(/Rubric/).fill("Method: 10\nResult: 5");
  await page.getByRole("button", { name: "Publish item" }).click();
  await expect(page.getByText("Lab report").first()).toBeVisible();

  await page.locator("aside").getByRole("button", { name: /Tests & exams/ }).click();
  const row = page.locator("li", { hasText: "Mahin Rahman" });
  await row.getByLabel("Mahin Rahman — Method (10)").fill("8");
  await row.getByLabel("Mahin Rahman — Final answer (10)").fill("7");
  await row.getByLabel("Mahin Rahman — Presentation (5)").fill("4");
  await expect(row.getByText("Total 19")).toBeVisible();
  await row.getByRole("button", { name: "Save grade" }).click();
  await expect(page.getByText("Grade saved ✓").first()).toBeVisible();
});

test("topic mastery and 'My mistakes' practice after a quiz", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: /MCQ quiz — Chapter 4/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start quiz" }).click();
  // Always pick the first option: only question 3 ("2 times") is right.
  for (let i = 0; i < 5; i++) await dialog.getByRole("group").nth(i).getByRole("radio").first().check();
  await dialog.getByRole("button", { name: "Submit answers" }).click();
  await expect(dialog.getByText("You scored 6 / 30")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).last().click();

  await page.locator("aside").getByRole("button", { name: "My marks" }).click();
  await expect(page.getByRole("heading", { name: "Topic mastery" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Pendulum: 50%" })).toBeVisible();

  await page.locator("aside").getByRole("button", { name: "Practice" }).click();
  await expect(page.getByLabel("Chapter")).toHaveValue("-1");
  await expect(page.getByRole("option", { name: "My mistakes (4)" })).toBeAttached();

  await loginAs(page, "teacher");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: "Marks" }).click();
  await expect(page.getByRole("heading", { name: "Class mastery by topic" })).toBeVisible();
});
