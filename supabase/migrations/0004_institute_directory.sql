-- "Find your institute" before logging in (like Canvas): a short code per institute, and a switch to hide it from search.
-- The directory is served by the app's server (secret key), so the institutes table's own access rules stay as they are.

create function new_institute_code() returns text language sql volatile as $$
  -- 6 characters without look-alikes (no 0/O, 1/I/L)
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6)
$$;

alter table institutes add column code text unique default new_institute_code();
update institutes set code = new_institute_code() where code is null;
alter table institutes alter column code set not null;
alter table institutes add constraint institute_code_format check (code ~ '^[A-Z0-9]{4,12}$');
alter table institutes add column listed boolean not null default true; -- false: findable by code only

create index institutes_name_search on institutes (lower(name));
