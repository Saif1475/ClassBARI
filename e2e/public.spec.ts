import { readFile } from "node:fs/promises";
import { alertText, BASE, expect, expectVideoPlays, test } from "./helpers";

test.describe("Landing page", () => {
  test("renders in English and switches to Bangla", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Run your education institute");
    await page.getByRole("button", { name: "বাং" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("আপনার শিক্ষা প্রতিষ্ঠান চালান");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  });

  test("placeholder testimonials are hidden", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("What teachers say")).toHaveCount(0);
  });

  test("enquiry form rejects a bad phone and saves a good one", async ({ page }) => {
    await page.goto("/#teachers");
    const form = page.locator("form").filter({ hasText: "Your name" });
    await form.getByLabel("Your name").fill("E2E Teacher");
    await form.getByLabel("Mobile number").fill("12345");
    await form.getByRole("button", { name: "Get a call back & free demo" }).click();
    await expect(form.getByRole("alert")).toContainText("valid Bangladeshi mobile");
    await form.getByLabel("Mobile number").fill("01712-345678");
    await form.getByRole("button", { name: "Get a call back & free demo" }).click();
    await expect(form.getByRole("button", { name: /We'll call you/ })).toBeVisible();
    const saved = await readFile("data/leads.jsonl", "utf8");
    expect(saved).toContain('"name":"E2E Teacher"');
  });

  test("footer pages and 404", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy policy");
    await expect(page.getByRole("heading", { name: "13. Deleting your account" })).toBeVisible(); // the app stores ask for this link
    await page.goto("/privacy#delete-account");
    await expect(page.locator("#delete-account")).toBeInViewport();
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("favicon, manifest and social image are served", async ({ request }) => {
    for (const [url, type] of [["/icon.svg", "image/svg+xml"], ["/manifest.webmanifest", "application/manifest+json"], ["/opengraph-image", "image/png"], ["/icon-512.png", "image/png"]]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect(res.headers()["content-type"], url).toContain(type);
    }
  });
});

test.describe("Login and access", () => {
  test("app pages redirect to login without a role", async ({ page }) => {
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login\?next=%2Fteacher/);
  });

  test("a student cannot open the teacher studio", async ({ page, context }) => {
    await context.addCookies([{ name: "edunest-role", value: "student", url: BASE }]);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/login/);
  });

  const phoneLogin = async (page: import("@playwright/test").Page, as: "Instructor" | "Institute", phone: string) => {
    await page.goto("/login");
    await page.getByRole("button", { name: as, exact: true }).click();
    await page.getByLabel("Mobile number").fill(phone);
    await page.getByRole("button", { name: "Send OTP" }).click();
  };
  const otp = async (page: import("@playwright/test").Page) => {
    await page.getByLabel("Enter the 6-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify & continue" }).click();
  };

  test("phone login: the number decides the panel", async ({ page }) => {
    await phoneLogin(page, "Instructor", "123");
    await expect(alertText(page)).toContainText("valid mobile number");
    await phoneLogin(page, "Instructor", "1712345678"); // valid, but not on any institute's staff list
    await expect(alertText(page)).toContainText("isn't registered");

    // An ordinary teacher's number may not open the institute view…
    await phoneLogin(page, "Institute", "01811000002");
    await expect(alertText(page)).toContainText("belongs to a teacher");
    // …and as an instructor sees only their own batch, without the owner's money or tools.
    await phoneLogin(page, "Instructor", "01811000002");
    await otp(page);
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByText("Hello, Rumana Ma'am")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SSC Higher Math" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "HSC Physics · A" })).toHaveCount(0);
    await expect(page.getByLabel("Viewing as")).toHaveCount(0);
    await page.getByRole("button", { name: "Tools" }).first().click();
    await expect(page.getByRole("button", { name: /^Expenses & profit/ })).toHaveCount(0);

    // The owner's number opens the whole institute.
    await phoneLogin(page, "Institute", "01711000001");
    await otp(page);
    await expect(page).toHaveURL(/\/institute$/);
    await expect(page.getByRole("heading", { name: "HSC Physics · A" }).first()).toBeVisible();
  });

  test("teacher sign-up creates the account and first batch", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Karim Sir");
    await page.getByLabel(/^Institute or coaching/).fill("Karim Coaching");
    await page.getByLabel("Mobile number").fill("01812345678");
    await page.getByLabel("First batch name").fill("HSC Chemistry · K");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByText("Hello, Karim Sir")).toBeVisible();
    await expect(page.getByRole("heading", { name: "HSC Chemistry · K" })).toBeVisible();
  });

  test("student invite link joins the batch", async ({ page }) => {
    await page.goto("/join/hsc-physics-a");
    await expect(page.getByRole("heading", { name: "Join HSC Physics · A" })).toBeVisible();
    await page.getByLabel("Student full name *").fill("Joined Student");
    await page.getByLabel("Student Gmail *").fill("joined.student@gmail.com");
    await page.getByLabel("Guardian name *").fill("Joined Parent");
    await page.getByLabel("Guardian Gmail *").fill("joined.parent@gmail.com");
    await page.getByLabel("Guardian mobile *").fill("01912345678");
    await page.getByRole("button", { name: "Join batch" }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { name: "Hi Joined! 👋" })).toBeVisible();
  });
});

