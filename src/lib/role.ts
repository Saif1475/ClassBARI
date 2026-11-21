// Demo session: the chosen role is kept in a cookie so src/proxy.ts can guard the app pages.
// shortcut: anyone can set this cookie, so it is not security; replace with Supabase Auth sessions.
export type Role = "student" | "teacher" | "institute" | "parent";
export const ROLE_COOKIE = "edunest-role";

export const setRole = (r: Role) => {
  document.cookie = `${ROLE_COOKIE}=${r}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
};
export const clearRole = () => {
  document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
};
export const getRole = (): Role | null => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${ROLE_COOKIE}=(student|teacher|institute|parent)`));
  return (m?.[1] as Role) ?? null;
};
