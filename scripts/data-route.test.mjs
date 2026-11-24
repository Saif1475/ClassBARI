// Run: npm test — /api/data's checks that need the database: the real route, with Supabase and sign-in stubbed.
import assert from "node:assert/strict";
import { test } from "node:test";

const stub = (code) => "data:text/javascript," + encodeURIComponent(code);
const lib = (f) => new URL(`../src/lib/${f}.ts`, import.meta.url).href;
const map = {
  "@/lib/auth-mode": stub("export const REAL_AUTH = true;"),
  "@/lib/rate-limit": stub("export const limited = () => null;"),
  "@/lib/platform-server": stub("export const readPlatform = async () => ({ suspended: globalThis.__suspended ?? [] });"),
  "@/lib/notify-server": stub("export const afterSaved = async () => {};"),
  "@/lib/pdf-pipeline": stub("export const afterAction = async () => {};"),
  "@/lib/image-check": stub("export const holdPost = async () => false;"),
  "@/lib/data-server": stub(`
    export const whoIs = async () => globalThis.__me;
    export const loadPart = async (_i, ...keys) => Object.fromEntries(keys.map((k) => [k, globalThis.__state[k]]));
    export const publicDocs = async ({ slug }) => globalThis.__published.filter((p) => p.slug === slug).map((p) => ({ institute: p.institute, state: {} }));
    export const act = async (_me, name, args, _base, check) => { globalThis.__saved.push([name, check(globalThis.__state)]); return { state: globalThis.__state, version: 2 }; };
    export const instituteCard = async () => null; export const loadChanged = async () => null; export const loadDoc = async () => null;`),
  ...Object.fromEntries(["data-access", "word-filter", "community", "platform", "doc-limit", "same-site"].map((f) => [`@/lib/${f}`, lib(f)])),
};
(await import("node:module")).register(stub(`const map = ${JSON.stringify(map)}; export async function resolve(s, c, next) { return map[s] ? { url: map[s], shortCircuit: true } : next(s, c); }`));
const { seed } = await import("../src/lib/mock-data.ts");
const { POST } = await import("../src/app/api/data/route.ts");
const send = (name, args) => POST(new Request("http://localhost/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, args, base: Date.now() }) }));

test("an institute can't publish a web address another institute already shows (its visitors would pay the wrong centre)", async () => {
  globalThis.__me = { institute: "B", who: { role: "owner", name: "", email: "b@gmail.com", studentIds: [] } };
  globalThis.__state = { ...seed(), site: { slug: "tanvir", bio: "", bkash: "", published: false } };
  globalThis.__published = [{ institute: "A", slug: "physics-care" }, { institute: "B", slug: "tanvir" }];
  globalThis.__saved = [];
  assert.equal((await send("updateSite", [{ slug: "physics-care", published: true }])).status, 409);
  assert.equal((await send("updateSite", [{ slug: "physics-care" }])).status, 200); // not shown yet: kept as a draft
  globalThis.__state.site = { ...globalThis.__state.site, slug: "physics-care" };
  assert.equal((await send("updateSite", [{ published: true }])).status, 409); // and refused once it would be shown
  assert.equal((await send("updateSite", [{ slug: "tanvir", published: true }])).status, 200); // its own address
  assert.equal((await send("updateSite", [{ bio: "Physics, Class 9-12" }])).status, 200);
  assert.deepEqual(globalThis.__saved.map(([n]) => n), ["updateSite", "updateSite", "updateSite"]);
});
