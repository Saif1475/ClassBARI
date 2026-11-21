"use client";
// The institute picked on the login screen ("Find your institute"). Kept in this browser; the cookie tells the
// server which institute to sign in to (see chosenInstitute in data-server.ts). Not a secret.
export type InstituteCard = { id: string; name: string; code: string };
const KEY = "classbari-institute";

export function getInstitute(): InstituteCard | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as InstituteCard | null;
    return v?.id ? v : null;
  } catch {
    return null;
  }
}

export function setInstitute(i: InstituteCard | null) {
  if (i) {
    localStorage.setItem(KEY, JSON.stringify(i));
    document.cookie = `${KEY}=${i.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } else {
    localStorage.removeItem(KEY);
    document.cookie = `${KEY}=; path=/; max-age=0`;
  }
}
