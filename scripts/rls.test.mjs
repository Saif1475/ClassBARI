// Security rules (row-level security) of supabase/migrations, run on real Postgres (PGlite).
// Run: npm test
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

// What Supabase provides: the anon/authenticated roles and auth.jwt() from the request's token.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`;

const id = {}; // name -> uuid
async function seed() {
  const ins = async (name, sql, params) => (id[name] = (await db.query(`${sql} returning id`, params)).rows[0].id);
  await ins("A", "insert into institutes (name) values ('Alpha Coaching')");
  await ins("B", "insert into institutes (name) values ('Beta Academy')");
  await ins("A1", "insert into branches (institute_id, name) values ($1, 'Dhaka')", [id.A]);
  await ins("A2", "insert into branches (institute_id, name) values ($1, 'Chattogram')", [id.A]);
  await ins("B1", "insert into branches (institute_id, name) values ($1, 'Main')", [id.B]);
  const member = (name, inst, br, role, email, salary = 0) =>
    ins(name, "insert into members (institute_id, branch_id, role, name, email, salary) values ($1, $2, $3, $4, $5, $6)", [inst, br, role, name, email, salary]);
  await member("owner", id.A, id.A1, "owner", "a.owner@gmail.com");
  await member("manager", id.A, id.A1, "manager", "m1@gmail.com", 9000);
  await member("t1", id.A, id.A1, "teacher", "t1@gmail.com", 5000);
  await member("t2", id.A, id.A2, "teacher", "t2@gmail.com", 6000);
  await member("t3", id.A, id.A1, "teacher", "t3@gmail.com", 7000);
  await member("bOwner", id.B, id.B1, "owner", "b.owner@gmail.com");
  // Class -> Subject -> Shift -> Teacher(s)
  const klass = (name, inst, br) => ins(name, "insert into classes (institute_id, branch_id, name) values ($1, $2, $3)", [inst, br, name]);
  await klass("HSC", id.A, id.A1);
  await klass("SSC", id.A, id.A2);
  await klass("BClass", id.B, id.B1);
  const subject = (name, inst, br, cls) => ins(name, "insert into subjects (institute_id, branch_id, class_id, name) values ($1, $2, $3, $4)", [inst, br, id[cls], name]);
  await subject("Physics", id.A, id.A1, "HSC");
  await subject("Math", id.A, id.A1, "HSC");
  await subject("Chemistry", id.A, id.A2, "SSC");
  await subject("English", id.B, id.B1, "BClass");
  const shift = (name, inst, br, cls, sub, pub = false) =>
    ins(name, "insert into shifts (institute_id, branch_id, class_id, subject_id, name, fee, is_public) values ($1, $2, $3, $4, $5, 1000, $6)", [inst, br, id[cls], id[sub], name, pub]);
  await shift("P1", id.A, id.A1, "HSC", "Physics", true);
  await shift("P2", id.A, id.A1, "HSC", "Physics");
  await shift("M1", id.A, id.A1, "HSC", "Math");
  await shift("C1", id.A, id.A2, "SSC", "Chemistry");
  await shift("E1", id.B, id.B1, "BClass", "English");
  const teach = (sh, m, label) => db.query("insert into shift_teachers (institute_id, shift_id, member_id, label) values ($1, $2, $3, $4)", [id.A, id[sh], id[m], label]);
  await teach("P1", "t1", "1st paper");
  await teach("P1", "t2", "2nd paper"); // several teachers per shift, even from another branch
  await teach("P2", "t1", null);
  await teach("C1", "t2", null);
  const guardian = (name, inst, email) => ins(name, "insert into guardians (institute_id, name, email, phone) values ($1, $2, $3, '01711111111')", [inst, name, email]);
  await guardian("g1", id.A, "g1@gmail.com");
  await guardian("g2", id.A, "g2@gmail.com");
  await guardian("gb", id.B, "gb@gmail.com");
  const student = (name, inst, br, cls, g, email) =>
    ins(name, "insert into students (institute_id, branch_id, class_id, guardian_id, name, email) values ($1, $2, $3, $4, $5, $6)", [inst, br, id[cls], id[g], name, email]);
  await student("s1", id.A, id.A1, "HSC", "g1", "s1@gmail.com");
  await student("s2", id.A, id.A1, "HSC", "g1", "s2@gmail.com"); // sibling of s1
  await student("s3", id.A, id.A2, "SSC", "g2", "s3@gmail.com");
  await student("sb", id.B, id.B1, "BClass", "gb", "sb@gmail.com");
  const enrol = (name, st, cls, sub, sh, inst = id.A) =>
    ins(name, "insert into enrolments (institute_id, student_id, class_id, subject_id, shift_id) values ($1, $2, $3, $4, $5)", [inst, id[st], id[cls], id[sub], id[sh]]);
  await enrol("e_s1_P1", "s1", "HSC", "Physics", "P1");
  await enrol("e_s1_M1", "s1", "HSC", "Math", "M1"); // several subjects
  await enrol("e_s2_P2", "s2", "HSC", "Physics", "P2");
  await enrol("e_s3_C1", "s3", "SSC", "Chemistry", "C1");
  await enrol("e_sb_E1", "sb", "BClass", "English", "E1", id.B);
  await db.query("insert into fee_charges (institute_id, enrolment_id, month, kind, amount) values ($1, $2, '2026-11', 'fee', 1000)", [id.A, id.e_s1_P1]);
  await db.query("insert into payments (institute_id, enrolment_id, amount, method) values ($1, $2, 400, 'bkash'), ($1, $3, 1000, 'cash')", [id.A, id.e_s1_P1, id.e_s3_C1]);
  await db.query("insert into attendance (institute_id, shift_id, day, student_id, present) values ($1, $2, '2026-11-18', $3, true), ($1, $4, '2026-11-18', $5, false)", [id.A, id.P1, id.s1, id.C1, id.s3]);
}

