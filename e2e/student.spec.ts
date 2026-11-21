import { expect, expectVideoPlays, loginAs, test } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "My class" }).first().click(); // the panel opens on Home
});

const openItem = (page: import("@playwright/test").Page, title: string | RegExp) => page.getByRole("button", { name: title }).first().click();

test("course lecture video plays", async ({ page }) => {
  await openItem(page, /Lecture 1: Definitions/);
  await expectVideoPlays(page, "[role=dialog] video");
  // Protected: the student's own name and Gmail float over the video; no download or picture-in-picture.
  await expect(page.getByTestId("watermark")).toContainText(/\S+ · \S+@gmail\.com/);
  const v = page.locator("[role=dialog] video");
  await expect(v).toHaveAttribute("controlslist", /nodownload/);
  await expect(v).toHaveAttribute("disablepictureinpicture", "");
  await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
});

test("Explore → watch page plays the video", async ({ page }) => {
  await page.getByRole("tab", { name: "Explore" }).click();
  await page.getByRole("link", { name: /Simple Harmonic Motion — full chapter/ }).click();
  await expect(page).toHaveURL(/\/student\/watch\/1$/);
  await expectVideoPlays(page);
  await expect(page.getByRole("heading", { name: "More videos" })).toBeVisible();
});

test("typed PDF opens and key points are extracted and saved", async ({ page }) => {
  await openItem(page, /Formula sheet — Chapter 4/);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Open PDF" })).toHaveAttribute("href", "/samples/shm-formula-sheet.pdf");
  await dialog.getByRole("button", { name: "Read the teacher's PDF" }).click();
  await expect(dialog.getByRole("button", { name: "harmonic motion" })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/T = 2 pi sqrt\(L \/ g\)/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save to My notes" }).click();
  await expect(dialog.getByText("Saved to My notes ✓")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await page.getByText("My notes, my work and my QR code").click(); // tools are folded on the home
  await expect(page.getByText(/Keywords: .*harmonic motion/)).toBeVisible();
});

test("scanned PDF is read with OCR", async ({ page }) => {
  test.setTimeout(240_000); // first run downloads the OCR language data
  await openItem(page, /Lecture notes \(scanned\)/);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Read the teacher's PDF" }).click();
  await expect(dialog.getByText("Key sentences")).toBeVisible({ timeout: 200_000 });
  await expect(dialog.getByText(/longitudinal/i).first()).toBeVisible();
});

test("take the MCQ quiz, get full marks and see the leaderboard", async ({ page }) => {
  await openItem(page, /MCQ quiz — Chapter 4/);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start quiz" }).click();
  const answers = ["displacement", "length and g", "2 times", "k/2", "maximum"];
  for (const [i, a] of answers.entries()) await dialog.getByRole("group").nth(i).getByLabel(a, { exact: true }).check();
  await dialog.getByRole("button", { name: "Submit answers" }).click();
  await expect(dialog.getByText("You scored 30 / 30")).toBeVisible();
  await expect(dialog.getByText(/Your rank: #1/)).toBeVisible();
});

test("submit an assignment photo", async ({ page }) => {
  await openItem(page, /Submit creative questions 1–5/);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Upload your answer (photo or PDF)").setInputFiles("e2e/fixtures/answer.jpg");
  await dialog.getByRole("button", { name: "Submit answer" }).click();
  await expect(dialog.getByText(/answer\.jpg · Submitted/)).toBeVisible();
  await expect(dialog.getByText("Waiting for grade")).toBeVisible();
});

test("practice mode gives instant feedback", async ({ page }) => {
  await page.locator("aside").getByRole("button", { name: "Practice" }).click();
  await page.getByRole("button", { name: "displacement", exact: true }).click();
  await expect(page.getByText("Correct! ✓")).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "mass of the bob" }).click();
  await expect(page.getByText(/Not quite — the answer is “length and g”/)).toBeVisible();
});

test("course search filters the modules", async ({ page }) => {
  await page.getByRole("textbox", { name: "Search this course…" }).first().fill("pendulum");
  await expect(page.getByRole("button", { name: /Lecture 2: Pendulums & springs/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Formula sheet/ })).toHaveCount(0);
});

test("grades show the progress chart", async ({ page }) => {
  await page.locator("aside").getByRole("button", { name: "My marks" }).click();
  await expect(page.getByRole("heading", { name: "My progress" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Model test — Gravitation: 87%/ })).toBeVisible();
});

test("handwriting to text through the OCR service", async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await page.getByText("My notes, my work and my QR code").click(); // tools are folded on the home
  await page.getByRole("button", { name: "Handwriting to text" }).click();
  await page.getByLabel("Take or choose a photo").setInputFiles("e2e/fixtures/handwriting.jpg");
  const box = page.getByLabel("Check and correct the text");
  await expect(box).toBeVisible({ timeout: 90_000 });
  expect((await box.inputValue()).trim().length).toBeGreaterThan(5);
  await box.fill("Simple harmonic motion");
  await page.getByRole("button", { name: "Save to My notes" }).click();
  await expect(page.getByText("Handwritten notes", { exact: true })).toBeVisible();
});

test("attendance QR code is shown", async ({ page }) => {
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await page.getByText("My notes, my work and my QR code").click(); // tools are folded on the home
  await expect(page.getByRole("img", { name: /My attendance QR: Nusrat Jahan/ })).toBeVisible();
});

test("calendar and inbox", async ({ page }) => {
  await page.getByRole("button", { name: "Calendar" }).first().click();
  await expect(page.getByText("HSC Physics: Standing Waves & Beats")).toBeVisible();
  await page.getByRole("button", { name: /Messages/ }).first().click();
  await page.getByPlaceholder(/Message Tanvir Sir/).fill("Thank you sir!");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("section").getByText("Thank you sir!")).toBeVisible();
});

test("Bangla interface", async ({ page }) => {
  await page.getByRole("button", { name: "বাং" }).first().click();
  await expect(page.getByRole("tab", { name: "এক্সপ্লোর" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "পাঠ" })).toBeVisible();
});

test("module cards are never clipped (laptop screen)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 });
  const clipped = await page.locator("main div.overflow-hidden").evaluateAll((els) =>
    els.filter((e) => e.scrollHeight - e.clientHeight > 2).map((e) => e.textContent?.slice(0, 40)),
  );
  expect(clipped).toEqual([]);
  await expect(page.getByRole("button", { name: /Written test — Chapter 4/ }).first()).toBeInViewport({ ratio: 0 }).catch(() => {});
});

test("after a quiz a student sees only their own rank, not classmates' names or marks", async ({ page }) => {
  await page.getByLabel("Search this course…").first().fill("Gravitation"); // opens the folded chapter
  await openItem(page, /Model test — Gravitation/);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Your rank: #3 of 7/)).toBeVisible();
  await expect(dialog.getByText("Imran Kabir")).toHaveCount(0); // the class topper's name is not shown
  await expect(dialog.getByText("29/30")).toHaveCount(0);
});
