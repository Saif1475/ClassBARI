"use client";
import { useEffect, useState } from "react";
import { APPS, appFrom, type AppId } from "./apps";

const KEY = "classbari-app"; // remembered for this app's tab, so ?app= survives logging out on localhost

/** The Android app this screen runs in (null on the main website, where every role can log in). */
export function currentApp(): AppId | null {
  const found = appFrom(location.hostname, location.search);
  if (found) sessionStorage.setItem(KEY, found);
  const kept = sessionStorage.getItem(KEY) as AppId | null;
  return found ?? (kept && kept in APPS ? kept : null);
}

export function useAppLock() {
  const [app, setApp] = useState<AppId | null>(null);
  useEffect(() => setApp(currentApp()), []);
  return app;
}
