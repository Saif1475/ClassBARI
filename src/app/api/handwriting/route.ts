import { REAL_AUTH } from "@/lib/auth-mode";
import { whoIs } from "@/lib/data-server";
import { readPlatform } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";
// Forwards a handwriting photo to the local OCR service (ocr-service/, see README) so the
// browser never talks to it directly. Set OCR_SERVICE_URL when it runs elsewhere.
const OCR_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await readPlatform()).flags.handwriting) return Response.json({ error: "switched off" }, { status: 403 });
  // Reading handwriting keeps a processor busy for seconds: signed-in people only, and not too often.
  const me = REAL_AUTH ? await whoIs(request) : null;
  if (REAL_AUTH && !me) return Response.json({ error: "sign in" }, { status: 401 });
  const over = limited(request, "handwriting", 20, 600_000, me ? `${me.institute}:${me.who.studentIds[0] ?? me.who.email}` : undefined);
  if (over) return over;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a form upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ error: "Expected an image" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Image too large" }, { status: 413 });

  const out = new FormData();
  out.append("file", file, file.name || "photo.jpg");
  try {
    const res = await fetch(`${OCR_URL}/handwriting`, { method: "POST", body: out, signal: AbortSignal.timeout(180_000) });
    const body = await res.json().catch(() => ({ error: "Bad reply from OCR service" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "OCR service is not running" }, { status: 503 });
  }
}
