import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export const BASE = "http://localhost:3100";

/**
 * Every test: accept confirm() dialogs, and fail if the page throws an uncaught error
 * or React logs a hydration/runtime error to the console.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("dialog", (d) => d.accept());
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        // Network failures are tested explicitly; everything else logged as an error is a bug.
        // tesseract.js prints harmless "Parameter not found" tuning warnings as console errors.
        if (m.type() === "error" && !/Failed to load resource|Parameter not found/.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      expect(errors, "no uncaught errors or console errors").toEqual([]);
    },
    { auto: true },
  ],
});

/** The visible error message (Next.js also keeps an empty route-announcer with role="alert"). */
export const alertText = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });

export async function loginAs(page: Page, role: "teacher" | "institute" | "student" | "parent") {
  await page.context().addCookies([{ name: "edunest-role", value: role, url: BASE }]);
}

/** Wait until a <video> really plays: metadata loaded and the clock moving. */
export async function expectVideoPlays(page: Page, selector = "video") {
  const video = page.locator(selector).first();
  await expect(video).toBeVisible();
  const state = await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    await new Promise((r) => setTimeout(r, 1500));
    return { readyState: v.readyState, time: v.currentTime, duration: v.duration, error: v.error?.code ?? null, w: v.videoWidth };
  });
  expect(state.error).toBeNull();
  expect(state.readyState).toBeGreaterThanOrEqual(2);
  expect(state.time).toBeGreaterThan(0.3);
  expect(state.w).toBeGreaterThan(0);
  return state;
}
