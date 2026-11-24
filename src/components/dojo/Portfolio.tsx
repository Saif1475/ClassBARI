"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { isPhoto, uploadData } from "@/lib/files";
import { useLms } from "@/lib/lms-store";

/** Student portfolio: photos of work the student shares; parents and teachers can see them. */
export function Portfolio({ studentIds, canAdd, title }: { studentIds: number[]; canAdd?: boolean; title?: string }) {
  const { t } = useLang();
  const D = t.dojo;
  const lms = useLms();
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");
  const items = lms.portfolio.filter((p) => studentIds.includes(p.studentId));

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{title ?? D.portfolio}</h2>
      {canAdd && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!image || !name.trim()) return;
            lms.addPortfolio(studentIds[0], name.trim(), image);
            setName("");
            setImage(undefined);
            setKey((k) => k + 1);
          }}
        >
          <p className="text-xs text-on-surface-variant">{D.portfolioSub}</p>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={D.workTitle} aria-label={D.workTitle} className="h-10 rounded-xl border border-outline bg-white px-3 text-sm" />
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {D.workPhoto}
            <input
              key={key}
              required
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return setImage(undefined);
                const data = await uploadData(f);
                if (!data) return setError(isPhoto(f) ? t.sub.badPhoto : t.sub.tooBig);
                setError("");
                setImage(data);
              }}
              className="text-sm font-normal"
            />
          </label>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button type="submit" disabled={!image} className="h-10 self-start rounded-full bg-primary px-5 text-sm font-bold text-on-primary disabled:opacity-50">{D.addWork}</button>
        </form>
      )}
      {items.length === 0 && <p className="text-sm text-on-surface-variant">{D.noWork}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((p) => (
          <figure key={p.id} className="flex flex-col gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.title} className="aspect-square w-full rounded-[10px] object-cover" />
            <figcaption className="text-xs">
              <b>{p.title}</b>
              {studentIds.length > 1 && <> · {lms.students.find((s) => s.id === p.studentId)?.name}</>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
