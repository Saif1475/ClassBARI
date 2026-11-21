"use client";

import Link from "next/link";
import { Icon } from "./Icon";
import { SlidingSegmented } from "./SlidingSegmented";
import { useEffect, useState } from "react";
import { useLang, type Lang } from "@/lib/i18n/LanguageProvider";
import { applyThemeMode } from "@/lib/theme";

const TEXT_KEY = "classbari-text-size";
const SIZES = ["100%", "112.5%", "125%"]; // A, A+, A++ (everything is sized in rem, so this scales the whole app)

/** Applies the saved text size on every page. */
export function TextSizeInit() {
  useEffect(() => {
    const saved = localStorage.getItem(TEXT_KEY);
    if (saved && SIZES.includes(saved)) document.documentElement.style.setProperty("--text-size", saved);
  }, []);
  return null;
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
        { value: "bn", label: compact ? "বাং" : "বাংলা", className: "font-[family-name:var(--font-bangla)]" },
      ]}
      className="bg-white/70 p-1"
      buttonClassName={`h-9 text-sm font-bold ${compact ? "px-3" : "px-4"}`}
    />
    <ThemeToggle />
    </>
  );
}
