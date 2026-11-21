-- Speed: indexes for look-ups the app makes on every request. No data or rule changes; safe to run twice.

-- Login: "which institute is this email staff of?" Without this, every sign-in check read the whole members table
-- (its existing index starts with the institute, which an owner logging in doesn't give).
create index if not exists members_email on members (email);

-- Public pages. A teacher's website is found by its address, a join link by its batch id, and the course list by
-- "has a public batch". Without these, each visit read every institute's data to find one.
create index if not exists institute_data_site_slug on institute_data ((state -> 'site' ->> 'slug'));
create index if not exists institute_data_batches on institute_data using gin ((state -> 'batches') jsonb_path_ops);

-- "Find your institute": typing part of a name. Needs the trigram extension; if it can't be switched on here,
-- the search simply stays as it was (correct, just not indexed).
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
  create index if not exists institutes_name_trgm on institutes using gin (name extensions.gin_trgm_ops);
exception when others then
  raise notice 'institute name search index skipped: %', sqlerrm;
end $$;
