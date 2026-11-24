// Live class hub: everything around the video for one batch's class — who joined (attendance), raised hands,
// chat, questions with upvotes, reactions and the teacher's live whiteboard picture.
// Pure rules (scripts/live-class.test.mjs); the server keeps sessions in memory (src/app/api/class/route.ts).

export const REACTIONS = ["👍", "❤️", "😂", "👏", "❓"] as const;
export const CHAT_MAX = 300;
export const KEEP_CHAT = 300;
export const BOARD_MAX_CHARS = 600_000; // ~450 KB JPEG data URL
const MAX_JOINED = 2000; // devices counted in one class (the session lives in the server's memory)
const MAX_DEVICES = 5; // devices one signed-in student may join with (device ids are made up by the sender)
const REACTION_SHOW_MS = 8000;

export type Viewer = { voter?: string; staff: boolean; own?: { id: number; name: string }[] }; // own: set for signed-in non-staff, the only students they may be
type Who = { voter: string; name: string };
export type Session = {
  batch: string;
  topic: string;
  teacher: string;
  room: string; // secret video-room name, chosen by the teacher's device and shared with everyone who joins
  startedAt: number;
  joined: Record<string, { name: string; studentId?: number; at: number }>;
  hands: (Who & { at: number })[];
  chat: { id: number; name: string; teacher: boolean; text: string; at: number; voter?: string }[];
  questions: { id: number; name: string; voter: string; text: string; votes: string[]; answered: boolean; at: number }[];
  reactions: { emoji: string; at: number }[];
  board?: { img: string; at: number };
  lastChat: Record<string, number>; // voter -> time of their last message (slow down spam)
  nextId: number;
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const voterOk = (v: unknown): v is string => typeof v === "string" && /^[\w-]{8,64}$/.test(v);

export function startSession(input: Record<string, unknown>, now: number): Session | { error: string } {
  const batch = str(input.batch, 120), topic = str(input.topic, 160) ?? "Live class", teacher = str(input.teacher, 80) ?? "Teacher";
  if (!batch) return { error: "bad batch" };
  if (typeof input.room !== "string" || !/^(Instanton|ClassBARI)-[0-9a-f]{32}$/.test(input.room)) return { error: "bad room" }; // ClassBARI-: rooms made before the rename
  return { batch, topic, teacher, room: input.room, startedAt: now, joined: {}, hands: [], chat: [], questions: [], reactions: [], lastChat: {}, nextId: 1 };
}

/** One student action. Staff-only actions are checked by the caller (lowerHand, answered, deleteChat, board). */
export function act(s: Session, a: Record<string, unknown>, viewer: Viewer, now: number): { ok: true } | { error: string } {
  const voter = viewer.voter;
  // Signed-in students: name and student id come from their own record, never from the device (else anyone could mark a classmate present).
  const mine = viewer.own && (viewer.own.find((p) => p.id === a.studentId) ?? viewer.own[0]);
  const name = viewer.own ? (mine?.name ?? null) : str(a.name, 80);
  // Join this device (once). Students may only hand, chat, ask and vote from a joined device, so made-up device ids are capped.
  const enter = (): "ok" | "bad" | "too many" => {
    if (!voterOk(voter)) return "bad";
    if (s.joined[voter]) return "ok";
    if (!name) return "bad";
    const studentId = viewer.own ? mine?.id : Number.isInteger(a.studentId) ? (a.studentId as number) : undefined;
    if (viewer.own && Object.values(s.joined).filter((j) => j.studentId === studentId).length >= MAX_DEVICES) return "too many";
    if (Object.keys(s.joined).length >= MAX_JOINED) return "too many";
    s.joined[voter] = { name, studentId, at: now };
    return "ok";
  };
  const entered = a.action === "join" || (!viewer.staff && ["hand", "chat", "ask", "vote"].includes(a.action as string)) ? enter() : "ok";
  if (entered === "too many") return { error: "too many" };
  switch (a.action) {
    case "join": {
      if (entered !== "ok") return { error: "bad join" };
      return { ok: true };
    }
    case "hand": {
      if (entered !== "ok" || !voterOk(voter) || !name) return { error: "bad hand" };
      s.hands = s.hands.filter((h) => h.voter !== voter);
      if (a.up) s.hands.push({ voter, name, at: now });
      return { ok: true };
    }
    case "lowerHand":
      s.hands = s.hands.filter((h) => h.voter !== a.voter);
      return { ok: true };
    case "chat": {
      const text = str(a.text, CHAT_MAX);
      if (!text || !name || (!viewer.staff && (!voterOk(voter) || entered !== "ok"))) return { error: "bad message" };
      const who = mine ? `s${mine.id}` : voter; // a signed-in student's slow-down holds across all their devices
      if (!viewer.staff && now - (s.lastChat[who!] ?? 0) < 1500) return { error: "too fast" };
      if (who) s.lastChat[who] = now;
      s.chat.push({ id: s.nextId++, name, teacher: viewer.staff, text, at: now, voter });
      if (s.chat.length > KEEP_CHAT) s.chat.splice(0, s.chat.length - KEEP_CHAT);
      return { ok: true };
    }
    case "deleteChat":
      s.chat = s.chat.filter((m) => m.id !== a.id);
      return { ok: true };
    case "ask": {
      const text = str(a.text, CHAT_MAX);
      if (!voterOk(voter) || entered !== "ok" || !text || !name) return { error: "bad question" };
      if (s.questions.filter((q) => q.voter === voter && !q.answered).length >= 3 || s.questions.length >= 500) return { error: "too many" };
      s.questions.push({ id: s.nextId++, name, voter, text, votes: [voter], answered: false, at: now });
      return { ok: true };
    }
    case "vote": {
      const q = s.questions.find((x) => x.id === a.id);
      if (!q || !voterOk(voter) || entered !== "ok") return { error: "bad vote" };
      q.votes = q.votes.includes(voter) ? q.votes.filter((v) => v !== voter) : [...q.votes, voter];
      return { ok: true };
    }
    case "answered": {
      const q = s.questions.find((x) => x.id === a.id);
      if (!q) return { error: "bad question" };
      q.answered = !q.answered;
      return { ok: true };
    }
    case "react": {
      if (!voterOk(voter) || !REACTIONS.includes(a.emoji as (typeof REACTIONS)[number])) return { error: "bad reaction" };
      s.reactions = [...s.reactions.filter((r) => now - r.at < REACTION_SHOW_MS), { emoji: a.emoji as string, at: now }].slice(-60);
      return { ok: true };
    }
    case "board": {
      if (typeof a.img !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(a.img) || a.img.length > BOARD_MAX_CHARS) return { error: "bad board" };
      s.board = { img: a.img, at: now };
      return { ok: true };
    }
    case "clearBoard":
      s.board = undefined;
      return { ok: true };
  }
  return { error: "unknown action" };
}

/**
 * What one viewer gets. The board picture is only sent when it's newer than the one they have (saves data on
 * slow connections); students don't see who else is in the room or other students' device ids.
 */
export function viewOf(s: Session, viewer: Viewer, boardSince: number, now: number) {
  return {
    batch: s.batch,
    topic: s.topic,
    teacher: s.teacher,
    room: s.room,
    startedAt: s.startedAt,
    joinedCount: Object.keys(s.joined).length,
    joined: viewer.staff ? Object.entries(s.joined).map(([voter, j]) => ({ voter, ...j })) : undefined,
    hands: viewer.staff ? s.hands : undefined,
    myHand: !!viewer.voter && s.hands.some((h) => h.voter === viewer.voter),
    handsCount: s.hands.length,
    chat: s.chat.slice(-80).map(({ voter, ...m }) => ({ ...m, mine: !!viewer.voter && voter === viewer.voter })),
    questions: [...s.questions]
      .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes.length - a.votes.length || a.at - b.at)
      .map(({ voter, votes, ...q }) => ({ ...q, votes: votes.length, myVote: !!viewer.voter && votes.includes(viewer.voter), mine: voter === viewer.voter })),
    reactions: s.reactions.filter((r) => now - r.at < REACTION_SHOW_MS),
    boardAt: s.board?.at ?? 0,
    board: s.board && s.board.at > boardSince ? s.board.img : undefined,
  };
}
