"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import en, { type Dict } from "./en";

export type Lang = "en" | "bn";
const STORAGE_KEY = "edunest-lang";

// The Bangla words are a file of their own (bigger than the English one), fetched only by people who read in Bangla,
// so everyone else's first page is lighter. Fetched once; a failed try (no connection) can be tried again.
let bnWords: Promise<Dict> | undefined;
const loadBn = () =>
  (bnWords ??= import("./bn").then(
    (m) => m.default,
    (e) => {
      bnWords = undefined;
      throw e;
    },
  ));
const savedLang = (): Lang => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en"; // storage unavailable — stay on English
  }
};
// A Bangla reader's words start downloading the moment this file runs, not after the page has finished starting up.
if (typeof window !== "undefined" && savedLang() === "bn") loadBn().catch(() => {});

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict };
const LanguageContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: en });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [bn, setBn] = useState<Dict | null>(null);
  const wanted = useRef<Lang>("en"); // the latest choice, in case it changes while the Bangla words are on their way

  const show = (l: Lang) => {
    wanted.current = l;
    if (l === "en") return setLangState("en");
    loadBn()
      .then((words) => {
        if (wanted.current !== "bn") return;
        setBn(words);
        setLangState("bn");
      })
      .catch(() => {}); // no connection: stays in English; the choice is saved, so the next visit tries again
  };

  // Restore the saved choice after the first render.
  useEffect(() => {
    if (savedLang() === "bn") show("bn");
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    show(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: lang === "bn" && bn ? bn : en }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Use inside client components: const { t, lang, setLang } = useLang(); */
export function useLang() {
  return useContext(LanguageContext);
}
