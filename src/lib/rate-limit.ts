// Slows down abuse (spam sign-ups, guessing codes, flooding): at most `max` requests per `windowMs` for one key.
// No imports: also loaded by scripts/rate-limit.test.mjs.
// shortcut: counted in this server's memory, so it resets on restart and isn't shared between servers; move to Redis if we run several.
type Hit = { n: number; reset: number };
const hits = ((globalThis as { __classbariHits?: Map<string, Hit> }).__classbariHits ??= new Map<string, Hit>());

/** Counts one more use of `key` (or `add = 0` to only look) and says whether it is over `max` for the current window. */
export function tooMany(key: string, max: number, windowMs: number, now = Date.now(), add = 1) {
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    if (!add) return false;
    if (hits.size > 20_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    if (hits.size > 50_000) hits.clear(); // under a flood from many addresses: forget rather than run out of memory
    hits.set(key, { n: add, reset: now + windowMs });
    return add > max;
  }
  h.n += add;
  return h.n > max;
}

/** The visitor's address: Cloudflare's header in production, the reverse proxy's otherwise. */
export const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

/** A "too many requests" answer when this visitor (or `who`) is over the limit for `name`; null when fine. */
export function limited(request: Request, name: string, max: number, windowMs: number, who?: string) {
  if (process.env.RATE_LIMIT_OFF) return null; // the automated browser tests hammer the same routes from one address
  return tooMany(`${name}:${who ?? clientIp(request)}`, max, windowMs) ? Response.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }) : null;
}
