// Student community: an institute's own feed (posts, likes, comments) and friendships between its students.
// Pure rules (scripts/community.test.mjs); the data lives in the LMS store.

export type Author = number | "teacher"; // student id, or the teacher / institute
export type CommunityComment = { id: number; author: Author; text: string; at: string };
export type Audience = "all" | "batch" | "friends"; // who may see a post: the whole institute, the author's batch, their friends
/** votes: student id → option picked (the server sends each student only their own vote, plus counts). */
export type Poll = { options: string[]; votes: Record<number, number>; counts?: number[] };
export type PostFile = { name: string; url: string };
export type CommunityPost = {
  id: number;
  author: Author;
  text: string;
  image?: string; // older posts: one photo
  images?: string[]; // up to MAX_IMAGES photos
  file?: PostFile; // a PDF (notes, question paper)
  poll?: Poll;
  audience?: Audience; // none: everyone
  batch?: string; // the author's batch when posting (for "my batch" posts)
  edited?: string; // when the author last changed the text
  at: string;
  likes: number[]; // student ids
  comments: CommunityComment[];
  reports: number[]; // students who reported it
  pinned?: boolean;
  hidden?: boolean; // removed by a teacher (kept so it can be restored)
  held?: boolean; // its photo was flagged by the automatic check (or couldn't be checked): only the author and staff see it until a teacher approves
};
export type Friendship = { from: number; to: number; status: "pending" | "friends" };
/** A student's own community settings. Only bio and the two "find me" choices are shown to others; the rest is private. */
export type CommunityProfile = {
  bio?: string;
  audience?: Audience; // who sees my new posts by default
  requests?: "all" | "batch" | "none"; // who may send me friend requests
  hidden?: boolean; // leave me out of the People search
  muted?: number[]; // their posts don't show in my feed (they aren't told)
  blocked?: number[]; // we can't see each other's posts, comment or be friends
  saved?: number[]; // bookmarked post ids
};
export type FriendStatus = "none" | "sent" | "received" | "friends";

export const POST_MAX = 2000;
export const COMMENT_MAX = 500;
export const BIO_MAX = 160;
export const MAX_IMAGES = 4;
export const POLL_OPTION_MAX = 80;
export const AUDIENCES: Audience[] = ["all", "batch", "friends"];

type Profiles = Record<number, CommunityProfile> | undefined;
const blockedBetween = (profiles: Profiles, a: number, b: number) => !!profiles?.[a]?.blocked?.includes(b) || !!profiles?.[b]?.blocked?.includes(a);

type Seer = { student?: number; staff?: boolean; batch?: string };
const sees = (p: CommunityPost, viewer: Seer, isFriend: (id: number) => boolean, profiles: Profiles) => {
  if (viewer.staff) return true;
  if (p.hidden || viewer.student === undefined) return false;
  if (p.author === "teacher" || p.author === viewer.student) return true;
  if (p.held) return false; // waiting for a teacher to look at its photo
  if (blockedBetween(profiles, viewer.student, p.author)) return false;
  if (p.audience === "friends") return isFriend(p.author);
  if (p.audience === "batch") return !!p.batch && p.batch === viewer.batch;
  return true;
};
/** May this viewer see the post at all? Checked on the server for every student, and again on screen. */
export const canSee = (p: CommunityPost, viewer: Seer, all: Friendship[], profiles: Profiles) =>
  sees(p, viewer, (id) => friendStatus(all, viewer.student!, id) === "friends", profiles);
/** The same question for a whole feed: the viewer's friends are worked out once, then each post is a quick look-up. */
export function seer(viewer: Seer, all: Friendship[], profiles: Profiles) {
  const friends = viewer.student !== undefined ? new Set(friendsOf(all, viewer.student)) : new Set<number>();
  return (p: CommunityPost) => sees(p, viewer, (id) => friends.has(id), profiles);
}

/** May `me` send `other` a friend request? Their setting decides; a block (either way) means no. */
export function canRequest(profiles: Profiles, batches: { me?: string; other?: string }, me: number, other: number) {
  if (me === other || blockedBetween(profiles, me, other)) return false;
  const rule = profiles?.[other]?.requests ?? "all";
  return rule === "all" || (rule === "batch" && !!batches.me && batches.me === batches.other);
}

