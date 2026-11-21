-- The app's server (secret key = service_role) reads and writes the tables after its own checks
-- (src/lib/data-server.ts). New Supabase projects don't grant this automatically, so grant it here,
-- also for tables added by later migrations.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
