import { rm } from "node:fs/promises";
import { PLATFORM_FILE } from "../playwright.config";

/** Start every run with an empty admin data file (fresh banner, all features on). */
export default async function globalSetup() {
  await rm(PLATFORM_FILE, { force: true });
}
