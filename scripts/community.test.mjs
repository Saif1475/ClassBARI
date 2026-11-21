// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { answerFriend, cleanText, feedFor, friendStatus, friendsOf, requestFriend } from "../src/lib/community.ts";

test("friend requests: send, see it on the other side, accept; no duplicates or self-requests", () => {
  let f = requestFriend([], 1, 2);
  assert.equal(friendStatus(f, 1, 2), "sent");
  assert.equal(friendStatus(f, 2, 1), "received");
  assert.equal(requestFriend(f, 1, 2).length, 1); // asking twice changes nothing
  assert.deepEqual(requestFriend(f, 3, 3), f);
  f = answerFriend(f, 2, 1, true);
  assert.equal(friendStatus(f, 1, 2), "friends");
  assert.deepEqual(friendsOf(f, 2), [1]);
  assert.deepEqual(answerFriend(f, 1, 2, false), []); // unfriend
});

test("asking someone who already asked you makes you friends", () => {
  const f = requestFriend(requestFriend([], 1, 2), 2, 1);
  assert.equal(friendStatus(f, 1, 2), "friends");
  assert.equal(answerFriend(requestFriend([], 1, 2), 1, 2, true)[0].status, "pending"); // can't accept your own request
});

test("feed: pinned first then newest; removed posts hidden from students; friends filter", () => {
  const post = (id, author, at, extra = {}) => ({ id, author, text: "x", at, likes: [], comments: [], reports: [], ...extra });
  const posts = [post(1, 2, "2026-11-01"), post(2, 3, "2026-11-03"), post(3, "teacher", "2026-10-01", { pinned: true }), post(4, 2, "2026-11-04", { hidden: true }), post(5, 1, "2026-11-02")];
  const friends = [{ from: 1, to: 2, status: "friends" }];
  assert.deepEqual(feedFor(posts, friends, { student: 1 }).map((p) => p.id), [3, 2, 5, 1]);
  assert.deepEqual(feedFor(posts, friends, { student: 1 }, "friends").map((p) => p.id), [3, 5, 1]);
  assert.deepEqual(feedFor(posts, friends, { staff: true }).map((p) => p.id), [3, 4, 2, 5, 1]);
});

test("post text: trimmed, not empty, not too long", () => {
  assert.equal(cleanText("  hi  ", 10), "hi");
  assert.equal(cleanText("   ", 10), null);
  assert.equal(cleanText("x".repeat(11), 10), null);
});

test("hashtags, trending and search in the timeline", async () => {
  const { tagsOf, trending, timeline } = await import("../src/lib/community.ts");
  assert.deepEqual(tagsOf("Revise #Physics and #পদার্থ today #physics"), ["#physics", "#পদার্থ"]);
  const posts = [
    { id: 1, author: 2, text: "#physics test", at: "2026-01-02", likes: [], comments: [], reports: [] },
    { id: 2, author: 3, text: "#physics again #math", at: "2026-01-01", likes: [], comments: [], reports: [] },
  ];
  assert.deepEqual(trending(posts).map((t) => t.tag), ["#physics", "#math"]);
  assert.deepEqual(timeline(posts, [], { 1: { muted: [3] } }, { student: 1 }).map((p) => p.id), [1]); // muted
  assert.deepEqual(timeline(posts, [], {}, { student: 1 }, { query: "#math" }).map((p) => p.id), [2]);
  assert.deepEqual(timeline(posts, [], { 1: { saved: [2] } }, { student: 1 }, { filter: "saved" }).map((p) => p.id), [2]);
});

test("a post whose photo was flagged is seen only by its author and staff until approved", async () => {
  const { canSee } = await import("../src/lib/community.ts");
  const { postPhotos, shouldHold, FLAG_AT } = await import("../src/lib/image-check.ts");
  const p = { id: 1, author: 2, text: "", images: ["/api/files/x"], at: "", likes: [], comments: [], reports: [], held: true };
  assert.equal(canSee(p, { student: 3 }, [], {}), false);
  assert.equal(canSee(p, { student: 2 }, [], {}), true); // its author
  assert.equal(canSee(p, { staff: true }, [], {}), true);
  assert.equal(canSee({ ...p, held: undefined }, { student: 3 }, [], {}), true); // approved
  const png = "data:image/png;base64,AAAA";
  assert.deepEqual(postPhotos([2, "hi", png, { images: [png, "https://elsewhere/x.png", 5] }]), [png, png]);
  assert.deepEqual(postPhotos([2, "hi"]), []);
  assert.equal(shouldHold([0.01, 0.02]), false);
  assert.equal(shouldHold([0.01, FLAG_AT]), true);
  assert.equal(shouldHold([0.01, null]), true); // couldn't be checked: a teacher looks first
});
