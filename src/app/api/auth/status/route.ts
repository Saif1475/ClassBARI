import { REAL_AUTH } from "@/lib/auth-mode";
import { admin } from "@/lib/data-server";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Login, step one: { email } → { state: "password" | "google" | "new" | "unknown" }.
 * "new" covers both "no account yet" and "not confirmed yet", and says nothing about being enrolled anywhere.
 * It does tell a caller whether an address has an account, so it is limited per visitor address.
 */
export async function POST(request: Request) {
  if (!REAL_AUTH) return Response.json({ error: "demo mode" }, { status: 404 });
  const over = limited(request, "auth-status", 30, 600_000);
  if (over) return over;
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return Response.json({ error: "bad request" }, { status: 400 });
  // One address can't be probed again and again from many places: after a few looks it just gets the plain password screen.
  if (limited(request, "auth-status-email", 6, 3600_000, email)) return Response.json({ state: "unknown" });
  const { data, error } = await admin().rpc("account_state", { p_email: email });
  // Migration 0009 not applied yet (or the database is busy): the login page falls back to the plain form.
  return Response.json({ state: error || typeof data !== "string" ? "unknown" : data });
}
