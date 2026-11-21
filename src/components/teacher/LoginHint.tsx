"use client";

import { useEffect, useState } from "react";
import { REAL_AUTH } from "@/lib/auth-mode";
import { useLang } from "@/lib/i18n/LanguageProvider";

/** Real accounts: tells the owner how the people they just added get in (institute name and code). */
export function LoginHint({ who }: { who: "students" | "teachers" }) {
  const { t } = useLang();
  const [card, setCard] = useState<{ name: string; code: string } | null>(null);
  useEffect(() => {
    if (REAL_AUTH) fetch("/api/institutes?mine=1").then((r) => (r.ok ? r.json() : null)).then(setCard).catch(() => {});
  }, []);
  if (!card) return null;
  return <p className="rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">ℹ️ {who === "students" ? t.auth.howStudentsLogin(card.name, card.code) : t.auth.howTeachersLogin(card.name, card.code)}</p>;
}
