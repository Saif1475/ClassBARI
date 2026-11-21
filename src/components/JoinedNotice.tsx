"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n/LanguageProvider";

/** After joining with real accounts: their Gmail is now on the class list, so Google sign-in lets them in. */
export function JoinedNotice({ email }: { email: string }) {
  const { t } = useLang();
  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="font-bold text-primary">✓ {t.join.joined(email)}</p>
      <Link href="/login" className="flex h-12 items-center justify-center rounded-full bg-primary font-bold text-on-primary">{t.join.logIn}</Link>
    </div>
  );
}
