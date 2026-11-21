"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { setInstitute, type InstituteCard } from "@/lib/institute-choice";

const TONES = ["bg-primary-container text-on-primary-container", "bg-secondary-container text-on-secondary-container", "bg-tertiary-container text-on-tertiary-container"];

/**
 * "Find your institute" (like Canvas's "Find your school"): press the box and the list of institutes slides down;
 * typing a name or the institute code narrows it. Arrow keys, Enter and Escape work too.
 */
export function InstitutePicker({ onPick }: { onPick: (i: InstituteCard) => void }) {
  const { t } = useLang();
  const A = t.auth;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<InstituteCard[] | null>(null);
  const [at, setAt] = useState(0); // the row the arrow keys are on
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    // Nothing typed (or one letter): the whole list to scroll through; typing narrows it.
    const term = q.trim().length < 2 ? "" : q.trim();
    const timer = setTimeout(() => {
      fetch(`/api/institutes?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d: InstituteCard[]) => (setList(d), setAt(0)))
        .catch(() => setList([]));
    }, term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q]);
  // A press anywhere else closes the list.
  useEffect(() => {
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  useEffect(() => {
    document.getElementById(`${id}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [at, id]);

  const pick = (i: InstituteCard) => {
    setInstitute(i);
    onPick(i);
  };
  const keys = (e: React.KeyboardEvent) => {
    const n = list?.length ?? 0;
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (n) setAt((at + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter" && open && list?.[at]) {
      e.preventDefault();
      pick(list[at]);
    }
  };

  return (
    <div ref={wrap} className="relative flex flex-col gap-2">
      <label htmlFor={id} className="text-lg font-bold text-on-surface">{A.findInstitute}</label>
      <span className="text-sm text-on-surface-variant">{A.findInstituteHelp}</span>
      <div className={`flex h-14 items-center gap-3 rounded-xl border bg-white px-4 transition-shadow ${open ? "border-primary shadow-[0_0_0_4px_rgba(0,106,96,0.14)]" : "border-outline"}`}>
        <span aria-hidden className="text-on-surface-variant"><Icon name="search" size={20} /></span>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && list?.length ? `${id}-${at}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={keys}
          placeholder={A.institutePh}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-on-surface !outline-none" // the box around it shows the focus
        />
        <button type="button" tabIndex={-1} aria-label={A.findInstitute} onClick={() => setOpen((v) => !v)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-transform duration-200 hover:bg-surface-container ${open ? "rotate-180" : ""}`}>
          <Icon name="chevronDown" size={20} />
        </button>
      </div>

      {open && (
        <div className="picker-drop absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[16px] border border-outline-variant bg-surface shadow-[0_18px_50px_rgba(0,32,28,0.22)]">
          {list === null ? (
            <p role="status" className="px-5 py-6 text-center text-sm text-on-surface-variant">…</p>
          ) : list.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-on-surface-variant">{A.noInstitute}</p>
          ) : (
            <ul id={`${id}-list`} role="listbox" aria-label={A.findInstitute} className="flex max-h-72 flex-col gap-1 overflow-y-auto overscroll-contain p-2">
              {list.map((i, k) => (
                <li
                  key={i.id}
                  id={`${id}-${k}`}
                  role="option"
                  aria-selected={k === at}
                  onPointerMove={() => k !== at && setAt(k)}
                  onClick={() => pick(i)}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${k === at ? "bg-surface-container" : ""}`}
                >
                  <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px_14px_14px_5px] text-base font-extrabold ${TONES[k % TONES.length]}`}>{i.name.trim().charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 break-words font-bold leading-snug">{i.name}</span>
                  <span className="shrink-0 rounded-full bg-surface-high px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-on-surface-variant">{i.code}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-outline-variant bg-surface-container px-4 py-2.5 text-center text-xs text-on-surface-variant">{A.pickerTip}</p>
        </div>
      )}
    </div>
  );
}
