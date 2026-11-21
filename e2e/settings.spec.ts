import { readFile } from "node:fs/promises";
import { expect, loginAs, test } from "./helpers";

test("institute settings: rename teacher, institute name on ID cards, backup and restore", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("link", { name: "Settings and profile" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Your plan includes up to 250 students.")).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("Tanvir Ahmed");
  await page.getByLabel("Institute name").fill("Bright Future Coaching");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible();

  // The new name follows the teacher everywhere (batches, greeting) and the institute name is printed.
  await page.goto("/institute");
  await expect(page.getByText("Hello, Tanvir Ahmed")).toBeVisible();
  await page.goto("/teacher/print?kind=idcards&batch=HSC%20Physics%20%C2%B7%20A");
  await expect(page.getByText("Bright Future Coaching").first()).toBeVisible();

  // Backup → reset → restore brings the data back.
  await page.goto("/settings");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download backup/ }).click()]);
  const backupPath = await dl.path();
  expect(JSON.parse(await readFile(backupPath, "utf8")).app).toBe("ClassBARI");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByLabel("Restore from backup").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByText("That file isn't a ClassBARI backup.")).toBeVisible();
  await page.getByLabel("Restore from backup").setInputFiles(backupPath);
  await expect(page.getByText("Backup restored ✓")).toBeVisible();
  await page.goto("/institute");
  await expect(page.getByText("Hello, Tanvir Ahmed")).toBeVisible();
});

test("student settings: own details read-only, theme choice, log out", async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("link", { name: "Settings and profile" }).first().click();
  await expect(page.getByText("nusrat.jahan@gmail.com")).toBeVisible();
  await expect(page.getByText("To change these, ask your institute.")).toBeVisible();
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: /Same as phone/ }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/); // the test browser is set to light
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login/); // really logged out
});

test("guardian settings list the children", async ({ page }) => {
  await loginAs(page, "parent");
  await page.goto("/parent");
  await page.getByRole("link", { name: /Settings/ }).click();
  await expect(page.getByText(/Nusrat Jahan · HSC Physics · A/)).toBeVisible();
  await expect(page.getByText(/Ayaan Jahan ·/)).toBeVisible();
});

test("settings need a login", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
});
