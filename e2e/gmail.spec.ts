import { alertText, expect, loginAs, test } from "./helpers";

const signIn = async (page: import("@playwright/test").Page, role: "Student" | "Parent", gmail: string) => {
  await page.goto("/login");
  await page.getByRole("button", { name: role }).click();
  await page.getByLabel("Your Gmail").fill(gmail);
  await page.getByRole("button", { name: "Continue with Google" }).click();
};

test("a registered student Gmail opens that student's own panel", async ({ page }) => {
  await signIn(page, "Student", "Riya.Saha@gmail.com");
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole("heading", { name: "Hi Riya! 👋" })).toBeVisible();
});

test("an unregistered Gmail is refused", async ({ page }) => {
  await signIn(page, "Student", "stranger@gmail.com");
  await expect(alertText(page)).toContainText("isn't registered");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Your Gmail").fill("someone@yahoo.com");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(alertText(page)).toContainText("Enter a Gmail address");
});

test("a guardian Gmail opens the parent panel with all their children", async ({ page }) => {
  await signIn(page, "Parent", "kamal.jahan@gmail.com");
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByRole("button", { name: "Nusrat Jahan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ayaan Jahan" })).toBeVisible();
});

test("a guardian with one child sees only that child", async ({ page }) => {
  await signIn(page, "Parent", "gopal.saha@gmail.com");
  await expect(page.locator("header").getByText("Riya Saha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nusrat Jahan" })).toHaveCount(0);
});

test("a newly enrolled student can sign in with their Gmail", async ({ page }) => {
  await loginAs(page, "institute"); // only the institute enrols students
  await page.goto("/institute");
  await page.getByRole("button", { name: "Students" }).first().click();
  const form = page.locator("section", { hasText: "Enrol a new student" });
  await form.getByLabel("Student full name *").fill("Fresh Student");
  await form.getByLabel("Student Gmail *").fill("fresh.student@gmail.com");
  await form.getByLabel("Guardian name *").fill("Fresh Parent");
  await form.getByLabel("Male or female").selectOption("female");
  await form.getByLabel("Guardian Gmail *").fill("fresh.parent@gmail.com");
  await form.getByLabel("Guardian mobile *").fill("01811111111");
  await form.getByRole("button", { name: "Enrol student" }).click();
  await expect(page.getByText(/Fresh Student enrolled/)).toBeVisible();

  await signIn(page, "Student", "fresh.student@gmail.com");
  await expect(page.getByRole("heading", { name: "Hi Fresh! 👋" })).toBeVisible();
  await signIn(page, "Parent", "fresh.parent@gmail.com");
  await expect(page.locator("header").getByText("Fresh Student")).toBeVisible();
});
