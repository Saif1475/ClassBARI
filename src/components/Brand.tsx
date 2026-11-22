"use client";

import Link from "next/link";
import { Icon } from "./Icon";
import { SlidingSegmented } from "./SlidingSegmented";
import { useEffect, useState } from "react";
import { useLang, type Lang } from "@/lib/i18n/LanguageProvider";
import { applyGlass, applyThemeMode, readGlass } from "@/lib/theme";

const TEXT_KEY = "classbari-text-size";
const SIZES = ["100%", "112.5%", "125%"]; // A, A+, A++ (everything is sized in rem, so this scales the whole app)
const SMALLEST = 90, BIGGEST = 130; // the slider on the Settings page, in %
/** The saved size as a number, or 100 when nothing sensible is saved. */
const savedSize = () => {
  const n = parseFloat(localStorage.getItem(TEXT_KEY) ?? "");
  return n >= SMALLEST && n <= BIGGEST ? n : 100;
};

/** Applies the saved text size on every page. */
export function TextSizeInit() {
  useEffect(() => {
    if (savedSize() !== 100) document.documentElement.style.setProperty("--text-size", `${savedSize()}%`);
  }, []);
  return null;
}

/** The text size as a slider from a small A to a big A (Settings page; the phone apps have the same one). */
export function TextSizeSlider() {
  const { t, lang } = useLang();
  const [size, setSize] = useState(100);
  useEffect(() => setSize(savedSize()), []);
  const shown = `${size.toLocaleString(lang === "bn" ? "bn-BD" : "en")}%`;
  const pick = (n: number) => {
    setSize(n);
    localStorage.setItem(TEXT_KEY, `${n}%`);
    document.documentElement.style.setProperty("--text-size", `${n}%`);
  };
  return (
    <div className="flex w-full max-w-sm items-center gap-3">
      <span aria-hidden className="text-[13px] font-bold">A</span>
      <input type="range" min={SMALLEST} max={BIGGEST} step={5} value={size} onChange={(e) => pick(Number(e.target.value))} aria-label={t.common.textSize} aria-valuetext={shown} className="h-11 min-w-0 flex-1 accent-primary" />
      <span aria-hidden className="text-[24px] font-bold leading-none">A</span>
      <span className="w-14 text-right text-sm font-semibold tabular-nums text-on-surface-variant">{shown}</span>
    </div>
  );
}

/** Glass effect: Off (flat) · Soft · Medium · High, as a slider like the text size (the phone apps have the same one). */
export function GlassSlider() {
  const { t } = useLang();
  const S = t.settings;
  const [g, setG] = useState(2);
  useEffect(() => setG(readGlass()), []);
  const shown = [S.glassOff, S.glassSoft, S.glassMedium, S.glassHigh][g];
  return (
    <div className="flex w-full max-w-sm items-center gap-3">
      <input type="range" min={0} max={3} step={1} value={g} onChange={(e) => { const n = Number(e.target.value); setG(n); applyGlass(n); }} aria-label={S.glass} aria-valuetext={shown} className="h-11 min-w-0 flex-1 accent-primary" />
      <span className="w-20 text-right text-sm font-semibold text-on-surface-variant">{shown}</span>
    </div>
  );
}

/** A / A+ / A++ — bigger text for anyone who needs it. */
export function TextSize() {
  const { t } = useLang();
  const [size, setSize] = useState("100%");
  useEffect(() => setSize(localStorage.getItem(TEXT_KEY) ?? "100%"), []);
  const pick = (s: string) => {
    setSize(s);
    localStorage.setItem(TEXT_KEY, s);
    document.documentElement.style.setProperty("--text-size", s); // globals.css turns this into the page size (a little smaller on phones)
  };
  return (
    <div data-slide role="group" aria-label={t.common.textSize} className="flex shrink-0 gap-0.5 rounded-full border border-outline-variant bg-white p-1">
      {SIZES.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => pick(s)}
          aria-pressed={size === s}
          aria-label={`${t.common.textSize} ${["A", "A+", "A++"][i]}`}
          className={`h-9 min-w-9 rounded-full px-2 font-bold ${size === s ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
          style={{ fontSize: `${13 + i * 3}px` }}
        >
          A
        </button>
      ))}
    </div>
  );
}

/** `name`: "lg" shows the word only on wide screens, "hide" never (narrow side rail); screen readers always get it. */
export function Logo({ href = "/", name = "show" }: { href?: string; name?: "show" | "lg" | "hide" }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2.5 text-on-surface no-underline">
      <span className="flex h-10 w-10 items-center justify-center rounded-[14px_14px_14px_4px] bg-primary text-on-primary">
        <Icon name="home" size={22} strokeWidth={2} />
      </span>
      <span className={`font-sans text-[22px] font-extrabold tracking-tight ${name === "hide" ? "sr-only" : name === "lg" ? "sr-only lg:not-sr-only" : ""}`}>ClassBARI</span>
    </Link>
  );
}


/** Sun / moon button: light or dark look, remembered on this device (first visit follows the phone's setting). */
export function ThemeToggle() {
  const { t } = useLang();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const flip = () => setDark(applyThemeMode(dark ? "light" : "dark"));
  return (
    <button type="button" onClick={flip} aria-pressed={dark} aria-label={dark ? t.common.lightMode : t.common.darkMode} title={dark ? t.common.lightMode : t.common.darkMode} className="glass-orb flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-lg">
      <span aria-hidden className="theme-icon">{dark ? "☀︎" : "☾"}</span>
    </button>
  );
}

/** EN | বাংলা segmented switch with Apple-style sliding pill, plus the light/dark switch. Saves the choices in the browser. */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useLang();
  return (
    <>
    <SlidingSegmented<Lang>
      ariaLabel={t.common.language}
      value={lang}
      onChange={setLang}
      options={[
        { value: "en", label: compact ? "EN" : "English" },
        { value: "bn", label: compact ? "বাং" : "বাংলা", className: "font-[family-name:var(--font-bn-label),var(--font-bangla)]" }, // its own tiny font: an English page doesn't fetch a Bangla file for this one word
      ]}
      className="bg-white/70 p-1"
      buttonClassName={`h-9 text-sm font-bold ${compact ? "px-3" : "px-4"}`}
    />
    <ThemeToggle />
    </>
  );
}
