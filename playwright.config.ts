import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import webpush from "web-push";

// End-to-end tests: `npm run test:e2e` builds the site, starts it (port 3100) and the
// handwriting OCR service (port 8000), then drives a real Chromium.
const PORT = 3100;
export const BASE = `http://localhost:${PORT}`;
const vapid = webpush.generateVAPIDKeys(); // throwaway keys so the push API is switched on in tests
export const PLATFORM_FILE = path.resolve("data/e2e-platform.json"); // tests never touch the real data/platform.json

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 4,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "e2e-results",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Fake camera that shows student 1's attendance QR code, for the QR scanning test.
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${path.resolve("e2e/fixtures/qr-student1.y4m")}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
    permissions: ["camera", "clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec|switches\.spec/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
    // Switches features off for the whole site, so it runs after everything else.
    { name: "switches", use: { ...devices["Desktop Chrome"] }, testMatch: /switches\.spec/, dependencies: ["desktop", "phone"] },
  ],
  webServer: [
    { command: `npx next start -p ${PORT}`, url: BASE, env: { NEXT_PUBLIC_AUTH_MODE: "demo", NEXT_DIST_DIR: ".next-demo", RATE_LIMIT_OFF: "1", ADMIN_TOKEN: "e2e-token", PLATFORM_FILE: PLATFORM_FILE, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey }, reuseExistingServer: false, timeout: 60_000 },
    { command: "npm run ocr", url: "http://127.0.0.1:8000/health", reuseExistingServer: true, timeout: 240_000 },
  ],
});