/** #hashtags in a post, lower-case, English or Bangla. */
export const tagsOf = (text: string) => [...new Set((text.match(/#[\p{L}\p{M}\p{N}_]{2,40}/gu) ?? []).map((t) => t.toLowerCase()))];
/** The most used hashtags in these posts. */
export function trending(posts: CommunityPost[], n = 6) {
  const count = new Map<string, number>();
  for (const p of posts) for (const t of tagsOf(p.text)) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([tag, uses]) => ({ tag, uses }));
}
/** Vote counts per option. */
export const pollCounts = (poll: Poll) => poll.counts ?? poll.options.map((_, i) => Object.values(poll.votes).filter((v) => v === i).length);
/** What a student is sent about a poll: the counts and only their own vote. */
export const pollFor = (poll: Poll, me: number | undefined): Poll => ({ options: poll.options, counts: pollCounts(poll), votes: me !== undefined && poll.votes[me] !== undefined ? { [me]: poll.votes[me] } : {} });

/** Trimmed text if it's acceptable, otherwise null. */
export const cleanText = (text: string, max: number) => {
  const t = text.trim();
  return t && t.length <= max ? t : null;
};

const pair = (f: Friendship, a: number, b: number) => (f.from === a && f.to === b) || (f.from === b && f.to === a);

export function friendStatus(all: Friendship[], me: number, other: number): FriendStatus {
  const f = all.find((x) => pair(x, me, other));
  if (!f) return "none";
  if (f.status === "friends") return "friends";
  return f.from === me ? "sent" : "received";
}

export const friendsOf = (all: Friendship[], me: number) =>
  all.filter((f) => f.status === "friends" && (f.from === me || f.to === me)).map((f) => (f.from === me ? f.to : f.from));

/** Send a request; if the other student already asked, this accepts it instead. Never to yourself or twice. */
export function requestFriend(all: Friendship[], me: number, other: number): Friendship[] {
  if (me === other) return all;
  const s = friendStatus(all, me, other);
  if (s === "received") return all.map((f) => (pair(f, me, other) ? { ...f, status: "friends" } : f));
  if (s !== "none") return all;
  return [...all, { from: me, to: other, status: "pending" }];
}

/** Accept or decline a request I received; also used to unfriend / cancel (accept = false). */
export function answerFriend(all: Friendship[], me: number, other: number, accept: boolean): Friendship[] {
  if (accept) return friendStatus(all, me, other) === "received" ? all.map((f) => (pair(f, me, other) ? { ...f, status: "friends" } : f)) : all;
  return all.filter((f) => !pair(f, me, other));
}

/**
 * A student's timeline: only posts they may see, without people they muted; "friends" keeps friends' and teacher posts,
 * "saved" their bookmarks; `query` matches words, names (via `nameOf`) and #tags.
 */
export function timeline(
  posts: CommunityPost[],
  all: Friendship[],
  profiles: Profiles,
  viewer: { student?: number; staff?: boolean; batch?: string },
  opts: { filter?: "all" | "friends" | "saved"; query?: string; author?: Author; nameOf?: (a: Author) => string } = {},
) {
  const me = viewer.student;
  const mine = me !== undefined ? profiles?.[me] : undefined;
  const q = opts.query?.trim().toLowerCase() ?? "";
  const visible = seer(viewer, all, profiles);
  return feedFor(posts, all, viewer, opts.filter === "friends" ? "friends" : "all")
    .filter(visible)
    .filter((p) => viewer.staff || typeof p.author !== "number" || !mine?.muted?.includes(p.author) || opts.author === p.author)
    .filter((p) => opts.filter !== "saved" || !!mine?.saved?.includes(p.id))
    .filter((p) => opts.author === undefined || p.author === opts.author)
    .filter((p) => !q || p.text.toLowerCase().includes(q) || !!opts.nameOf?.(p.author).toLowerCase().includes(q) || !!p.file?.name.toLowerCase().includes(q));
}

/**
 * What a viewer sees: pinned first, then newest. Students never see removed posts;
 * "friends" shows only my friends' posts and my own (teacher posts always show).
 */
export function feedFor(posts: CommunityPost[], all: Friendship[], viewer: { student?: number; staff?: boolean }, filter: "all" | "friends" = "all") {
  const friends = viewer.student !== undefined ? new Set(friendsOf(all, viewer.student)) : new Set<number>();
  return posts
    .filter((p) => viewer.staff || !p.hidden)
    .filter((p) => filter === "all" || p.author === "teacher" || p.author === viewer.student || friends.has(p.author as number))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at.localeCompare(a.at));
}
