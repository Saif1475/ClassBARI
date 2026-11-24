// No imports, so it can be tested on its own. Used by src/proxy.ts for /api, and by /api/data itself (the proxy skips it).
const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
};

/** A change must come from our own pages (the phone apps send no Origin): a second lock on top of the login cookie's SameSite rule. */
export const crossSite = (request: Request) => {
  const origin = request.headers.get("origin");
  return !(request.method === "GET" || request.method === "HEAD" || !origin || hostOf(origin) === request.headers.get("host"));
};
