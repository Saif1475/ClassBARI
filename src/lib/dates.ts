// Date helpers. Data stores ISO strings; screens format them in the current language.
import type { Lang } from "./i18n/LanguageProvider";
import type { Dict } from "./i18n/en";

const locale = (lang: Lang) => (lang === "bn" ? "bn-BD" : "en-GB");

/** Local calendar day as YYYY-MM-DD (what <input type="date"> uses). */
export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** ISO time `days` from today at local hh:mm. */
export const at = (days: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/** YYYY-MM-DD `days` from today. */
export const dayFromToday = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dayKey(d);
};

// Date-only keys are local days; full ISO strings are instants.
export const toDate = (s: string) => new Date(s.length === 10 ? `${s}T00:00` : s);

// A formatter is costly to create and cheap to use, so each (language, style) pair is made once and kept.
const STYLES = {
  weekday: { weekday: "short" },
  dayNum: { day: "numeric" },
  date: { day: "numeric", month: "short" },
  time: { hour: "numeric", minute: "2-digit" },
  dateTime: { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  month: { month: "long", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
const made = new Map<string, Intl.DateTimeFormat>();
function fmt(s: string, lang: Lang, style: keyof typeof STYLES) {
  const d = toDate(s);
  if (Number.isNaN(d.getTime())) return "Invalid Date"; // what toLocaleString says; a formatter would throw
  let f = made.get(lang + style);
  if (!f) made.set(lang + style, (f = new Intl.DateTimeFormat(locale(lang), STYLES[style])));
  return f.format(d);
}
export const fmtWeekday = (s: string, lang: Lang) => fmt(s, lang, "weekday");
export const fmtDayNum = (s: string, lang: Lang) => fmt(s, lang, "dayNum");
export const fmtDate = (s: string, lang: Lang) => fmt(s, lang, "date");
export const fmtTime = (s: string, lang: Lang) => fmt(s, lang, "time");
export const fmtDateTime = (s: string, lang: Lang) => fmt(s, lang, "dateTime");
export const fmtMonth = (s: string, lang: Lang) => fmt(s, lang, "month");

const ago = new Map<Lang, Intl.RelativeTimeFormat>();
/** "2 days ago", "in 3 hours", "yesterday"… */
export function fmtAgo(s: string, lang: Lang) {
  const sec = (toDate(s).getTime() - Date.now()) / 1000;
  let rtf = ago.get(lang);
  if (!rtf) ago.set(lang, (rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" })));
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) if (Math.abs(sec) >= size) return rtf.format(Math.round(sec / size), unit);
  return rtf.format(0, "minute");
}

export const sameMonth = (a: string, b: Date = new Date()) => {
  const d = toDate(a);
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth();
};

/** Live class state: a class counts as live from 10 min before start until 90 min after. */
export function liveState(startIso: string, now = Date.now()) {
  const mins = Math.round((toDate(startIso).getTime() - now) / 60000);
  if (mins <= 10 && mins > -90) return { state: "live" as const, mins };
  if (mins > 0 && mins <= 60) return { state: "soon" as const, mins };
  if (mins > 0) return { state: "later" as const, mins };
  return { state: "over" as const, mins };
}

/** Value for <input type="datetime-local"> from an ISO string. */
export const toLocalInput = (iso: string) => {
  const d = toDate(iso);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Badge text for a live class: "● Live now", "Live in 12 min", "Class ended" or the date. */
export function liveLabel(t: Dict, lang: Lang, start: string) {
  const s = liveState(start);
  if (s.state === "live") return t.live.now;
  if (s.state === "soon") return t.live.inMin(s.mins);
  if (s.state === "over") return t.live.ended;
  return fmtDateTime(start, lang);
}

/** Chat/announcement time: time if today, otherwise the date. */
export const fmtWhen = (iso: string, lang: Lang) => (dayKey(toDate(iso)) === dayKey() ? fmtTime(iso, lang) : fmtDate(iso, lang));