before(async () => {
  await db.exec(SUPABASE_STUB);
  await db.exec(await readFile(new URL("../supabase/migrations/0001_institutes.sql", import.meta.url), "utf8"));
  await seed();
});

/** Run as a signed-in Gmail (or signed out) and reset afterwards. */
async function as(email, fn) {
  await db.exec(email ? "set role authenticated" : "set role anon");
  await db.query("select set_config('request.jwt.claims', $1, false)", [email ? JSON.stringify({ email }) : ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false)");
  }
}
const names = async (sql, params) => (await db.query(sql, params)).rows.map((r) => r.name).sort();
const count = async (sql, params) => (await db.query(sql, params)).rows.length;

test("institutes are isolated from each other", async () => {
  await as("b.owner@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), ["sb"]);
    assert.deepEqual(await names("select name from members"), ["bOwner"]);
    assert.equal(await count("select 1 from payments"), 0);
    assert.deepEqual(await names("select name from shifts"), ["E1", "P1"]); // P1 is public
  });
});

test("owner sees the whole institute, every branch", async () => {
  await as("a.owner@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), ["s1", "s2", "s3"]);
    assert.deepEqual(await names("select name from members"), ["manager", "owner", "t1", "t2", "t3"]);
    assert.equal(await count("select 1 from payments"), 2);
  });
});

test("branch manager sees only their branch", async () => {
  await as("m1@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), ["s1", "s2"]);
    assert.deepEqual(await names("select name from members"), ["manager", "t1", "t3"]); // not owner, not other branch
    assert.deepEqual(await names("select name from shifts"), ["M1", "P1", "P2"]);
    assert.deepEqual(await names("select name from classes"), ["HSC"]);
    assert.equal(await count("select 1 from payments"), 1);
  });
});

test("manager can add a teacher to their branch only, and never an owner/manager", async () => {
  await as("m1@gmail.com", async () => {
    await db.query("insert into members (institute_id, branch_id, role, name, email) values ($1, $2, 'teacher', 'new', 'new.t@gmail.com')", [id.A, id.A1]);
    await assert.rejects(db.query("insert into members (institute_id, branch_id, role, name, email) values ($1, $2, 'teacher', 'x', 'x@gmail.com')", [id.A, id.A2]), /row-level security/);
    await assert.rejects(db.query("insert into members (institute_id, branch_id, role, name, email) values ($1, $2, 'manager', 'y', 'y@gmail.com')", [id.A, id.A1]), /row-level security/);
  });
});

test("teacher sees only students of batches they teach, and no one's pay", async () => {
  await as("t1@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), ["s1", "s2"]);
    assert.deepEqual(await names("select name from members"), ["t1"]);
    assert.deepEqual(await names("select name from shifts"), ["P1", "P2"]);
    assert.deepEqual(await names("select name from classes"), ["HSC"]);
    assert.deepEqual(await names("select name from subjects"), ["Physics"]); // not Math: only what's assigned
    assert.equal(await count("select 1 from payments"), 0);
    assert.equal(await count("select 1 from fee_charges"), 0);
    assert.deepEqual(await names("select name from guardians"), ["g1"]);
  });
  await as("t3@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), []); // teaches nothing yet
  });
});

test("teacher cannot enrol students or promote themselves", async () => {
  await as("t1@gmail.com", async () => {
    await assert.rejects(
      db.query("insert into students (institute_id, branch_id, class_id, guardian_id, name, email) values ($1, $2, $3, $4, 'z', 'z@gmail.com')", [id.A, id.A1, id.HSC, id.g1]),
      /row-level security/,
    );
    await assert.rejects(db.query("insert into enrolments (institute_id, student_id, class_id, subject_id, shift_id) values ($1, $2, $3, $4, $5)", [id.A, id.s2, id.HSC, id.Math, id.M1]), /row-level security/);
    const res = await db.query("update members set role = 'owner', salary = 99999 where email = 't1@gmail.com'");
    assert.equal(res.affectedRows, 0);
  });
  assert.equal((await db.query("select role from members where email = 't1@gmail.com'")).rows[0].role, "teacher");
});

