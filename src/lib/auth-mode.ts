// "supabase" = real accounts (Google for students/guardians, email + password for staff).
// Anything else = the demo login (role cookie). Set NEXT_PUBLIC_AUTH_MODE=supabase in .env.local; the automated
// tests build with NEXT_PUBLIC_AUTH_MODE=demo so they keep using the demo data.
export const REAL_AUTH = process.env.NEXT_PUBLIC_AUTH_MODE === "supabase";
