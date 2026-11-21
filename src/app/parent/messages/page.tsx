"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { fmtWhen } from "@/lib/dates";
import { useLms } from "@/lib/lms-store";
import { useChild } from "../child";

export default function ParentMessages() {
  const { t, lang } = useLang();
  const M = t.pmsg;
  const lms = useLms();
  const { child } = useChild();
  const [draft, setDraft] = useState("");
  if (!child) return null;
  const thread = lms.chats.find((c) => c.id === `parent-${child.id}`);
  const teacherName = lms.batches.find((b) => b.name === child.batch)?.teacher ?? lms.teacherName;

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-8">
      <h1 className="text-2xl font-bold">{M.title(child.name)}</h1>
      <p className="-mt-3 text-sm text-on-surface-variant">{teacherName} · {child.batch}</p>
      <div className="flex flex-col gap-3">
        {!thread && <p className="text-on-surface-variant">{M.none}</p>}
        {thread?.messages.map((m) => {
          const mine = m.sender !== teacherName;
          return (
            <div key={m.id} className={`flex max-w-lg flex-col gap-1 ${mine ? "ml-auto items-end" : "mr-auto items-start"}`}>
              <span className="px-2 text-[11px] font-semibold text-on-surface-variant">{m.sender} · {fmtWhen(m.at, lang)}</span>
              <div className={`rounded-[16px] px-4 py-3 text-sm ${mine ? "rounded-br-xs bg-primary text-on-primary" : "rounded-bl-xs border border-outline-variant bg-white"}`}>{m.text}</div>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          lms.sendParentMessage(child.id, draft.trim());
          setDraft("");
        }}
        className="sticky bottom-22 flex items-center gap-3 md:bottom-4"
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={M.ph} aria-label={M.ph} className="h-12 flex-1 rounded-full border border-outline-variant bg-white px-5 text-sm outline-none" />
        <button type="submit" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-on-primary">
          {t.common.send} <Icon name="arrow" size={16} />
        </button>
      </form>
    </div>
  );
}
