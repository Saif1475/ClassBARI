import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/platform-server";
import { limited } from "@/lib/rate-limit";
import { isBdMobile } from "@/lib/site";

// Landing-page enquiries. Set LEADS_WEBHOOK_URL (Google Apps Script, Make, Zapier…) to forward each lead;
// without it, leads are appended to data/leads.jsonl, which works on a normal server but NOT on Vercel/serverless.
export async function POST(request: Request) {
  const over = limited(request, "leads", 8, 3600_000);
  if (over) return over;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { name, phone, size } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.length > 100) return Response.json({ error: "Invalid name" }, { status: 400 });
  if (typeof phone !== "string" || !isBdMobile(phone)) return Response.json({ error: "Invalid phone" }, { status: 400 });
  if (typeof size !== "string" || size.length > 30) return Response.json({ error: "Invalid size" }, { status: 400 });

  const lead = { name: name.trim(), phone: phone.replace(/[\s-]/g, ""), size, at: new Date().toISOString() };
  try {
    const webhook = process.env.LEADS_WEBHOOK_URL;
    if (webhook) {
      const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
      if (!res.ok) throw new Error(`Webhook answered ${res.status}`);
    } else {
      const dir = path.join(process.cwd(), "data");
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, "leads.jsonl"), JSON.stringify(lead) + "\n");
    }
  } catch (err) {
    console.error("Could not save lead", err);
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

/** Admin list of saved enquiries. Needs `Authorization: Bearer <ADMIN_TOKEN>`. */
export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const text = await readFile(path.join(process.cwd(), "data", "leads.jsonl"), "utf8");
    return Response.json({ leads: text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse() });
  } catch {
    return Response.json({ leads: [] }); // no file yet
  }
}
