"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtWhen } from "@/lib/dates";
import { isPhoto, uploadData } from "@/lib/files";
import { useLms } from "@/lib/lms-store";

/** Class story: the teacher posts updates (text + optional photo); students and parents of the batch see them. */
export function StoryFeed({ batch, canPost, onPosted }: { batch: string; canPost?: boolean; onPosted?: (msg: string) => void }) {
  const { t, lang } = useLang();
  const D = t.dojo;
  const lms = useLms();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");
  const posts = lms.story.filter((p) => p.batch === batch);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-outline-variant bg-white p-5">
      <h2 className="text-lg font-bold">{D.story}</h2>
      {canPost && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            lms.addStoryPost(batch, text.trim(), image);
            setText("");
            setImage(undefined);
            setKey((k) => k + 1);
            onPosted?.(D.posted);
          }}
        >
          <textarea required rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={D.storyPh} aria-label={D.storyPh} className="rounded-xl border border-outline bg-white p-3 text-sm" />
          <label className="flex flex-col gap-1 text-xs font-bold text-on-surface-variant">
            {D.photo}
            <input
              key={key}
              type="file"
              accept="image/*"
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
          <button type="submit" className="h-10 self-start rounded-full bg-primary px-5 text-sm font-bold text-on-primary">{D.post}</button>
        </form>
      )}
      {posts.length === 0 && <p className="text-sm text-on-surface-variant">{D.noStory}</p>}
      {posts.map((p) => (
        <article key={p.id} className="flex flex-col gap-2 rounded-xl bg-surface-container p-3">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span className="font-bold text-on-surface">{p.author}</span>
            <span className="flex items-center gap-2">
              {fmtWhen(p.at, lang)}
              {canPost && (
                <button type="button" onClick={() => lms.deleteStoryPost(p.id)} aria-label={`${t.common.remove}: ${p.text.slice(0, 30)}`} className="rounded-full p-1 hover:bg-error-container">
                  <Icon name="trash" size={14} />
                </button>
              )}
            </span>
          </div>
          <p className="whitespace-pre-line text-sm">{p.text}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image && <img src={p.image} alt="" className="max-h-72 rounded-[10px] object-contain" />}
        </article>
      ))}
    </section>
  );
}
