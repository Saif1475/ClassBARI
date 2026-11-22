"use client";

import { AppShell } from "@/components/AppShell";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { WhenReady } from "@/lib/lms-store";
import { ChildProvider, ChildSwitcher } from "./child";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const c = t.common;
  return (
    <AppShell
      nav={[
        { href: "/parent", label: c.home, icon: "home" },
        { href: "/parent/results", label: c.results, icon: "exams" },
        { href: "/parent/payments", label: c.payments, icon: "fees" },
        { href: "/parent/notices", label: t.app.notices, icon: "megaphone" },
        { href: "/parent/messages", label: t.pmsg.messages, icon: "message" },
      ]}
    >
      <WhenReady>
        <ChildProvider>
          <div className="print:hidden">
            <ChildSwitcher />
          </div>
          {children}
        </ChildProvider>
      </WhenReady>
    </AppShell>
  );
}
