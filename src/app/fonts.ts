// The site's fonts, served from our own address (no request to Google when a page opens).
// next/font fetches the Google files once, when the site is built, and keeps them with the site's other files.
import { Hind_Siliguri, Roboto_Flex } from "next/font/google";
import localFont from "next/font/local";

/** English text and numbers: one file for every weight, fetched early on every page. */
export const latin = Roboto_Flex({ subsets: ["latin"], axes: ["opsz"], display: "swap", preload: false, variable: "--font-latin" });

/** Bangla text. Not fetched early: only pages that show Bangla need it, and then only the weights they use. */
export const bangla = Hind_Siliguri({ weight: ["400", "500", "600", "700"], subsets: ["bengali"], display: "swap", preload: false, variable: "--font-bn" });

// The ৳ sign sits in the Bangla part of the font, so one price on an English page used to pull in a whole Bangla
// file per weight (35–70 KB each). These four files hold only ৳ and the letters of "বাংলা" (about 1 KB each), cut
// from Hind Siliguri (Indian Type Foundry, SIL Open Font Licence) with fonttools:
//   pyftsubset <the Bangla file> --text="৳বাংলা" --flavor=woff2 --layout-features='*' --no-hinting
// (next/font needs its settings written out in full in each call: no shared variable.)
/** The ৳ sign on its own: first in the English font list, used for that one character only. */
export const taka = localFont({
  src: [
    { path: "./fonts/hind-siliguri-signs-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/hind-siliguri-signs-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/hind-siliguri-signs-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/hind-siliguri-signs-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-taka",
  declarations: [{ prop: "unicode-range", value: "U+09F3" }],
});
/** The word "বাংলা" on the language switch, which English pages show too. */
export const banglaLabel = localFont({
  src: [
    { path: "./fonts/hind-siliguri-signs-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/hind-siliguri-signs-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/hind-siliguri-signs-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/hind-siliguri-signs-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-bn-label",
});

export const fontVariables = `${latin.variable} ${bangla.variable} ${taka.variable} ${banglaLabel.variable}`;
