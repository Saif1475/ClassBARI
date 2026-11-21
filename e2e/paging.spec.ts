import { expect, loginAs, test } from "./helpers";

// The sample institute has 9 students; this adds 36 more (45 in all) before the page loads, so the lists need pages.
const manyStudents = () => {
  const extra = Array.from({ length: 36 }, (_, i) => ({
    id: 100 + i, name: `Paged Student ${String(i + 1).padStart(2, "0")}`, email: `paged${i}@gmail.com`, guardianName: "Guardian", guardianEmail: `g${i}@gmail.com`,
    phone: "01711-000000", mode: "offline", batch: "HSC Physics · A", feeDue: 0, ch4Score: 20, ch3Score: 20,
  }));
  return extra;
};

test("student lists: choose 10 / 20 / 50 / 100 a page and move through numbered pages", async ({ page }) => {
  await loginAs(page, "institute");
  // The demo keeps its data in the browser: add the extra students to what the app saved, then load again.
  await page.goto("/institute");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("edunest-lms-state-v8"))).toBeTruthy();
  await page.evaluate((more) => {
    const saved = JSON.parse(localStorage.getItem("edunest-lms-state-v8")!);
    localStorage.setItem("edunest-lms-state-v8", JSON.stringify({ ...saved, students: [...saved.students, ...more] }));
  }, manyStudents());
  await page.reload();
  await page.getByRole("button", { name: "Students" }).first().click();
  await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();

  const directory = page.locator("section", { hasText: "All students" }).last();
  const rows = directory.locator("ul > li");
  const pager = directory.getByRole("navigation", { name: "Pages" });
  await expect(rows).toHaveCount(20); // 20 a page to begin with
  await expect(pager).toContainText("1–20 of 45");
  await expect(pager.getByRole("button", { name: "Page 3" })).toBeVisible();
  await expect(pager.getByRole("button", { name: "Previous page" })).toBeDisabled();

  await pager.getByRole("button", { name: "Page 3" }).click();
  await expect(rows).toHaveCount(5);
  await expect(pager).toContainText("41–45 of 45");
  await expect(pager.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
  await expect(pager.getByRole("button", { name: "Next page" })).toBeDisabled();

  await pager.getByLabel("Rows per page").selectOption("10");
  await expect(rows).toHaveCount(5); // still looking at the same students: now page 5 of 5
  await expect(pager).toContainText("41–45 of 45");
  await pager.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(rows).toHaveCount(10);

  await pager.getByLabel("Rows per page").selectOption("100");
  await expect(rows).toHaveCount(45); // everyone on one page
  await pager.getByLabel("Rows per page").selectOption("10");
  await pager.getByRole("button", { name: "Page 4" }).click();
  await expect(pager).toContainText("31–40 of 45");
  // A search starts again at the first page; a short result needs no pages at all.
  await directory.getByLabel(/Search/).fill("Paged Student 3");
  await expect(rows).toHaveCount(7);
  await expect(pager).toHaveCount(0);
  // The choice of 10 a page is remembered.
  await directory.getByLabel(/Search/).fill("");
  await page.reload();
  await page.getByRole("button", { name: "Students" }).first().click();
  await expect(page.locator("section", { hasText: "All students" }).last().locator("ul > li")).toHaveCount(10);
});
