"use client";
import { REAL_AUTH } from "./auth-mode";
import { clearRole } from "./role";
import { supabaseLater } from "./supabase/later";

/** Log out of this browser: the real Supabase session (if any) and the UI role hint. Phones and other computers stay logged in. */
export async function logOut() {
  clearRole();
  // AI chats and the last view of the dashboard are kept on the device: don't leave them for the next person on a shared phone or computer.
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("edunest-ai-chats-") || key.startsWith("edunest-last-view-")) localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing was kept anyway */
  }
  if (REAL_AUTH) await (await supabaseLater()).auth.signOut({ scope: "local" }); // this device only: logging out on a shared computer must not log the student out of their phone
}
