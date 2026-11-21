import { defineConfig } from "@playwright/test";

// Browser tests with REAL accounts: the four test accounts from `npm run test:accounts`, on the running real site.
//   npm run test:real-ui            (the site must be running: npm run build && npm run start)
export default defineConfig({
  testDir: "e2e-real",
  timeout: 90_000,
  workers: 1, // one after another: they share the test institute
  retries: 0,
  reporter: [["line"]],
  outputDir: "e2e-results/real",
  use: { baseURL: process.env.SITE || "http://localhost:3000", viewport: { width: 1280, height: 860 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
