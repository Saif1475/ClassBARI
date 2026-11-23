"use client";

import { ChatRoom } from "@/components/chat/ChatRoom";
import { useLang } from "@/lib/i18n/LanguageProvider";
import { useLms } from "@/lib/lms-store";
import { useChild } from "../child";

export default function ParentMessages() {
  const { t } = useLang();
  const M = t.pmsg;
  const lms = useLms();
  const { child } = useChild();
  if (!child) return null;
  const thread = lms.chats.find((c) => c.id === `parent-${child.id}`);
  const teacherName = lms.batches.find((b) => b.name === child.batch)?.teacher ?? lms.teacherName;

  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-8">
      <h1 className="text-2xl font-bold">{M.title(child.name)}</h1>
      <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-[16px] border border-outline-variant bg-white">
        <ChatRoom key={child.id} thread={thread} side="family" title={teacherName} subtitle={child.batch} placeholder={M.ph} empty={M.none} onSend={(text, extra) => lms.sendParentMessage(child.id, text, extra)} dock="sticky bottom-22 md:bottom-0" />
      </div>
    </div>
  );
}
