import { NextResponse } from "next/server";
import { safeNext } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

/** Google sign-in, email-confirmation links and password-reset links come back here with a one-time code. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin)); // expired / already-used link
}
