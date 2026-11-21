"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Logo, LangSwitch } from "./Brand";

export type NavItem = { href: string; label: string; icon: string };

/**
 * App layout for signed-in screens.
 * Phones: content + bottom navigation bar (Material 3 nav bar with pill indicator).
 * Tablets/desktop: navigation rail on the left.
 */
export function AppShell({ nav, children }: { nav: NavItem[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === nav[0].href ? pathname === href : pathname.startsWith(href));
  const aria = (href: string) => (isActive(href) ? ("page" as const) : undefined);

  return (
    <div className="flex min-h-dvh bg-surface">
      {/* Rail (md and up) */}
      <aside className="sticky top-0 hidden print:!hidden h-dvh w-24 shrink-0 flex-col items-center gap-6 border-r border-white/70 bg-surface-container py-5 backdrop-blur-2xl md:flex">
        <Logo href="/" name="hide" />
        <nav data-slide className="flex flex-col items-center gap-3" aria-label="Primary">
          {nav.map((n) => (
            <Link key={n.href + n.label} href={n.href} aria-current={aria(n.href)} className="flex flex-col items-center gap-1 text-xs font-semibold text-on-surface-variant">
              <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-all ${isActive(n.href) ? "bg-primary-container text-on-primary-container shadow-sm" : ""}`}>
                <Icon name={n.icon} />
              </span>
              <span className={isActive(n.href) ? "font-bold text-on-surface" : ""}>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <LangSwitch compact />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl flex-1 pb-28 md:pb-10">{children}</div>
      </div>

      {/* Bottom nav (phones) */}
      <nav data-slide aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 flex print:hidden h-20 items-center justify-around border-t border-white/70 bg-surface-container px-2 backdrop-blur-2xl md:hidden">
        {nav.map((n) => (
          <Link key={n.href + n.label} href={n.href} aria-current={aria(n.href)} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-xs font-semibold text-on-surface-variant">
            <span className={`flex h-8 w-16 max-w-full items-center justify-center rounded-full transition-all ${isActive(n.href) ? "bg-primary-container text-on-primary-container shadow-sm" : ""}`}>
              <Icon name={n.icon} />
            </span>
            <span className={`max-w-full truncate ${isActive(n.href) ? "font-bold text-on-surface" : ""}`}>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