test("teacher takes attendance only in their own shifts", async () => {
  await as("t1@gmail.com", async () => {
    await db.query("insert into attendance (institute_id, shift_id, day, student_id, present) values ($1, $2, '2026-11-19', $3, true)", [id.A, id.P1, id.s1]);
    await assert.rejects(
      db.query("insert into attendance (institute_id, shift_id, day, student_id, present) values ($1, $2, '2026-11-19', $3, true)", [id.A, id.M1, id.s1]),
      /row-level security/,
    );
  });
});

test("student sees only themselves, their shifts, fees and attendance", async () => {
  await as("s1@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), ["s1"]);
    assert.deepEqual(await names("select name from shifts"), ["M1", "P1"]);
    assert.deepEqual(await names("select name from subjects"), ["Math", "Physics"]);
    assert.equal(await count("select 1 from payments"), 1);
    assert.equal(await count("select 1 from attendance where student_id <> $1", [id.s1]), 0);
    assert.deepEqual(await names("select name from members"), []);
    assert.equal((await db.query("update students set name = 'hacked' where email = 's2@gmail.com'")).affectedRows, 0);
    assert.equal((await db.query("update students set name = 'renamed' where email = 's1@gmail.com'")).affectedRows, 0); // read-only
  });
});

test("guardian sees all their children and nobody else", async () => {
  await as("g1@gmail.com", async () => {
    assert.deepEqual(await names("select name from students"), ["s1", "s2"]);
    assert.deepEqual(await names("select name from shifts"), ["M1", "P1", "P2"]);
    assert.equal(await count("select 1 from payments"), 1);
  });
});

test("signed-out visitors see only public shifts", async () => {
  await as(null, async () => {
    assert.deepEqual(await names("select name from shifts"), ["P1"]);
    assert.deepEqual(await names("select name from classes"), ["HSC"]);
    assert.deepEqual(await names("select name from subjects"), ["Physics"]);
    await assert.rejects(db.query("select * from students"), /permission denied/);
  });
});

test("my_access routes each Gmail, refuses unknown ones", async () => {
  const access = (email) => as(email, async () => (await db.query("select role from my_access()")).rows.map((r) => r.role));
  assert.deepEqual(await access("a.owner@gmail.com"), ["owner"]);
  assert.deepEqual(await access("T1@Gmail.com"), ["teacher"]); // case-insensitive
  assert.deepEqual(await access("s1@gmail.com"), ["student"]);
  assert.deepEqual(await access("g1@gmail.com"), ["guardian"]);
  assert.deepEqual(await access("stranger@gmail.com"), []);
});

test("sign-up creates an institute with the user as owner (independent teacher = institute of one)", async () => {
  await as("solo.teacher@gmail.com", async () => {
    const inst = (await db.query("select create_institute('Solo Tutor', '', 'Solo') as id")).rows[0].id;
    assert.deepEqual((await db.query("select role, institute_id from my_access()")).rows, [{ role: "owner", institute_id: inst }]);
    assert.deepEqual(await names("select name from branches"), ["Main"]);
  });
  await as(null, async () => {
    await assert.rejects(db.query("select create_institute('X', '', 'X')"), /permission denied/);
  });
});

test("teacher of another branch sees the classes of every shift assigned to them", async () => {
  await as("t2@gmail.com", async () => {
    assert.deepEqual(await names("select name from classes"), ["HSC", "SSC"]);
    assert.deepEqual(await names("select name from students"), ["s1", "s3"]);
  });
});

test("students join only shifts of their own class, one shift per subject", async () => {
  // s3 is in SSC: an HSC shift is refused by the database itself
  await assert.rejects(
    db.query("insert into enrolments (institute_id, student_id, class_id, subject_id, shift_id) values ($1, $2, $3, $4, $5)", [id.A, id.s3, id.HSC, id.Physics, id.P1]),
    /foreign key/,
  );
  // s1 already takes Physics in P1: a second Physics shift is refused
  await assert.rejects(
    db.query("insert into enrolments (institute_id, student_id, class_id, subject_id, shift_id) values ($1, $2, $3, $4, $5)", [id.A, id.s1, id.HSC, id.Physics, id.P2]),
    /duplicate key/,
  );
  // a shift's subject must match: P1 is Physics, not Math
  await assert.rejects(
    db.query("insert into enrolments (institute_id, student_id, class_id, subject_id, shift_id) values ($1, $2, $3, $4, $5)", [id.A, id.s2, id.HSC, id.Math, id.P1]),
    /foreign key/,
  );
});