test.describe("Public course page", () => {
  test("lists courses, plays the free preview, enrols", async ({ page }) => {
    await page.goto("/courses");
    await page.getByRole("link", { name: /HSC Physics · A/ }).click();
    await expect(page.getByRole("heading", { name: "HSC Physics · A" })).toBeVisible();
    await expect(page.getByText("Chapter 4 · Simple Harmonic Motion")).toBeVisible();
    await page.getByRole("button", { name: /Lecture 1: Definitions/ }).click();
    await expectVideoPlays(page);
    await page.getByLabel("Student full name *").fill("Public Enrol");
    await page.getByLabel("Student Gmail *").fill("public.enrol@gmail.com");
    await page.getByLabel("Guardian name *").fill("Public Parent");
    await page.getByLabel("Guardian Gmail *").fill("public.parent@gmail.com");
    await page.getByLabel("Guardian mobile *").fill("01912345678");
    await page.getByRole("button", { name: "Enrol" }).click();
    await expect(page.getByText(/First month's fee/)).toBeVisible();
    await page.getByRole("button", { name: "Pay later" }).click();
    await expect(page).toHaveURL(/\/student$/);
  });
});

test.describe("Admin", () => {
  test("needs the token, then lists enquiries", async ({ page, request }) => {
    const name = `Admin Check ${Date.now()}`; // unique: the lead file is shared between runs
    await request.post("/api/leads", { data: { name, phone: "01711111111", size: "Up to 50" } });
    await page.goto("/admin");
    await page.getByLabel("Admin token").fill("wrong");
    await page.getByRole("button", { name: "Open" }).click();
    await expect(alertText(page)).toContainText("Wrong token");
    await page.getByLabel("Admin token").fill("e2e-token");
    await page.getByRole("button", { name: "Open" }).click();
    await page.getByRole("button", { name: /^Enquiries/ }).click();
    await expect(page.getByText(name)).toBeVisible();
    await page.getByLabel(`Status of ${name}`).selectOption("called");
    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByText(`: called`).first()).toBeVisible();
  });

  test("leads API validates input", async ({ request }) => {
    expect((await request.post("/api/leads", { data: { name: "", phone: "01711111111", size: "x" } })).status()).toBe(400);
    expect((await request.post("/api/leads", { data: { name: "A", phone: "999", size: "x" } })).status()).toBe(400);
    expect((await request.get("/api/leads")).status()).toBe(401);
  });
});

test.describe("Sample files", () => {
  test("video and PDFs are served correctly, with seeking", async ({ request }) => {
    const v = await request.get("/samples/lecture-shm.mp4", { headers: { Range: "bytes=0-99" } });
    expect(v.status()).toBe(206);
    expect(v.headers()["content-type"]).toBe("video/mp4");
    for (const f of ["shm-formula-sheet.pdf", "waves-notes-scanned.pdf"]) {
      const r = await request.get(`/samples/${f}`);
      expect(r.status()).toBe(200);
      expect(r.headers()["content-type"]).toBe("application/pdf");
    }
  });
});
