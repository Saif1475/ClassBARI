// A long list a page at a time (see components/Pager.tsx). Plain functions, so they can be tested on their own.
export const PAGE_SIZES = [10, 20, 50, 100];

/** How many pages there are, and the page we are really on (a list that got shorter never leaves you past its end). */
export function pageAt(count: number, size: number, page: number) {
  const pages = Math.max(1, Math.ceil(count / size));
  return { pages, page: Math.min(Math.max(1, Math.floor(page) || 1), pages) };
}

/** The page numbers to offer: all of them when there are few, else the first, the last and the ones around the current page (0 = a gap "…"). */
export function pageNumbers(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return keep.flatMap((n, i) => (i > 0 && n - keep[i - 1] > 1 ? [0, n] : [n]));
}
