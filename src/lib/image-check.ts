// Community photos are looked at by our own image checker (the Python service, /moderate) before classmates see them.
// A photo it finds likely to be nudity or sexual, or one it could not check, is held for a teacher to approve.
// shortcut: nudity only; violence or rude text inside a picture is not caught. Add an AI vision check once keys are in.
const OCR_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000";
/** At or above this score (0 to 1) a photo is held. Low on purpose: a wrongly held photo only waits for a teacher. */
export const FLAG_AT = Number(process.env.IMAGE_FLAG_AT) || 0.4;

/** The photos (data URLs) sent with a community post: the old single `image` and the `images` list. */
export function postPhotos(args: unknown[]): string[] {
  const extra = (args[3] ?? {}) as { images?: unknown };
  return [args[2], ...(Array.isArray(extra.images) ? extra.images : [])].filter((x): x is string => typeof x === "string" && x.startsWith("data:image/"));
}

/** Hold the post? True when any photo scores too high, or the checker gave no answer for it. */
export const shouldHold = (scores: (number | null)[]) => scores.some((s) => s === null || s >= FLAG_AT);

/** One photo's score, or null when the checker is off, slow or can't read it. */
async function score(dataUrl: string): Promise<number | null> {
  try {
    const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
    if (!m) return null;
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), "photo");
    const res = await fetch(`${OCR_URL}/moderate`, { method: "POST", body: form, signal: AbortSignal.timeout(Number(process.env.IMAGE_CHECK_TIMEOUT_MS) || 15_000) });
    const d = res.ok ? ((await res.json()) as { nsfw?: unknown }) : null;
    return typeof d?.nsfw === "number" ? d.nsfw : null;
  } catch {
    return null;
  }
}

/** Should this community post wait for a teacher? (No photos: no.) */
export async function holdPost(args: unknown[]) {
  const photos = postPhotos(args);
  return photos.length > 0 && shouldHold(await Promise.all(photos.map(score)));
}
