"use client";

import { Logo, LangSwitch } from "./Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";

export function LegalPage({ which }: { which: "privacy" | "terms" }) {
  const { t } = useLang();
  const L = t.legal;
  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Logo />
        <LangSwitch compact />
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 pb-16">
        <h1 className="text-4xl font-bold">{which === "privacy" ? L.privacyTitle : L.termsTitle}</h1>
        <p className="text-sm text-on-surface-variant">{L.updated}</p>
        {/* shortcut: placeholder legal text; replace with a lawyer-reviewed version before launch. */}
        <p className="rounded-xl bg-tertiary-container px-4 py-3 text-sm font-semibold text-on-tertiary-container">{L.draftNote}</p>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-lg leading-relaxed">
          {L[which].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </main>
    </div>
  );
}
