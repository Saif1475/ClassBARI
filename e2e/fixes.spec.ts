import { expect, loginAs, test } from "./helpers";

test("live poll reaches a student on another device; one vote per device", async ({ page, browser }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^Interactive Whiteboard/ }).first().click();
  await page.getByLabel("Question", { exact: true }).fill("Unit of frequency?");
  await page.getByLabel("Option A", { exact: true }).fill("Hertz");
  await page.getByLabel("Option B", { exact: true }).fill("Newton");
  await page.getByRole("button", { name: "Start poll" }).click();
  await expect(page.getByText("Poll started ✓")).toBeVisible();

  const phone = await browser.newContext(); // a different device: nothing shared with the teacher's browser
  const s = await phone.newPage();
  await phone.addCookies([{ name: "edunest-role", value: "student", url: "http://localhost:3100" }]);
  await s.goto("/student");
  const card = s.getByRole("region", { name: "Live class poll" });
  await expect(card).toContainText("Unit of frequency?");
  await card.getByRole("button", { name: /Hertz/ }).click();
  await expect(card.getByRole("button", { name: /Hertz/ })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Poll answers" })).toContainText("1 answers");
  await phone.close();
});

test("work in progress: AI helper is switched off; the plan shows a 250-student limit, no per-student price", async ({ page, request }) => {
  expect((await request.post("/api/ai/study", { data: { action: "ask", question: "hi", model: "gemini-flash" } })).status()).toBe(503);
  await loginAs(page, "student");
  await page.goto("/student");
  await expect(page.getByRole("button", { name: /Ask ClassBARI AI/ })).toBeVisible();
  await loginAs(page, "institute");
  await page.goto("/institute");
  await expect(page.getByText("Your plan includes up to 250 students.")).toBeVisible(); // no per-student price shown
  await expect(page.getByText(/৳15/)).toHaveCount(0);
});

test("leaving an anti-cheat test is counted once per switch and shown to the teacher", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: /Tests & exams/ }).click();
  await page.getByRole("button", { name: "New quiz" }).click();
  await page.getByLabel("Title").fill("Watched test");
  await page.getByRole("textbox", { name: /^Questions/ }).fill("Q1\n*a\nb");
  await page.getByLabel(/Anti-cheat/).check();
  await page.getByRole("button", { name: "Publish item" }).click();

  await loginAs(page, "student");
  await page.goto("/student");
  await page.getByRole("button", { name: "My class" }).first().click();
  await page.getByRole("button", { name: /Watched test/ }).first().click();
  await page.getByRole("button", { name: "Start" }).click();
  const leave = () => page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  for (let i = 0; i < 3; i++) await leave();
  await expect(page.getByRole("status")).toContainText("You left the test screen 3 times");

  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^Merit list/ }).click();
  await page.getByLabel("Test").selectOption({ label: "Watched test · HSC Physics · A" });
  await expect(page.locator("ol li", { hasText: "Nusrat Jahan" })).toContainText("left the test 3 times");
});

test("in a brand-new batch, New quiz and New written exam open the form straight away", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Fresh Teacher");
  await page.getByLabel(/^Institute or coaching/).fill("Fresh Coaching");
  await page.getByLabel("Mobile number").fill("01812345671");
  await page.getByLabel("First batch name").fill("Fresh Batch");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Course studio" }).first().click();
  await page.locator("aside").getByRole("button", { name: /Tests & exams/ }).click();
  for (const [btn, title] of [["New quiz", "First quiz"], ["New written exam", "First exam"]]) {
    await page.getByRole("button", { name: btn }).click();
    await page.getByLabel("Title").fill(title);
    if (btn === "New quiz") await page.getByRole("textbox", { name: /^Questions/ }).fill("Q1\n*a\nb");
    await page.getByRole("button", { name: "Publish item" }).click();
    await expect(page.getByText(title).first()).toBeVisible();
  }
});

test("sliding selection: the highlight glides to the chosen item and keeps its colour", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  const group = page.getByRole("group", { name: "Text size" });
  const pill = group.locator(".slide-pill");
  const bg = () => pill.evaluate((el) => getComputedStyle(el).backgroundColor);
  const gap = (i: number) => pill.evaluate((el, i) => el.getBoundingClientRect().x - el.parentElement!.querySelectorAll("button")[i].getBoundingClientRect().x, i);
  const colour = await bg();
  expect(colour).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await group.getByRole("button").nth(2).click();
  await expect.poll(() => gap(2).then(Math.abs)).toBeLessThan(1); // settled under the chosen button
  expect(await bg()).toBe(colour);
  await expect(group.getByRole("button").nth(2)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)"); // the pill paints it, no double highlight
});

test("infinite whiteboard: grows when you draw at the edge, pans with the Move tool, undo still lines up", async ({ page }) => {
  await loginAs(page, "institute");
  await page.goto("/institute");
  await page.getByRole("button", { name: "Tools" }).first().click();
  await page.getByRole("button", { name: /^Interactive Whiteboard/ }).click();
  const canvas = page.locator('[data-testid="board-view"] canvas');
  const size = () => canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  const ink = () => canvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  expect(await size()).toEqual([2400, 1600]);

  // Draw a line, then a stroke off the top-left corner: the board grows left/up and the first line moves with it.
  await page.getByTestId("board-view").evaluate((v) => v.scrollIntoView({ block: "end" }));
  const box = (await page.getByTestId("board-view").boundingBox())!; // the visible part; the board starts at its top-left
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 220, { steps: 8 });
  await page.mouse.up();
  const firstInk = await ink();
  expect(firstInk).toBeGreaterThan(50);
  await page.mouse.move(box.x + 200, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 30, { steps: 10 });
  await page.mouse.up();
  const [w, h] = await size();
  expect(w).toBeGreaterThan(2400);
  expect(h).toBeGreaterThan(1600);

  // Undo the edge stroke: exactly the first line is left (now shifted by the growth, not misplaced or lost).
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(ink).toBe(firstInk);

  // Move tool drags the view around.
  await page.getByRole("button", { name: "✋ Move" }).click();
  const view = page.getByTestId("board-view");
  await view.evaluate((v) => v.scrollIntoView({ block: "end" })); // clicking the button scrolled the page
  const before = await view.evaluate((v) => [v.scrollLeft, v.scrollTop]);
  const vb = (await view.boundingBox())!;
  await page.mouse.move(vb.x + 400, vb.y + 300);
  await page.mouse.down();
  await page.mouse.move(vb.x + 250, vb.y + 150, { steps: 5 }); // drag up-left = look further right/down
  await page.mouse.up();
  const after = await view.evaluate((v) => [v.scrollLeft, v.scrollTop]);
  expect(after[0]).toBeGreaterThan(before[0] + 100);
  expect(after[1]).toBeGreaterThan(before[1] + 100);
});

test("dark mode: the switch changes the look and is remembered", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim());
  expect(await bg()).toBe("#111314");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/); // no flash back to light
  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
