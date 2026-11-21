"use client";

import { useEffect } from "react";

/** Tells our server when a screen crashes in someone's browser (at most 3 per page load; no personal details). */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const send = (message: string) => {
      if (sent++ >= 3 || !message || /ResizeObserver loop|Script error\.?$/.test(message)) return; // browser noise
      void fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: message.slice(0, 1000), page: location.pathname }), keepalive: true }).catch(() => {});
    };
    const onError = (e: ErrorEvent) => send(e.error instanceof Error ? `${e.error.message}\n${(e.error.stack ?? "").split("\n").slice(1, 4).join("\n")}` : e.message);
    const onReject = (e: PromiseRejectionEvent) => send(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => (window.removeEventListener("error", onError), window.removeEventListener("unhandledrejection", onReject));
  }, []);
  return null;
}
