"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import type { Flags, publicView } from "@/lib/platform";

type View = ReturnType<typeof publicView>;
let cached: Promise<View | null> | null = null;

/** Banner, maintenance and feature switches set in the admin panel. null while loading or offline (= all on). */
export function usePlatform() {
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/platform").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cached.then(setV);
  }, []);
  return v;
}

/** false only once the admin has switched the feature off. */
export function useFlag(flag: keyof Flags) {
  return usePlatform()?.flags[flag] ?? true;
}

export function PlatformBanner() {
  const v = usePlatform();
  const { t, lang } = useLang();
  if (!v) return null;
  const text = v.broadcast.on ? (lang === "bn" && v.broadcast.bn) || v.broadcast.en : "";
  if (!text && !v.maintenance) return null;
  const warn = v.maintenance || v.broadcast.level === "warning";
  return (
    <div role="status" className={`px-4 py-2 text-center text-sm font-semibold ${warn ? "bg-[#fff3cd] text-[#664d03]" : "bg-primary-container text-on-primary-container"}`}>
      {v.maintenance && <p>{t.platform.maintenance}</p>}
      {text && <p>{text}</p>}
    </div>
  );
}

/** Whole-page guard: shows a short notice instead of the page when the feature is switched off. */
export function FeatureOff({ flag, children }: { flag: keyof Flags; children: React.ReactNode }) {
  const { t } = useLang();
  if (useFlag(flag)) return children;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-xl font-bold">{t.platform.off}</p>
      <Link href="/" className="rounded-full bg-primary px-6 py-3 font-bold text-on-primary">{t.platform.home}</Link>
    </div>
  );
}
