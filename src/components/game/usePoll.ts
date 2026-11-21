"use client";

import { useEffect, useState } from "react";

/** Fetch JSON from `url` every `ms` while url is set (live game screens). */
export function usePoll<T>(url: string | null, ms = 1000) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = () =>
      fetch(url, { cache: "no-store" })
        .then(async (r) => {
          if (!alive) return;
          setStatus(r.status);
          if (r.ok) setData(await r.json());
        })
        .catch(() => alive && setStatus(0));
    load();
    const id = setInterval(load, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url, ms]);
  return { data, status };
}

export const OPTION_TONES = [
  "bg-primary text-on-primary",
  "bg-tertiary text-white",
  "bg-deep text-white",
  "bg-secondary-container text-on-secondary-container",
  "bg-primary-container text-on-primary-container",
  "bg-tertiary-container text-on-tertiary-container",
];
export const LETTERS = ["A", "B", "C", "D", "E", "F"];
/** Phone answer buttons: soft tints (as RGB), still different enough to tell apart. */
export const OPTION_TINTS = ["0 128 112", "176 120 0", "80 96 180", "190 84 72", "0 110 140", "120 90 180"];
