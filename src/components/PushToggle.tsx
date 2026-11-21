"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n/LanguageProvider";

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** Teacher side: tell everyone subscribed to a batch (fire-and-forget; quietly does nothing if push isn't set up). */
export function notifyBatch(batch: string, title: string, body: string, url: string) {
  fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch, title, body, url }), keepalive: true }).catch(() => {});
}

/**
 * Student / guardian: one tap to get class news, homework and results as phone notifications. Free, unlike SMS.
 * Hidden when the browser can't do push or the server has no keys. iPhone: only after "Add to Home Screen".
 */
export function PushToggle({ role, batches }: { role: "student" | "parent"; batches: string[] }) {
  const { t } = useLang();
  const P = t.push;
  const [key, setKey] = useState<string | null>(null);
  const [state, setState] = useState<"off" | "on" | "busy" | "blocked">("off");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    fetch("/api/push").then((r) => (r.ok ? r.json() : null)).then((d) => d && setKey(d.publicKey)).catch(() => {});
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((s) => s && setState("on")).catch(() => {});
    if (Notification.permission === "denied") setState("blocked");
  }, []);
  if (!key) return null;

  const turnOn = async () => {
    setState("busy");
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), role, batches }) });
      setState(res.ok ? "on" : "off");
    } catch {
      setState(Notification.permission === "denied" ? "blocked" : "off");
    }
  };
  const turnOff = async () => {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
    setState("off");
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-outline-variant bg-white px-4 py-3">
      <span className="flex-1 text-sm font-semibold">{state === "on" ? P.on : state === "blocked" ? P.blocked : P.why}</span>
      {state !== "blocked" && (
        <button type="button" disabled={state === "busy"} onClick={state === "on" ? turnOff : turnOn} className={`h-10 rounded-full px-4 text-sm font-bold ${state === "on" ? "bg-surface-container" : "bg-primary text-on-primary"}`}>
          {state === "on" ? P.turnOff : P.turnOn}
        </button>
      )}
    </div>
  );
}
