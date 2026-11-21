// The size limit of one institute's data. No imports, so it can be tested on its own.
export const DOC_MAX = 20_000_000;
export const FULL = "institute data is full";
/**
 * Every request to Supabase goes through here. A save's body is the whole institute as text, so this is where its size
 * is known for free: an oversized one is refused before it is sent (instead of turning the institute into text a second
 * time just to measure it). Files live in storage, so the data itself stays small; this stops any one account from
 * growing it without end. Nothing is changed in the request.
 */
export const guardedFetch: typeof fetch = (input, init) => {
  const body = init?.body;
  if (typeof body === "string" && body.length > DOC_MAX) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/rest/v1/institute_data")) return Promise.reject(new Error(FULL));
  }
  return fetch(input, init);
};
