"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";

export type BarItem = { id: string; icon: string; label: string; badge?: number; on: boolean; go: () => void };
const SHOWN = 4; // tabs that fit a phone comfortably; the rest go under "More"

/** Phone tab bar: up to five tabs; with more, the first four and a "More" button that opens the rest above it. */
export function BottomBar({ items, label }: { items: BarItem[]; label: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const split = items.length > SHOWN + 1;
  const main = split ? items.slice(0, SHOWN) : items;
  const rest = split ? items.slice(SHOWN) : [];
  const restOn = rest.some((i) => i.on);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", away), document.removeEventListener("keydown", esc));
  }, [open]);

  const tab = (item: { id: string; icon: string; label: string; badge?: number; on: boolean }, onClick: () => void, extra = {}) => (
    <button key={item.id} type="button" onClick={onClick} aria-current={item.on ? "page" : undefined} {...extra} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[11px] font-semibold text-on-surface-variant">
      <span className={`relative flex h-8 w-14 max-w-full items-center justify-center rounded-full ${item.on ? "bg-primary-container text-on-primary-container" : ""}`}>
        <Icon name={item.icon} size={20} />
        {!!item.badge && <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-tertiary-container px-1 text-[10px] font-extrabold text-on-tertiary-container">{item.badge}</span>}
      </span>
      <span className={`max-w-full truncate ${item.on ? "font-bold text-on-surface" : ""}`}>{item.label}</span>
    </button>
  );

  return (
    <div ref={box} className="fixed inset-x-0 bottom-0 z-20 md:hidden print:hidden">
      {open && (
        <ul role="menu" aria-label={t.common.more} className="picker-drop absolute bottom-full right-2 mb-2 flex w-56 flex-col gap-1 rounded-[14px] border border-outline-variant p-2 shadow-[0_18px_50px_rgba(0,32,28,0.22)]">
          {rest.map((i) => (
            <li key={i.id} role="none">
              <button type="button" role="menuitem" aria-current={i.on ? "page" : undefined} onClick={() => (setOpen(false), i.go())} className={`flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-sm font-semibold ${i.on ? "bg-primary-container text-on-primary-container" : "hover:bg-surface-container"}`}>
                <Icon name={i.icon} size={20} />
                <span className="min-w-0 flex-1 truncate">{i.label}</span>
                {!!i.badge && <span className="rounded-full bg-tertiary-container px-2 text-xs font-extrabold text-on-tertiary-container">{i.badge}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <nav data-slide aria-label={label} className="flex h-18 items-center justify-around border-t border-white/70 bg-surface-container px-1 backdrop-blur-2xl">
        {main.map((i) => tab(i, i.go))}
        {split && tab({ id: "more", icon: "more", label: t.common.more, badge: rest.reduce((n, i) => n + (i.badge ?? 0), 0), on: restOn || open }, () => setOpen((v) => !v), { "aria-expanded": open, "aria-haspopup": "menu" })}
      </nav>
    </div>
  );
}
