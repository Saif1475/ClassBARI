"use client";

import Link from "next/link";
import { Logo, LangSwitch } from "./Brand";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fillLegal, LEGAL, legalIsDraft } from "@/lib/legal-info";
import { LEGAL_TEXT, type Block } from "@/lib/legal-text";

/** /privacy and /terms: the full text, a contents list, and a link to each section (#delete-account for the app stores). */
export function LegalPage({ which }: { which: "privacy" | "terms" }) {
  const { t, lang } = useLang();
  const L = t.legal;
  const doc = LEGAL_TEXT[lang === "bn" ? "bn" : "en"][which];
  const other = LEGAL_TEXT[lang === "bn" ? "bn" : "en"][which === "privacy" ? "terms" : "privacy"];
  const f = fillLegal;
  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <LangSwitch compact />
      </header>
      <main id="top" className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pb-20">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold">{doc.title}</h1>
          <p className="text-sm text-on-surface-variant">{L.updated(LEGAL.updated)}</p>
          {legalIsDraft() && <p role="note" className="rounded-xl bg-tertiary-container px-4 py-3 text-sm font-semibold text-on-tertiary-container">{L.draftNote}</p>}
          <p className="text-lg leading-relaxed">{f(doc.intro)}</p>
          {lang === "bn" && <p className="text-sm text-on-surface-variant">{L.englishPrevails}</p>}
        </div>

        <nav aria-label={L.contents} className="rounded-[18px] border border-outline-variant bg-white p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-on-surface-variant">{L.contents}</h2>
          <ol className="grid gap-1 sm:grid-cols-2">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-block py-1 font-semibold text-primary hover:underline">{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="flex scroll-mt-6 flex-col gap-3">
            <h2 className="text-2xl font-bold">{s.title}</h2>
            {s.blocks.map((b, i) => (
              <Part key={i} block={b} />
            ))}
          </section>
        ))}

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-5 text-sm">
          <span>
            {L.seeAlso}: <Link href={which === "privacy" ? "/terms" : "/privacy"} className="font-semibold text-primary hover:underline">{other.title}</Link>
          </span>
          <a href="#top" className="font-semibold text-primary hover:underline">{L.toTop}</a>
        </footer>
      </main>
    </div>
  );
}

function Part({ block }: { block: Block }) {
  if (typeof block === "string") return <p className="text-base leading-relaxed">{fillLegal(block)}</p>;
  if ("list" in block)
    return (
      <ul className="flex list-disc flex-col gap-2 pl-6 text-base leading-relaxed">
        {block.list.map((x, i) => (
          <li key={i}>{fillLegal(x)}</li>
        ))}
      </ul>
    );
  const [head, ...rows] = block.table;
  return (
    <>
      {/* Phones: one card per row, each value under its column's name (a wide table can't be read at this width). */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((r, i) => (
          <div key={i} className="rounded-[14px] border border-outline-variant bg-white p-4">
            <p className="mb-2 font-bold">{fillLegal(r[0])}</p>
            <dl className="flex flex-col gap-2 text-sm leading-relaxed">
              {r.slice(1).map((c, j) => (
                <div key={j}>
                  <dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{head[j + 1]}</dt>
                  <dd>{fillLegal(c)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <table className="hidden w-full border-collapse text-left text-sm leading-relaxed sm:table">
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col" className="border-b-2 border-outline-variant px-3 py-2 font-bold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="border-b border-outline-variant px-3 py-2 font-semibold">{fillLegal(c)}</th> : <td key={j} className="border-b border-outline-variant px-3 py-2">{fillLegal(c)}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
