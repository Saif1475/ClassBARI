"use client";

import { useLang } from "@/lib/i18n/LanguageProvider";

/** The mark shown while a screen or its data is on its way. It only appears if the wait passes half a second. */
export function Loading({ full = false }: { full?: boolean }) {
  const { t } = useLang();
  return (
    <div role="progressbar" aria-label={t.common.loading} className={`wait-in grid place-items-center ${full ? "min-h-dvh" : "py-16"}`}>
      <span className="size-8 animate-spin rounded-full border-[3px] border-outline-variant border-t-primary" />
    </div>
  );
}
