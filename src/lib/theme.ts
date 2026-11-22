// Light / dark look. Kept outside the client components so the server layout can inline THEME_INIT.
export const THEME_KEY = "classbari-theme";
/** Glass effect, 0 (off: the flat look) to 3 (high); also read by THEME_INIT. The phone apps keep the same key and levels. */
export const GLASS_KEY = "edunest-glass";
export const GLASS_DEFAULT = 2;
export function readGlass() {
  try {
    const g = Number(localStorage.getItem(GLASS_KEY) ?? GLASS_DEFAULT);
    return g >= 0 && g <= 3 ? Math.round(g) : GLASS_DEFAULT;
  } catch {
    return GLASS_DEFAULT;
  }
}
/** Save and apply at once (not for someone whose device asks for less transparency): <html data-glass="1..3" style="--glass: 0..1">, read by globals.css. */
export function applyGlass(g: number) {
  try {
    localStorage.setItem(GLASS_KEY, String(g));
  } catch {
    /* private mode: still switch for this visit */
  }
  const html = document.documentElement;
  if (g > 0 && !matchMedia("(prefers-reduced-transparency: reduce)").matches) {
    html.dataset.glass = String(g);
    html.style.setProperty("--glass", String(g / 3));
  } else {
    delete html.dataset.glass;
    html.style.removeProperty("--glass");
  }
}

/** Runs before the page paints (inline in <head>), so a dark-mode user never sees a white flash. */
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");if(localStorage.getItem("classbari-tone")==="sky")document.documentElement.dataset.tone="sky";var g=localStorage.getItem("${GLASS_KEY}");g=g===null?${GLASS_DEFAULT}:+g;if(g>0&&g<4&&!matchMedia("(prefers-reduced-transparency: reduce)").matches){document.documentElement.dataset.glass=g;document.documentElement.style.setProperty("--glass",g/3)}}catch(e){}`;

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
