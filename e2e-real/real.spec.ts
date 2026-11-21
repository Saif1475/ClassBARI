import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Real accounts, real database: logs in as each of the four test people and checks what they can see and do.
// The password comes from data/test-accounts.txt (made by `npm run test:accounts`) and is never printed.
const INSTITUTE = "ClassBARI Test Institute";
const OWNER = "classbari.test.owner@example.com";
const TEACHER = "classbari.test.teacher@example.com";
const STUDENT = "cb.s@gmail.com";
const GUARDIAN = "cb.g@gmail.com";
let password = "";
test.beforeAll(() => {
  const file = readFileSync("data/test-accounts.txt", "utf8");
  password = file.match(/Password for [^:\n]*: (\S+)/)?.[1] ?? "";
  if (!password) throw new Error("No test accounts found. Run: npm run test:accounts");
});

type Role = "Student" | "Instructor" | "Institute" | "Parent";
async function login(page: Page, role: Role, email: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByRole("button", { name: role, exact: true }).click();
  if (role !== "Institute") {
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(INSTITUTE) }).click();
  }
  if (role === "Student" || role === "Parent") {
    await page.getByPlaceholder("you@gmail.com").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  } else {
    await page.locator('input[type="email"]').fill(email);
  }
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return errors;
}
/** What the server sends this signed-in person. */
const myData = (page: Page) => page.evaluate(async () => (await (await fetch("/api/data", { cache: "no-store" })).json()) as { role: string; version: number; state: Record<string, any> });
const send = (page: Page, name: string, args: unknown[]) =>
  page.evaluate(async ([n, a]) => (await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, args: a, base: Date.now() }) })).status, [name, args] as const);

test("asking again with the version you have fetches nothing; a change is picked up", async ({ page }) => {
  await login(page, "Institute", OWNER);
  await expect(page).toHaveURL(/\/institute$/);
  const first = await page.evaluate(async () => (await (await fetch("/api/data", { cache: "no-store" })).json()) as { version: number; institute: { code: string } | null });
  expect(first.institute?.code).toMatch(/^[A-Z0-9]{4,12}$/);
  const again = (v: number) => page.evaluate(async (ver) => (await fetch(`/api/data?v=${ver}`, { cache: "no-store" })).status, v);
  expect(await again(first.version)).toBe(204); // unchanged: no data sent
  expect(await again(first.version - 1)).toBe(200); // an older copy: the new one is sent
  // A change bumps the version by one, and the ids of new things keep going up (the server remembers the highest id).
  const title = `Speed check ${Date.now()}`;
  expect(await send(page, "addAnnouncement", [{ title, body: "one", batch: "Owner Batch" }])).toBe(200);
  expect(await send(page, "addAnnouncement", [{ title, body: "two", batch: "Owner Batch" }])).toBe(200);
  const after = await myData(page);
  const mine = after.state.announcements.filter((a: any) => a.title === title);
  expect(mine.length).toBe(2);
  expect(new Set(after.state.announcements.map((a: any) => a.id)).size).toBe(after.state.announcements.length); // no two the same
  expect(after.version).toBe(first.version + 2);
  expect(await again(first.version)).toBe(200);
  for (const a of mine) expect(await send(page, "deleteAnnouncement", [a.id])).toBe(200);
});

test("public pages: the course list and a join link work without logging in", async ({ page, request }) => {
  const list = await request.get("/api/public");
  expect(list.status()).toBe(200);
  expect(Array.isArray((await list.json()).batches)).toBe(true);
  // Make the owner's batch public, find it in the list and by its own link, then put it back.
  await login(page, "Institute", OWNER);
  await expect(page).toHaveURL(/\/institute$/);
  const batch = (await myData(page)).state.batches.find((b: any) => b.name === "Owner Batch");
  expect(await send(page, "updateBatch", [batch.id, { public: true }])).toBe(200);
  const listed = (await (await request.get("/api/public")).json()).batches;
  expect(listed.some((b: any) => b.id === batch.id)).toBe(true);
  expect(listed.every((b: any) => b.public)).toBe(true); // never a private batch
  const one = await (await request.get(`/api/public?batch=${encodeURIComponent(batch.id)}`)).json();
  expect(one.batches.map((b: any) => b.id)).toContain(batch.id);
  expect(JSON.stringify(one)).not.toContain("@gmail.com");
  // A visitor gets the two totals only: no student list and nobody's marks.
  expect(one.students).toEqual([]);
  expect(typeof one.publicStats.students).toBe("number");
  expect(JSON.stringify(one)).not.toMatch(/"scores"|"submissions"/);
  expect(await send(page, "updateBatch", [batch.id, { public: false }])).toBe(200);
  expect((await (await request.get("/api/public")).json()).batches.some((b: any) => b.id === batch.id)).toBe(false);
});

