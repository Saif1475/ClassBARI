"use client";

import { useState } from "react";
import { useFlag } from "@/components/Platform";
import { useLang } from "@/lib/i18n/LanguageProvider";

export type SmsResult = "sent" | "test" | "failed" | "limit";

export async function postSms(to: string[], text: string): Promise<SmsResult> {
  const res = await fetch("/api/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, text }) }).catch(() => null);
  if (!res) return "failed";
  if (res.status === 429) return "limit";
  const body = await res.json().catch(() => ({}));
  return res.ok && (body.status === "sent" || body.status === "test") ? body.status : "failed";
}

/** Sends one SMS to one or more guardians through /api/sms. Hidden when SMS is switched off in the admin panel. */
export function SmsButton({ to, text, label, confirmText, className = "" }: { to: string[]; text: string; label?: string; confirmText?: string; className?: string }) {
  const { t } = useLang();
  const S = t.sms;
  const on = useFlag("sms");
  const [state, setState] = useState<"idle" | "sending" | SmsResult>("idle");
  if (!on || to.length === 0) return null;

  const send = async () => {
    if (confirmText && !confirm(confirmText)) return;
    setState("sending");
    setState(await postSms(to, text));
  };

  const done = state === "sent" || state === "test";
  return (
    <button
      type="button"
      onClick={send}
      disabled={state === "sending" || done}
      title={state === "test" ? S.testMode : undefined}
      className={`inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-bold disabled:opacity-80 ${state === "failed" || state === "limit" ? "bg-error text-white" : done ? "bg-secondary-container text-on-secondary-container" : "bg-primary-container text-on-primary-container"} ${className}`}
    >
      {state === "sending" ? S.sending : state === "sent" ? S.sent : state === "test" ? S.saved : state === "limit" ? S.limit : state === "failed" ? S.failed : (label ?? S.send)}
    </button>
  );
}
