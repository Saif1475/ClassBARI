import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Supabase for route handlers / server code, acting as the signed-in person (their login cookie). */
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(URL(), KEY(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* called from a place that can't set cookies; the proxy refreshes the session instead */
        }
      },
    },
  });
}

/** Same, from a plain Request (API routes that only read the session). */
export function supabaseFromRequest(request: Request) {
  return createServerClient(URL(), KEY(), {
    cookies: { getAll: () => parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({ name: c.name, value: c.value ?? "" })), setAll: () => {} },
  });
}

/** The signed-in person's roles from the database (empty if not signed in or not enrolled anywhere). */
export async function rolesOf(supabase: ReturnType<typeof supabaseFromRequest>) {
  const { data: auth } = await supabase.auth.getUser(); // checks the token with Supabase, not just the cookie
  if (!auth.user) return [];
  const { data } = await supabase.rpc("my_access");
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}
