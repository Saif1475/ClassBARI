// Public pages with real accounts: joining a batch, pricing a coupon and sending a bKash order go to the server.
export async function publicPost(body: Record<string, unknown>): Promise<{ ok: boolean; price?: number; code?: string; error?: string }> {
  try {
    const res = await fetch("/api/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, ...(await res.json().catch(() => ({}))) };
  } catch {
    return { ok: false };
  }
}
