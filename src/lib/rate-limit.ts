// Slows down abuse (spam sign-ups, guessing codes, flooding): at most `max` requests per `windowMs` for one key.
// No imports: also loaded by scripts/rate-limit.test.mjs.
// shortcut: counted in this server's memory, so it resets on restart and isn't shared between servers; move to Redis if we run several.
type Hit = { n: number; reset: number };
let lastSweep = -Infinity;
const hits = ((globalThis as { __classbariHits?: Map<string, Hit> }).__classbariHits ??= new Map<string, Hit>());
const guards = ((globalThis as { __classbariGuards?: Map<string, Hit> }).__classbariGuards ??= new Map<string, Hit>()); // the admin-guess lockout lives apart, so a flood of other keys can never push it out

/** Counts one more use of `key` (or `add = 0` to only look) and says whether it is over `max` for the current window. */
export function tooMany(key: string, max: number, windowMs: number, now = Date.now(), add = 1) {
  const map = key.startsWith("admin-fail:") ? guards : hits;
  const h = map.get(key);
  if (!h || h.reset <= now) {
    if ((hits.size > 20_000 || guards.size > 20_000) && Math.abs(now - lastSweep) > 1000) { lastSweep = now; for (const m of [hits, guards]) for (const [k, v] of m) if (v.reset <= now) m.delete(k); } // at most once a second: a scan per request would be slow under a flood
    if (!h && map.size >= 50_000) {
      if (map === guards) return true; // full of admin guesses from many addresses: refuse (a look too) rather than let a new address guess uncounted
      if (add) hits.delete(hits.keys().next().value as string); // full under a flood: forget the oldest counter, so the site keeps working for everyone else
    }
    if (!add) return false;
    map.set(key, { n: add, reset: now + windowMs });
    return add > max;
  }
  h.n += add;
  return h.n > max;
}

/**
 * The visitor's address: Cloudflare's header only when the site really is behind Cloudflare (BEHIND_CLOUDFLARE=1;
 * otherwise anyone could send that header and dodge the limits), else the reverse proxy's: the LAST entry of
 * X-Forwarded-For, the one our own proxy appended (the entries before it are whatever the sender wrote).
 */
export const clientIp = (request: Request) =>
  per64((process.env.BEHIND_CLOUDFLARE === "1" && request.headers.get("cf-connecting-ip")) || request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local");

/** An IPv6 address cut to its /64: one home or VM owns the whole /64, so each of its 2^64 addresses must share one limit. */
function per64(ip: string) {
  if (!ip.includes(":") || ip.includes(".")) return ip; // IPv4 (and IPv4-mapped IPv6) stays as it is
  const [head, tail] = ip.toLowerCase().split("%")[0].split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const groups = tail === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b]; // fill in the "::" gap to 8 groups
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** A "too many requests" answer when this visitor (or `who`) is over the limit for `name`; null when fine. */
export function limited(request: Request, name: string, max: number, windowMs: number, who?: string) {
  if (process.env.RATE_LIMIT_OFF) return null; // the automated browser tests hammer the same routes from one address
  return tooMany(`${name}:${who ?? clientIp(request)}`, max, windowMs) ? Response.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }) : null;
}
