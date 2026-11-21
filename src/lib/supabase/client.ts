"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Supabase in the browser (uses the publishable key; the database's security rules decide what it can see). */
export const supabaseBrowser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
