// Run: npm run check:files      (website on port 3000; test accounts made)
// Are uploaded pictures and files saved properly? Goes through the website as the test people:
//   1. sends a picture the way a student's phone does, reads it back from storage and compares it byte for byte;
//   2. looks through everything the test institute holds: every stored file must open, and no big picture may be
//      sitting inside the institute's data instead of in file storage;
//   3. makes sure a stored file does not open for someone who is not logged in.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { as, finish, SITE } from "./test-login.mjs";

let bad = 0;
const say = (line = "") => console.log(line);
const fail = (line) => (bad++, say(`  ✗ ${line}`));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
/** Fetch a stored file as this person: the bytes, their type, or why not. */
const open = async (person, link) => {
  const r = await person.call(`${link}?link=1`);
  if (r.status !== 200) return { status: r.status };
  const res = await fetch(JSON.parse(r.text).url);
  return { status: res.status, type: res.headers.get("content-type") ?? "", bytes: Buffer.from(await res.arrayBuffer()) };
};

// ---- 1. one picture, there and back -----------------------------------------------------------------------------
say("1. A picture sent the way a student's phone sends it");
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const original = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#f3efe2"/><circle cx="700" cy="170" r="110" fill="#157347"/><rect x="60" y="330" width="420" height="190" fill="#e2136e"/><text x="60" y="130" font-family="DejaVu Sans, Arial" font-size="54" fill="#111">Image saving check</text><text x="60" y="210" font-family="DejaVu Sans, Arial" font-size="34" fill="#333">${stamp}</text></svg>`)).png().toBuffer();
const student = await as("student");
const me = (await student.data()).meId;
const after = await student.send("askDoubt", [me, "", `Image saving check ${stamp} (a test, safe to ignore)`, `data:image/png;base64,${original.toString("base64")}`]);
const doubt = after.doubts.find((d) => d.text.includes(stamp));
const link = doubt?.image ?? "";
if (!/^\/api\/files\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(link)) fail(`The picture was not moved to file storage: the data holds "${String(link).slice(0, 40)}…" instead of a file link.`);
else {
  say(`  ✓ saved to file storage; the institute's data keeps only a short link (${link.length} characters, not the ${kb(original.length)} picture)`);
  const back = await open(student, link);
  if (back.status !== 200) fail(`The student could not open their own picture (${back.status}).`);
  else if (sha(back.bytes) !== sha(original)) fail(`The picture that came back is different from the one sent (${kb(back.bytes.length)} back, ${kb(original.length)} sent).`);
  else say(`  ✓ read back by the student: ${kb(back.bytes.length)}, type ${back.type}, identical to what was sent (fingerprint ${sha(back.bytes)})`);
  const teacher = await as("teacher");
  const seen = await open(teacher, link);
  if (seen.status === 200 && sha(seen.bytes) === sha(original)) say("  ✓ the teacher can open the same picture");
  else fail(`The teacher could not open the student's picture (${seen.status}).`);
  await teacher.send("replyDoubt", [doubt.id, { by: "Test Teacher", text: "Checked: the picture was saved properly." }, true]).catch(() => {}); // marked solved, so it does not sit in the open doubts
  const stranger = await fetch(`${SITE}${link}`, { redirect: "manual" });
  if (stranger.status === 401) say("  ✓ someone who is not logged in is refused (401)");
  else fail(`Someone who is not logged in got status ${stranger.status} for the picture (expected 401).`);
}

// ---- 2. everything the test institute holds ---------------------------------------------------------------------
say();
say("2. Everything stored for the test institute");
const owner = await as("owner");
const whole = JSON.stringify(await owner.data());
const links = [...new Set([...whole.matchAll(/"(\/api\/files\/[0-9a-f-]{36}\/[0-9a-f-]{36})"/g)].map((m) => m[1]))];
const inline = [...whole.matchAll(/"(data:[\w/+.-]+;base64,[^"]{4000,})"/g)].map((m) => m[1]);
say(`  The institute's data is ${kb(whole.length)}; it points to ${links.length} stored file(s).`);
if (inline.length) fail(`${inline.length} picture(s) or file(s) are sitting inside the institute's data instead of file storage (${kb(inline.reduce((n, s) => n + s.length, 0))} in all). The first is of type ${inline[0].slice(5, 30).split(";")[0]}.`);
else say("  ✓ no picture or file is sitting inside the institute's data (only short links)");
let total = 0;
const kinds = {};
for (const l of links) {
  const f = await open(owner, l);
  if (f.status !== 200 || !f.bytes.length) fail(`${l} does not open (${f.status}).`);
  else {
    total += f.bytes.length;
    kinds[f.type] = (kinds[f.type] ?? 0) + 1;
  }
}
if (links.length) say(`  ✓ opened every one of them: ${kb(total)} in all — ${Object.entries(kinds).map(([t, n]) => `${n} × ${t}`).join(", ")}`);

await finish();
say();
say(bad ? `${bad} problem(s) found.` : "All checks passed.");
process.exit(bad ? 1 : 0);
