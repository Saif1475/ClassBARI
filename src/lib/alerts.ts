// Error monitoring: every server error (and errors browsers report) is written to data/errors.jsonl, listed in the
// admin panel, and sent to the founders' chat (ALERT_WEBHOOK_URL: a Discord, Slack or Telegram webhook address).
// shortcut: a file on this server and our own webhook, no outside monitoring service; move to Sentry if this outgrows it.
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ErrorEntry = { at: string; where: string; message: string };
const FILE = () => path.join(process.cwd(), "data", "errors.jsonl");
const QUIET_MS = 10 * 60_000; // the same error alerts at most once in this long (it is still logged every time)

/** Keys, tokens, passwords, emails and phone numbers never go into the log or the alert. */
export const scrub = (text: string) =>
  text
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+/g, "[key]")
    .replace(/postgres(ql)?:\/\/\S+/g, "[database address]")
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(?:\+?88)?01[3-9]\d{8}/g, "[phone]")
    .slice(0, 600);

const lastAlert = new Map<string, { at: number; skipped: number }>();
/** Should this error alert now? Repeats inside the quiet time are counted, not sent. */
export function shouldAlert(key: string, now = Date.now()) {
  const seen = lastAlert.get(key);
  if (seen && now - seen.at < QUIET_MS) return (seen.skipped++, null);
  const skipped = seen?.skipped ?? 0;
  if (lastAlert.size > 500) lastAlert.clear();
  lastAlert.set(key, { at: now, skipped: 0 });
  return { skipped };
}

const MAX_BYTES = 1_000_000; // about 3,000 errors
/** The log keeps its newest half once it passes MAX_BYTES, so it can't fill the disk or slow the admin page down. */
async function trim() {
  if ((await stat(FILE())).size <= MAX_BYTES) return;
  const lines = (await readFile(FILE(), "utf8")).trimEnd().split("\n");
  await writeFile(FILE(), lines.slice(lines.length >> 1).join("\n") + "\n");
}

/** Log an error and alert the founders. Never throws: monitoring must not break the app. */
export async function report(where: string, err: unknown) {
  try {
    const entry: ErrorEntry = { at: new Date().toISOString(), where: scrub(where).slice(0, 120), message: scrub(err instanceof Error ? `${err.message}${err.stack ? `\n${err.stack.split("\n").slice(1, 4).join("\n")}` : ""}` : String(err)) };
    await mkdir(path.dirname(FILE()), { recursive: true });
    await appendFile(FILE(), JSON.stringify(entry) + "\n");
    await trim();
    const hook = process.env.ALERT_WEBHOOK_URL;
    const go = hook ? shouldAlert(`${entry.where}|${entry.message.split("\n")[0]}`) : null;
    if (!hook || !go) return;
    const text = `🚨 ClassBARI error\n${entry.where}\n${entry.message}${go.skipped ? `\n(+${go.skipped} more of the same since the last alert)` : ""}`;
    // One body that Discord ("content"), Slack and Telegram ("text") all accept.
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1900), text: text.slice(0, 1900) }), signal: AbortSignal.timeout(5000) });
  } catch {
    /* nothing more we can do */
  }
}

/** The newest errors first, for the admin panel. */
export async function recentErrors(n = 50): Promise<ErrorEntry[]> {
  const raw = await readFile(FILE(), "utf8").catch(() => "");
  return raw.trim().split("\n").slice(-n).reverse().flatMap((line) => {
    try {
      return [JSON.parse(line) as ErrorEntry];
    } catch {
      return [];
    }
  });
}
