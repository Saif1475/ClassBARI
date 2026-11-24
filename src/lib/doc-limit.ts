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

/** The biggest file a teacher may upload (videos, PDFs). The storage bucket refuses anything bigger. */
export const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300 MB

/** A request's body as text, or null when it is bigger than `max` bytes: stops reading there, even when no length was sent. */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) return void reader.cancel().catch(() => {}), null;
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}
