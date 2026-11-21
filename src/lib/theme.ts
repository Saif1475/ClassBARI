// Light / dark look. Kept outside the client components so the server layout can inline THEME_INIT.
export const THEME_KEY = "classbari-theme";

/** Runs before the page paints (inline in <head>), so a dark-mode user never sees a white flash. */
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");if(localStorage.getItem("classbari-tone")==="sky")document.documentElement.dataset.tone="sky"}catch(e){}`;

export type ThemeMode = "light" | "dark" | "system";

/** Browser only. "system" = no saved choice (follow the phone / computer). */
export function readThemeMode(): ThemeMode {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Browser only: save and apply, with a soft cross-fade where supported. Returns whether the page is now dark. */
export function applyThemeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* private mode: still switch for this visit */
  }
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const flip = () => document.documentElement.classList.toggle("dark", dark);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(flip);
  else flip();
  return dark;
}

/** Colour theme: "green" (the default) or "sky" (sky blue, baby pink and near-white). Anyone can pick either. */
export type Tone = "green" | "sky";
const TONE_KEY = "classbari-tone"; // also read by THEME_INIT above
export function readTone(): Tone {
  try {
    return (localStorage.getItem(TONE_KEY) ?? document.documentElement.dataset.tone) === "sky" ? "sky" : "green";
  } catch {
    return "green";
  }
}
export function applyTone(tone: Tone) {
  try {
    localStorage.setItem(TONE_KEY, tone);
  } catch {
    /* private mode: still switch for this visit */
  }
  if (tone === "sky") document.documentElement.dataset.tone = "sky";
  else delete document.documentElement.dataset.tone;
}

/** A student who hasn't picked colours themselves gets the set that goes with the gender their institute entered. */
export function defaultTone(gender: "male" | "female" | undefined) {
  try {
    if (localStorage.getItem(TONE_KEY)) return; // their own choice wins (Settings → Look)
  } catch {
    return;
  }
  if (gender === "female") document.documentElement.dataset.tone = "sky";
  else delete document.documentElement.dataset.tone;
}
