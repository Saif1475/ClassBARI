-- The app's data per institute (one document, changed only through checked actions on the server),
-- and the Gmail addresses that may sign in as a student or guardian (kept in step with the student list).

create table institute_data (
  institute_id uuid primary key references institutes on delete cascade,
  state jsonb not null,
  version bigint not null default 1, -- every save bumps it; a save based on an older version is retried
  updated_at timestamptz not null default now()
);

create table roster (
  institute_id uuid not null references institutes on delete cascade,
  email text not null check (email = lower(email) and email like '%@%'),
  role text not null check (role in ('student', 'guardian')),
  student_id int not null,
  primary key (institute_id, email, role, student_id)
);
create index roster_email on roster (email);

-- No policies: only the server (secret key) reads or writes these, after checking who is asking.
alter table institute_data enable row level security;
alter table roster enable row level security;
revoke all on institute_data, roster from anon, authenticated;

-- Sign-in: students and guardians come from the roster too.
create or replace function my_access() returns table (role text, institute_id uuid, ref_id uuid) language sql stable security definer set search_path = public as $$
  select m.role::text, m.institute_id, m.id from members m where m.email = app_email() and m.active
  union all
  select 'student', s.institute_id, s.id from students s where s.email = app_email()
  union all
  select 'guardian', g.institute_id, g.id from guardians g where g.email = app_email()
  union all
  select distinct r.role, r.institute_id, null::uuid from roster r where r.email = app_email()
$$;
