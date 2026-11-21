"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { PAGE_SIZES, pageAt, pageNumbers } from "@/lib/paging";

const SIZE_KEY = "edunest-page-size"; // the person's choice of 10 / 20 / 50 / 100, remembered on this device

/**
 * A long list shown a page at a time. `shown` is the page to draw; `pager` is "show 10 / 20 / 50 / 100" with the page
 * numbers (nothing at all while the list fits the smallest page). A new `resetKey` (another search, filter or batch)
 * starts again at page 1; without it you stay where you are while rows change under you.
 */
export function usePaged<T>(items: T[], resetKey = ""): { shown: T[]; pager: ReactNode } {
  const { t } = useLang();
  const P = t.pager;
  const [size, setSize] = useState(20);
  const [at, setAt] = useState({ page: 1, key: resetKey });
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIZE_KEY));
      if (PAGE_SIZES.includes(saved)) setSize(saved);
    } catch {
      /* storage blocked: 20 a page */
    }
  }, []);
  if (items.length <= PAGE_SIZES[0]) return { shown: items, pager: null };

  const { page, pages } = pageAt(items.length, size, at.key === resetKey ? at.page : 1);
  const go = (p: number) => setAt({ page: p, key: resetKey });
  const first = (page - 1) * size;
  const btn = "h-10 min-w-10 rounded-full px-3 text-sm font-bold";
  const idle = `${btn} border border-outline-variant bg-white text-on-surface-variant disabled:opacity-40`;
  const pager = (
    <nav aria-label={P.label} className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        {P.show}
        <select
          value={size}
          onChange={(e) => {
            const next = Number(e.target.value);
            setSize(next);
            go(Math.floor(first / next) + 1); // keep the first row you were looking at on screen
            try {
              localStorage.setItem(SIZE_KEY, String(next));
            } catch {
              /* not remembered */
            }
          }}
          aria-label={P.perPage}
          className="h-10 rounded-full border border-outline-variant bg-white px-3 font-bold text-on-surface"
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>{P.range(first + 1, Math.min(first + size, items.length), items.length)}</span>
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => go(page - 1)} disabled={page === 1} aria-label={P.prev} className={idle}>‹</button>
        {pageNumbers(page, pages).map((n, i) =>
          n === 0 ? (
            <span key={`gap-${i}`} aria-hidden className="px-1 text-on-surface-variant">…</span>
          ) : (
            <button key={n} type="button" onClick={() => go(n)} aria-label={P.page(n)} aria-current={n === page ? "page" : undefined} className={n === page ? `${btn} bg-primary text-on-primary` : idle}>
              {n}
            </button>
          ),
        )}
        <button type="button" onClick={() => go(page + 1)} disabled={page === pages} aria-label={P.next} className={idle}>›</button>
      </div>
    </nav>
  );
  return { shown: items.slice(first, first + size), pager };
}
