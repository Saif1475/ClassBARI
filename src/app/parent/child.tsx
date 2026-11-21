"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";

const KEY = "edunest-child";
const ChildContext = createContext<{ childId: number; setChildId: (id: number) => void }>({ childId: 0, setChildId: () => {} });

/** Which of the parent's children is being viewed; remembered in the browser. */
export function ChildProvider({ children }: { children: ReactNode }) {
  const lms = useLms();
  const [childId, setChildIdState] = useState(lms.parentChildren[0] ?? 0);
  useEffect(() => {
    const saved = Number(localStorage.getItem(KEY));
    if (lms.parentChildren.includes(saved)) setChildIdState(saved);
  }, [lms.parentChildren]);
  const setChildId = (id: number) => {
    setChildIdState(id);
    localStorage.setItem(KEY, String(id));
  };
  return <ChildContext.Provider value={{ childId, setChildId }}>{children}</ChildContext.Provider>;
}

export function useChild() {
  const lms = useLms();
  const { childId, setChildId } = useContext(ChildContext);
  const kids = lms.students.filter((s) => lms.parentChildren.includes(s.id));
  const child = kids.find((s) => s.id === childId) ?? kids[0];
  return { child, kids, setChildId };
}

export function ChildSwitcher() {
  const { t } = useLang();
  const { child, kids, setChildId } = useChild();
  if (kids.length < 2) return null;
  return (
    <div data-slide role="group" aria-label={t.pmsg.child} className="flex gap-1.5 overflow-x-auto px-4 pt-4 md:px-8">
      {kids.map((k) => (
        <button
          key={k.id}
          type="button"
          aria-pressed={k.id === child?.id}
          onClick={() => setChildId(k.id)}
          className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold ${k.id === child?.id ? "bg-primary text-on-primary" : "border border-outline-variant bg-white text-on-surface-variant"}`}
        >
          {k.name}
        </button>
      ))}
    </div>
  );
}
