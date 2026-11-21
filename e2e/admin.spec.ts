import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";

const auth = { Authorization: "Bearer e2e-token" };

async function openAdmin(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Admin token").fill("e2e-token");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

test.describe("Staff admin panel", () => {
  test("a teacher who signs up appears under Institutes; plan and status change the income", async ({ page }) => {
    const name = `Admin Sir ${Date.now()}`;
    await page.goto("/signup");
    await page.getByLabel("Your name").fill(name);
    await page.getByLabel(/^Institute or coaching/).fill(name);
    await page.getByLabel("Mobile number").fill("01812345679");
    await page.getByLabel("First batch name").fill("SSC Maths · Z");
    const registered = page.waitForResponse((r) => r.url().endsWith("/api/platform/institutes"));
    await page.getByRole("button", { name: "Create account" }).click();
    expect((await registered).status()).toBe(200);

    await openAdmin(page);
    await page.getByRole("button", { name: "Plans" }).click();
    await page.getByLabel("pro price").fill("2500");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeHidden();

    await page.getByRole("button", { name: "Institutes" }).click();
    await page.getByLabel("Search institutes").fill(name);
    await expect(page.getByText("SSC Maths · Z")).toBeVisible();
    await expect(page.getByLabel(`Status of ${name}`)).toHaveValue("trial");
    await page.getByLabel(`Plan of ${name}`).selectOption("pro");
    await expect(page.getByLabel(`Plan of ${name}`)).toHaveValue("pro");
    await page.getByLabel(`Status of ${name}`).selectOption("active");
    await expect(page.getByLabel(`Status of ${name}`)).toHaveValue("active");
    await page.getByLabel(`Note for ${name}`).fill("Paid by bKash");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("button", { name: "Save note" })).toBeHidden();

    // Other tests may add institutes at the same time, so check this one's income share via the API.
    const data = await (await page.request.get("/api/platform/admin", { headers: auth })).json();
    const mine = data.institutes.find((i: { name: string }) => i.name === name);
    expect(mine).toMatchObject({ plan: "pro", status: "active", note: "Paid by bKash" });
    expect(data.overview.monthlyIncome).toBeGreaterThanOrEqual(2500);

    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByText(`${name}: status=active`)).toBeVisible();
  });

  test("a support request reaches the Support tab and can be solved", async ({ page }) => {
    const who = `Worried Parent ${Date.now()}`;
    await page.goto("/login");
    await page.getByRole("link", { name: "Help & support" }).click();
    await page.getByLabel("Your name").fill(who);
    await page.getByLabel("Phone number or email").fill("01911111111");
    await page.getByLabel("I am a…").selectOption("guardian");
    await page.getByLabel("What do you need help with?").fill("I paid the fee but it still shows due.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("We got your message")).toBeVisible();

    await openAdmin(page);
    await page.getByRole("button", { name: /^Support/ }).click();
    const ticket = page.locator("article").filter({ hasText: who });
    await expect(ticket).toContainText("I paid the fee but it still shows due.");
    await expect(ticket.getByRole("link", { name: "WhatsApp" })).toBeVisible();
    await ticket.getByRole("button", { name: "Mark solved" }).click();
    await expect(ticket.getByRole("button", { name: "Reopen" })).toBeVisible();
  });

  test("admin API refuses without the token and rejects bad changes", async ({ request }) => {
    expect((await request.get("/api/platform/admin")).status()).toBe(401);
    expect((await request.post("/api/platform/admin", { data: { type: "maintenance", on: true } })).status()).toBe(401);
    expect((await request.post("/api/platform/admin", { headers: auth, data: { type: "flag", key: "nope", on: false } })).status()).toBe(400);
    expect((await request.post("/api/support", { data: { name: "x", contact: "", message: "y" } })).status()).toBe(400);
    expect((await request.post("/api/sms", { data: { to: ["01711111111"], text: "hi" } })).status()).toBe(403); // teachers only
    const teacher = { Cookie: "edunest-role=teacher" };
    expect((await request.post("/api/sms", { headers: teacher, data: { to: ["123"], text: "hi" } })).status()).toBe(400);
    const pub = await (await request.get("/api/platform")).json();
    expect(Object.keys(pub).sort()).toEqual(["broadcast", "flags", "maintenance"]); // no institutes, tickets or SMS log leak
  });
});
