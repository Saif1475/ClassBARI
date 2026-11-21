"use client";
import { REAL_AUTH } from "../auth-mode";

/**
 * Supabase in the browser, fetched when first needed. Dashboards use it only to sign out and to upload a file,
 * so it no longer has to arrive before the first screen can show (the login pages still load it straight away).
 */
export const supabaseLater = () => import("./client").then((m) => m.supabaseBrowser());

// Fetched quietly a few seconds after the page has started, so it is already there when asked for: also without
// a connection, or after the site has been updated while this tab stayed open.
if (REAL_AUTH && typeof window !== "undefined") setTimeout(() => void import("./client").catch(() => {}), 5000);
