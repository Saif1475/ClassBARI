import { expect, test } from "./helpers";

// Changes the whole site, so this project runs after all the others (see playwright.config.ts).
const auth = { Authorization: "Bearer e2e-token" };
test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  for (const key of ["liveGame", "handwriting", "publicCourses", "signups", "sms"]) await request.post("/api/platform/admin", { headers: auth, data: { type: "flag", key, on: true } });
  await request.post("/api/platform/admin", { headers: auth, data: { type: "broadcast", on: false, level: "info", en: "", bn: "" } });
  await request.post("/api/platform/admin", { headers: auth, data: { type: "maintenance", on: false } });
});

async function openAdmin(page: import("@playwright/test").Page, tab: string) {
  await page.goto("/admin");
  await page.getByLabel("Admin token").fill("e2e-token");
  await page.getByRole("button", { name: "Open" }).click();
  await page.getByRole("button", { name: tab }).click();
}

test("banner and maintenance notice show on every page, in the visitor's language", async ({ page }) => {
  await openAdmin(page, "Announcements");
  await page.getByLabel("English", { exact: true }).fill("Exam week: classes move to 7 PM");
  await page.getByLabel(/^Bangla/).fill("পরীক্ষার সপ্তাহ: ক্লাস সন্ধ্যা ৭টায়");
  await page.getByRole("button", { name: "Show banner" }).click();
  await page.getByRole("button", { name: "Turn on maintenance notice" }).click();
  await expect(page.getByText("Maintenance ON")).toBeVisible();

  await page.goto("/");
  const banner = page.getByRole("status").filter({ hasText: "Exam week" });
  await expect(banner).toContainText("under maintenance");
  await page.getByRole("button", { name: "বাং" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "পরীক্ষার সপ্তাহ" })).toContainText("রক্ষণাবেক্ষণ");
});

test("switched-off features disappear and the server refuses them", async ({ page, request }) => {
  await openAdmin(page, "Features");
  for (const name of ["Live quiz game", "Handwriting reader", "Public course pages", "New teacher sign-ups", "SMS to guardians"]) {
    const sw = page.locator("label").filter({ hasText: name }).getByRole("switch");
    await sw.click(); // flips once the server has saved it
    await expect(sw).not.toBeChecked();
  }

  await page.goto("/play");
  await expect(page.getByText("This feature is switched off")).toBeVisible();
  await page.goto("/courses");
  await expect(page.getByText("This feature is switched off")).toBeVisible();
  await page.goto("/signup");
  await expect(page.getByText("New sign-ups are paused")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Help & support" })).toBeVisible();
  await expect(page.locator('a[href="/signup"]')).toHaveCount(0);

  expect((await request.post("/api/live", { data: { action: "create", title: "x", questions: [{ q: "1+1", options: ["1", "2"], answer: 1 }] } })).status()).toBe(403);
  expect((await request.post("/api/handwriting", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } })).status()).toBe(403);
  expect((await request.post("/api/sms", { headers: { Cookie: "edunest-role=teacher" }, data: { to: ["01711111111"], text: "hi" } })).status()).toBe(403);
  expect((await request.post("/api/platform/institutes", { data: { name: "Late", owner: "Late", phone: "01711111111" } })).status()).toBe(403);
});