test("nobody gets data without logging in", async ({ request }) => {
  expect((await request.get("/api/data")).status()).toBe(401);
  expect((await request.get("/api/ai/assistant")).status()).toBe(401);
  expect((await request.get("/api/health")).ok()).toBe(true);
});

test("institute owner logs in and sees the whole institute", async ({ page }) => {
  const errors = await login(page, "Institute", OWNER);
  await expect(page).toHaveURL(/\/institute$/);
  const d = await myData(page);
  expect(d.role).toBe("owner");
  expect(d.state.batches.map((b: any) => b.name).sort()).toEqual(["Owner Batch", "Teacher Batch"]);
  expect(d.state.students.find((s: any) => s.email === STUDENT).phone).not.toBe("");
  await expect(page.getByRole("heading", { name: "Owner Batch" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("teacher logs in and gets only their own batch", async ({ page }) => {
  const errors = await login(page, "Instructor", TEACHER);
  await expect(page).toHaveURL(/\/teacher$/);
  const d = await myData(page);
  expect(d.role).toBe("teacher");
  expect(d.state.batches.map((b: any) => b.name)).toEqual(["Teacher Batch"]);
  expect(d.state.expenses).toEqual([]);
  expect(d.state.staff.filter((s: any) => s.name !== "Test Teacher").every((s: any) => s.salary === 0 && s.phone === "")).toBe(true);
  // The server refuses what a teacher may not do, even if asked directly.
  expect(await send(page, "addExpense", [{ date: "2026-01-01", category: "x", amount: 1, note: "" }])).toBe(403);
  expect(await send(page, "addBatch", [{ name: "Sneaky", days: "", classDays: [], subject: "", fee: 0, lateFine: 0, teacher: "Test Teacher" }])).toBe(403);
  expect(await send(page, "addAnnouncement", [{ title: "t", body: "b", batch: "Owner Batch" }])).toBe(403);
  await expect(page.getByRole("heading", { name: "Teacher Batch" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New batch/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("student logs in step by step, sees only their own details, AI chat and community work", async ({ page }) => {
  const errors = await login(page, "Student", STUDENT);
  await expect(page).toHaveURL(/\/student$/);
  const d = await myData(page);
  expect(d.role).toBe("student");
  const me = d.state.students.find((s: any) => s.id === d.state.meId);
  expect(me.email).toBe(STUDENT);
  expect(d.state.students.filter((s: any) => s.id !== me.id).every((s: any) => s.email === "" && s.phone === "" && s.feeDue === 0)).toBe(true);
  expect(d.state.staff.every((s: any) => s.salary === 0)).toBe(true);
  expect(Object.keys(d.state.xp).every((id) => Number(id) === me.id)).toBe(true); // nobody else's XP
  expect(await send(page, "payFee", [me.id, "cash"])).toBe(403); // can't mark their own fee paid

  // AI chat: the model list shows what a bigger pack would unlock; asking gives an answer or a clear "not ready" note.
  await page.getByRole("button", { name: "AI chat" }).first().click();
  await page.getByRole("button", { name: "AI model" }).click();
  await expect(page.getByRole("option", { name: /Claude Sonnet/ })).toHaveAttribute("aria-disabled", "true"); // ৳1,500 pack
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "AI model" }).click();
  await page.getByPlaceholder(/Ask anything/).fill("What is force? (automated test)");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status").filter({ hasText: /coming soon|allowance|saved answer|paused/i }).first()).toBeVisible({ timeout: 60_000 });

  // Community: a friends-only post appears for its author.
  const text = `Real-account test post ${Date.now()}`;
  await page.getByRole("button", { name: "Community" }).first().click();
  await page.getByLabel("Who can see this post").selectOption("friends");
  await page.getByLabel("Write a post").fill(text);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const post = page.getByRole("article").filter({ hasText: text });
  await expect(post).toBeVisible();
  await expect.poll(async () => (await myData(page)).state.community.some((p: any) => p.text === text && p.audience === "friends")).toBe(true); // saved on the server
  await post.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click(); // tidy up (the confirm box is accepted below)

  // Unkind words: the server holds the post for a teacher and refuses a rude reply.
  const rude = `you shala (automated test ${Date.now()})`;
  expect(await send(page, "addCommunityPost", [me.id, rude, undefined, { audience: "all" }])).toBe(200);
  const held = (await myData(page)).state.community.find((p: any) => p.text === rude);
  expect(held.held).toBe(true);
  expect(await send(page, "addComment", [held.id, me.id, "tui ekta harami"])).toBe(403);
  expect(await send(page, "deletePost", [held.id])).toBe(200);
  expect(errors).toEqual([]);
});

test("guardian logs in and sees only their child", async ({ page }) => {
  const errors = await login(page, "Parent", GUARDIAN);
  await expect(page).toHaveURL(/\/parent$/);
  const d = await myData(page);
  expect(d.role).toBe("guardian");
  expect(d.state.parentChildren.length).toBe(1);
  expect(d.state.community).toEqual([]); // the community is for students
  await expect(page.getByText("Test Student").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("logging out ends the session (the login library is fetched when it is first needed)", async ({ page }) => {
  await login(page, "Student", STUDENT);
  await expect(page).toHaveURL(/\/student$/);
  expect((await myData(page)).role).toBe("student");
  // What the dashboard shows is kept on the device: the next visit opens with it, even before (or without) the server.
  const kept = () => page.evaluate(() => localStorage.getItem("edunest-last-view-v1"));
  await expect.poll(kept, { timeout: 10_000 }).toContain("Test Student");
  await page.route("**/api/data**", (r) => r.abort());
  await page.reload();
  await expect(page.getByRole("button", { name: "Community" }).first()).toBeVisible();
  await page.unroute("**/api/data**");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await kept()).toBeNull(); // nothing of theirs is left for the next person on this device
  // A visitor (nobody signed in) doesn't ask the server for data at all.
  const asked: string[] = [];
  page.on("request", (r) => void (r.url().includes("/api/data") && asked.push(r.url())));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(asked).toEqual([]);
  expect(await page.evaluate(async () => (await fetch("/api/data", { cache: "no-store" })).status)).toBe(401);
  await page.goto("/student"); // the dashboard is closed again
  await expect(page).toHaveURL(/\/login/);
});

test.beforeEach(({ page }) => {
  page.on("dialog", (d) => void d.accept());
});

test("a file opens only for people who are shown it", async ({ page, browser }) => {
  await login(page, "Student", STUDENT);
  await expect(page).toHaveURL(/\/student$/);
  const me = (await myData(page)).state.meId;
  // A friends-only post with a photo big enough to go to file storage.
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 240;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 400; i++) (g.fillStyle = `hsl(${(i * 47) % 360} 80% 50%)`), g.fillRect((i * 13) % 240, (i * 29) % 240, 30, 30);
    return c.toDataURL("image/png");
  });
  const text = `File test ${Date.now()}`;
  expect(await send(page, "addCommunityPost", [me, text, undefined, { images: [photo], audience: "friends" }])).toBe(200);
  const post = (await myData(page)).state.community.find((p: any) => p.text === text);
  const link: string = post.images[0];
  expect(link).toMatch(/^\/api\/files\//); // stored as a file, not inside the data
  // The photo went past the image checker: clean, so not held (when the Python service is off it is held for a teacher instead).
  const helper = (await (await page.request.get("/api/health")).json()).helper;
  expect(!!post.held).toBe(!helper);
  const open = (p: Page) => p.evaluate(async (u) => (await fetch(`${u}?link=1`)).status, link);
  expect(await open(page)).toBe(200); // its author
  // A second photo, posted a moment later, opens at once too (the server remembers what each login may open for a minute).
  const text2 = `File test two ${Date.now()}`;
  expect(await send(page, "addCommunityPost", [me, text2, undefined, { images: [photo.replace("data:image/png", "data:image/png")], audience: "friends" }])).toBe(200);
  const post2 = (await myData(page)).state.community.find((p: any) => p.text === text2);
  expect(await page.evaluate(async (u) => (await fetch(`${u}?link=1`)).status, post2.images[0])).toBe(200);
  expect(await send(page, "deletePost", [post2.id])).toBe(200);
  // A made-up file address in the same institute is refused.
  expect(await page.evaluate(async (u) => (await fetch(`${u}?link=1`)).status, link.slice(0, -12) + "000000000000")).toBe(403);

  const other = await browser.newContext();
  const guardian = await other.newPage();
  guardian.on("dialog", (d) => void d.accept());
  await login(guardian, "Parent", GUARDIAN);
  await expect(guardian).toHaveURL(/\/parent$/);
  expect(await open(guardian)).toBe(403); // same institute, but this post isn't shown to them
  await other.close();

  const anon = await browser.newContext();
  expect((await (await anon.newPage()).request.get(`${link}?link=1`)).status()).toBe(401); // not logged in
  await anon.close();
  expect(await send(page, "deletePost", [post.id])).toBe(200);
});
