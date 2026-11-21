import { expect, loginAs, test } from "./helpers";

test("pages already opened still load offline (service worker)", async ({ page, context }) => {
  await loginAs(page, "student");
  await page.goto("/student");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker, which caches the page and its files
  await expect(page.getByRole("tab", { name: "My courses" })).toBeVisible();
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("tab", { name: "My courses" })).toBeVisible();
  await context.setOffline(false);
});
