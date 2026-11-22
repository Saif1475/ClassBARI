import type { Instrumentation } from "next";

/** Server start: anything the code logs as an error is also recorded and alerted (see lib/alerts.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { report } = await import("./lib/alerts");
  const log = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    log(...args);
    const err = args.find((a) => a instanceof Error);
    void report(typeof args[0] === "string" ? args[0] : "server", err ?? args.slice(1).map(String).join(" "));
  };
  // Timed notifications (absent after 15 minutes, due tomorrow, fee, AI pack): every 5 minutes, real accounts only.
  if (process.env.NEXT_PUBLIC_AUTH_MODE === "supabase" && process.env.NOTIFY_TIMER !== "off") {
    const { runTimed } = await import("./lib/notify-server");
    setInterval(() => void runTimed().catch((e) => console.error("notify timer:", e instanceof Error ? e.message : e)), 5 * 60_000).unref();
  }
}

/** A page or API route crashed. */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { report } = await import("./lib/alerts");
  await report(`${request.method} ${request.path.split("?")[0]}`, err);
};
