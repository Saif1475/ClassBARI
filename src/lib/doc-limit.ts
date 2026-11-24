// The size limit of one institute's data. No imports, so it can be tested on its own.
export const DOC_MAX = 20_000_000;
export const FULL = "institute data is full";
/** The biggest /api/data post by hand (a few homework photos), and the biggest restore: a backup is the whole institute sent as one escaped text. /api/data is outside the proxy (src/proxy.ts), which would cut a body at 10 MiB. */
export const POST_MAX = 12_000_000;
// DOC_MAX counts characters but bodies are bytes: escaped again inside JSON, one character is at most 3 bytes (Bangla), plus room for the wrappers.
export const BACKUP_MAX = DOC_MAX * 3 + 1_000_000;
/** How many bytes /api/data reads from this person: only the owner and managers may restore, so only they get the big limit. */
export const postLimit = (role: string) => (role === "owner" || role === "manager" ? BACKUP_MAX : POST_MAX);
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

/** True when an upload request's body says the file is bigger than MAX_FILE_BYTES. A missing size passes: old tabs send no body, and the bucket still enforces the limit. */
export const fileTooBig = (body: string | null) => body === null || Number(/"size"\s*:\s*(\d+)/.exec(body)?.[1] ?? 0) > MAX_FILE_BYTES;

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
