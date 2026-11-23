// Messages (guardian ↔ teacher, student ↔ teacher): the rules both the website and the server use, WhatsApp-style.
import type { ChatMessage, ChatThread } from "./mock-data.ts";

export type Side = "family" | "staff";
/** The reactions offered on a message (one per side). */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
export const EDIT_MINUTES = 15; // as WhatsApp: a sent message can be corrected for 15 minutes
export const DELETE_HOURS = 48; // and taken back for everyone for two days
export const TEXT_MAX = 2000;

/** Who wrote it: the student or guardian (mine: true), or the teacher's side. */
export const sideOf = (m: ChatMessage): Side => (m.mine ? "family" : "staff");
const age = (m: ChatMessage, now: number) => now - Date.parse(m.at);
export const canEdit = (m: ChatMessage, now = Date.now()) => !m.deleted && !m.photo && age(m, now) < EDIT_MINUTES * 60_000;
export const canDelete = (m: ChatMessage, now = Date.now()) => !m.deleted && age(m, now) < DELETE_HOURS * 3_600_000;

/** Ticks on my message: one grey (sent), two blue (the other side has opened the chat since). */
export const seen = (t: ChatThread, m: ChatMessage) => {
  const read = sideOf(m) === "family" ? t.readStaff : t.readFamily;
  return !!read && read >= m.at;
};
/** Messages from the other side that this side hasn't opened yet. */
export const unreadFor = (t: ChatThread, side: Side) =>
  side === "staff" ? t.unread : t.messages.filter((m) => sideOf(m) === "staff" && !m.deleted && (!t.readFamily || m.at > t.readFamily)).length;

/** A short line for the chat list and a reply's quote. */
export const preview = (m: ChatMessage | undefined, words: { photo: string; deleted: string }) =>
  !m ? "" : m.deleted ? words.deleted : m.photo ? `📷 ${m.text || words.photo}` : m.text;

/** The day a message belongs to (local time), for the "Today / Yesterday / date" dividers. */
export const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
