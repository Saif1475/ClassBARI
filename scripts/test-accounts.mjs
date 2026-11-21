// Makes a small test institute with one account for each panel, on the Supabase project the local site uses:
//
//   npm run test:accounts                                         (four password accounts; the site must be running on localhost:3000)
//   npm run test:accounts -- <student Gmail> <guardian Gmail>     (student and guardian log in with Google instead)
//   npm run test:accounts -- remove                               (deletes the test institute and its accounts)
//
// Owner and teacher log in with email + password (written to data/test-accounts.txt, which is never committed).
// Students and guardians log in with Google, so they must be two real Gmail addresses you can open.
// Reads .env.local itself and never prints keys or passwords.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !pub || !secret) fail("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY must be filled in .env.local.");
function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const BASE = process.env.SITE || "http://localhost:3000";
const NAME = "ClassBARI Test Institute";
const OWNER = "classbari.test.owner@example.com";
const TEACHER = "classbari.test.teacher@example.com";
// Test student and guardian without Google: addresses too short to be real Gmails, given a password like the staff.
const STUDENT = "cb.s@gmail.com";
const GUARDIAN = "cb.g@gmail.com";
const FILE = "data/test-accounts.txt";
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/** Every sign-in account (the API gives them in pages). */
async function allUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error)
      fail(
        /invalid api key/i.test(error.message)
          ? "Supabase did not accept the SUPABASE_SERVICE_ROLE_KEY line in .env.local for the main project (it was probably replaced after the key rotation).\nCopy the current secret key from Supabase → main project → Settings → API Keys → Secret keys, put it on that line, restart the site, and run this again."
          : `Could not list accounts: ${error.message}`,
      );
    out.push(...data.users);
    if (data.users.length < 1000) return out;
  }
}
async function remove() {
  const users = (await allUsers()).filter((u) => [OWNER, TEACHER, STUDENT, GUARDIAN].includes(u.email));
  const { data: mine } = await admin.from("members").select("institute_id").eq("email", OWNER).eq("role", "owner");
  for (const m of mine ?? []) await admin.from("institutes").delete().eq("id", m.institute_id).eq("name", NAME); // only the test institute, by name too
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  rmSync(FILE, { force: true });
}

let [a, b] = process.argv.slice(2);
if (a === "remove") {
  await remove();
  console.log("Test institute and its accounts removed ✓");
  process.exit(0);
}
const gmail = (x) => typeof x === "string" && /^[^\s@]+@gmail\.com$/i.test(x);
// Only one Gmail? It becomes the student (or the guardian, with the word "guardian" after it); the other side gets an address nobody can open.
const NOBODY = "cb@gmail.com"; // too short to be a real Gmail
if (a === undefined) [a, b] = [STUDENT, GUARDIAN]; // no Gmail given: all four log in with email + password
else if (gmail(a) && b === undefined) b = NOBODY;
else if (gmail(a) && b === "guardian") [a, b] = [NOBODY, a];
if (!gmail(a) || !gmail(b) || a.toLowerCase() === b.toLowerCase() || /^your\.?(real|second|student|guardian)/i.test(a + b))
  fail("Use Gmail addresses you can really open (not the example ones):\n  npm run test:accounts -- <student Gmail> <guardian Gmail>\n  npm run test:accounts -- <your Gmail>              (you are the student)\n  npm run test:accounts -- <your Gmail> guardian     (you are the guardian)");
if (!(await fetch(BASE).then((r) => r.ok, () => false))) fail(`The site is not running on ${BASE}. Start it first (npm run build, then npm run start).`);

await remove(); // start clean, so running this twice is safe
const password = `Cb7!${randomBytes(9).toString("base64url")}`; // a small letter, a capital, a digit and a symbol: the project's password rule
for (const email of [OWNER, TEACHER, ...[a, b].filter((x) => x === STUDENT || x === GUARDIAN)]) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail(`Could not create ${email}: ${error.message}`);
}
// Sign in as the owner the way the website does, and set everything up through the app's own checks.
const jar = new Map();
const sb = createServerClient(url, pub, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)) } });
const signedIn = await sb.auth.signInWithPassword({ email: OWNER, password });
if (signedIn.error) fail(`Owner sign-in failed: ${signedIn.error.message}`);
const made = await sb.rpc("create_institute", { p_name: NAME, p_branch: "Main", p_owner_name: "Test Owner" });
if (made.error) fail(`Could not create the institute: ${made.error.message}`);
const act = async (name, args) => {
  const r = await fetch(`${BASE}/api/data`, { method: "POST", headers: { "content-type": "application/json", cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") }, body: JSON.stringify({ name, args, base: Date.now() }) });
  if (!r.ok) fail(`Step "${name}" failed (${r.status}). Is the site on ${BASE} using the same Supabase project as .env.local?`);
  return (await r.json()).state;
};
await act("signUpTeacher", [{ institute: NAME, name: "Test Owner", phone: "01711000010", batch: "Owner Batch", days: "Sat, Mon, Wed · 4:30 PM", classDays: [6, 1, 3], subject: "Physics", fee: 1000 }]);
await act("addStaff", ["Test Teacher", "01711000011", TEACHER]);
await act("addBatch", [{ name: "Teacher Batch", days: "Sun, Tue · 5:00 PM", classDays: [0, 2], subject: "Math", fee: 800, lateFine: 50, teacher: "Test Teacher" }]);
const state = await act("addStudent", [{ name: "Test Student", email: a.toLowerCase(), guardianName: "Test Guardian", guardianEmail: b.toLowerCase(), phone: "01711000012", gender: "male", mode: "offline", batch: "Teacher Batch", feePaid: false }]);
const student = state.students.find((s) => s.email === a.toLowerCase());
const until = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
await act("setStudentPremium", [student.id, until, 400]); // so AI chat can be tried
const { data: card } = await admin.from("institutes").select("code").eq("id", made.data).single();

mkdirSync("data", { recursive: true });
writeFileSync(FILE, [
  `ClassBARI test accounts (made ${new Date().toISOString().slice(0, 10)}) — log in at ${BASE}/login`,
  ``,
  `Institute: ${NAME}   code: ${card?.code ?? "?"}`,
  ``,
  `Institute owner  →  choose "Institute", email ${OWNER}`,
  `Teacher          →  choose "Instructor", find the institute, email ${TEACHER}`,
  `Password for all test accounts: ${password}`,
  ``,
  a === NOBODY ? `Student          →  not set up (run again with your Gmail alone to be the student)` : a === STUDENT ? `Student          →  choose "Student", find the institute, email ${STUDENT} and the same password` : `Student          →  choose "Student", find the institute, continue with Google as ${a.toLowerCase()}`,
  b === NOBODY ? `Guardian         →  not set up (run again with: <your Gmail> guardian)` : b === GUARDIAN ? `Guardian         →  choose "Parent", find the institute, email ${GUARDIAN} and the same password` : `Guardian         →  choose "Parent", find the institute, continue with Google as ${b.toLowerCase()}`,
  ``,
  `The student has the ৳400 AI pack until ${until}. Remove everything with: npm run test:accounts -- remove`,
  ``,
].join("\n"), { mode: 0o600 });
console.log(`Done ✓  Institute "${NAME}" with an owner, a teacher, a student and a guardian.\nLogin details are in ${FILE} (open it yourself; don't paste it anywhere).`);
