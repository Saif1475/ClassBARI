// Apply supabase/migrations/*.sql to a Supabase database, in order, each in its own transaction.
// Remembers what it applied (ops.applied_migrations — a private schema the Supabase API doesn't expose), so running it again is safe.
//
//   npm run db:migrate -- test          (the classbari-test project: TEST_SUPABASE_DB_URL)
//   npm run db:migrate -- main --yes    (the real project: SUPABASE_DB_URL; --yes because it's real data)
//
// Reads .env.local itself and never prints the connection string or password.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const target = process.argv[2];
if (target !== "test" && target !== "main") {
  console.error("Say which project: npm run db:migrate -- test   (or: main --yes)");
  process.exit(1);
}
if (target === "main" && !process.argv.includes("--yes")) {
  console.error("This is the REAL project. Run again with --yes if you're sure:  npm run db:migrate -- main --yes");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env[target === "test" ? "TEST_SUPABASE_DB_URL" : "SUPABASE_DB_URL"];
if (!url || url.includes("YOUR-")) {
  console.error(`The ${target === "test" ? "TEST_SUPABASE_DB_URL" : "SUPABASE_DB_URL"} line in .env.local is empty or still has the password placeholder.`);
  process.exit(1);
}

const dir = path.join("supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const hide = (msg) => String(msg).replace(/postgres(ql)?:\/\/\S+/g, "<url>");

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await db.connect();
  await db.query("create schema if not exists ops; create table if not exists ops.applied_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query("select name from ops.applied_migrations")).rows.map((r) => r.name));
  const todo = files.filter((f) => !done.has(f));
  console.log(`${target} project: ${done.size} already applied, ${todo.length} to apply.`);
  for (const f of todo) {
    try {
      await db.query("begin");
      await db.query(readFileSync(path.join(dir, f), "utf8"));
      await db.query("insert into ops.applied_migrations (name) values ($1)", [f]);
      await db.query("commit");
      console.log(`  ✓ ${f}`);
    } catch (e) {
      await db.query("rollback").catch(() => {});
      console.error(`  ✗ ${f} failed, nothing from it was kept: ${hide(e.message)}`);
      process.exitCode = 1;
      break;
    }
  }
  const tables = (await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'")).rows[0].n;
  if (!process.exitCode) console.log(`Done ✓  public tables now: ${tables}`);
} catch (e) {
  console.error("Could not connect:", hide(e.message));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
