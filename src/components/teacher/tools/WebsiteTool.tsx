"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { REAL_AUTH } from "@/lib/auth-mode";
import { newlyPublished } from "@/lib/data-access";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { isBdMobile } from "@/lib/site";
import type { ToolProps } from "./ToolsPage";
import { box, card, label } from "./ui";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** The teacher's own public page: intro, public batches, results summary, join buttons. */
export function WebsiteTool() {
  const { t } = useLang();
  const W = t.website;
  const lms = useLms();
  const site = lms.site;
  const publicBatches = lms.batches.filter((b) => b.public);
  // The address is saved when the field is left, not on every key: a hyphen can be typed, and a half-typed address is never checked.
  const [slug, setSlug] = useState(site.slug);
  useEffect(() => setSlug(site.slug), [site.slug]);
  const [taken, setTaken] = useState(false);
  // An address another institute already shows is refused by the server too; asked first so the owner is told why.
  const save = async (patch: { slug?: string; published?: boolean }) => {
    const wanted = newlyPublished(site, patch);
    const theirs = REAL_AUTH && wanted ? await fetch(`/api/public?slug=${encodeURIComponent(wanted)}`).then((r) => r.json() as Promise<{ site?: unknown }>).catch(() => ({ site: undefined })) : {};
    setTaken(!!theirs.site);
    if (theirs.site) return setSlug(site.slug);
    lms.updateSite(patch);
  };
  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <label className={label}>{W.address}
          <span className="flex items-center gap-1 text-base font-normal">/t/<input value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setTaken(false); }} onBlur={() => { const s = slugify(slug); setSlug(s); if (s !== site.slug) void save({ slug: s }); }} aria-invalid={taken} className={`${box} flex-1`} /></span>
          {taken && <span role="alert" className="font-semibold text-error">{W.taken}</span>}
        </label>
        <label className={label}>{W.bio}<textarea rows={5} value={site.bio} maxLength={1500} onChange={(e) => lms.updateSite({ bio: e.target.value })} placeholder={W.bioPh} className="rounded-[10px] border border-outline p-3 font-normal" /></label>
        <label className={label}>{W.bkash}
          <input type="tel" value={site.bkash} onChange={(e) => lms.updateSite({ bkash: e.target.value.trim() })} placeholder="01XXXXXXXXX" aria-invalid={!!site.bkash && !isBdMobile(site.bkash)} className={box} />
          <span className="font-normal text-on-surface-variant">{W.bkashHelp}</span>
        </label>
        <label className="flex items-center gap-2 font-bold">
          <input type="checkbox" checked={site.published} onChange={(e) => void save({ published: e.target.checked })} className="h-5 w-5 accent-primary" />
          {W.publish}
        </label>
        <p className="text-sm text-on-surface-variant">{W.batchesNote(publicBatches.length)}</p>
        {site.published && site.slug && <Link href={`/t/${site.slug}`} target="_blank" className="self-start rounded-full bg-primary px-5 py-2.5 font-bold text-on-primary">{W.open}</Link>}
      </section>
    </div>
  );
}
