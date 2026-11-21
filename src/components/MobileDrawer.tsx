"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";

/** Canvas-style slide-out menu for phones (hidden from md up). */
export function MobileDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const { t } = useLang();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden"; // keep the page behind from scrolling
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" aria-label={t.common.close} onClick={onClose} className="absolute inset-0 bg-black/40" />
      <aside data-slide role="dialog" aria-modal="true" className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col gap-2 overflow-y-auto bg-surface p-4 shadow-2xl" style={{ backgroundColor: "var(--color-surface)" }}>
        <button type="button" onClick={onClose} aria-label={t.common.close} className="flex h-10 w-10 items-center justify-center self-end rounded-full bg-surface-container">
          <Icon name="close" size={20} />
        </button>
        {children}
      </aside>
    </div>
  );
}

/** One row in the drawer menu. */
export function DrawerItem({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-12 shrink-0 items-center gap-3 rounded-full px-4 text-left text-[15px] ${active ? "bg-secondary-container font-bold text-on-secondary-container" : "font-medium text-on-surface-variant"}`}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}
