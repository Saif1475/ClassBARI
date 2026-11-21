-- ClassBARI: institutes, branches, staff, classes → subjects → shifts, students, guardians, fees, attendance.
-- Everyone signs in with Google; access is decided by the signed-in Gmail (auth.jwt() ->> 'email'),
-- so a Gmail registered by the institute works before that person's first sign-in.
-- An independent teacher is an institute with one branch and one member (the owner, who also teaches).

create type member_role as enum ('owner', 'manager', 'teacher');
create type pay_type as enum ('salary', 'share', 'per_class', 'mixed');

create table institutes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  phone text,
  address text,
  logo_url text,
  fee_due_day int not null default 10 check (fee_due_day between 1 and 28),
  late_fine int not null default 0 check (late_fine >= 0),
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes on delete cascade,
  name text not null check (length(name) between 1 and 120),
  address text,
  phone text,
  unique (id, institute_id)
);

-- Owners, branch managers and teachers.
create table members (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes on delete cascade,
  branch_id uuid,
  role member_role not null,
  name text not null,
  email text not null check (email = lower(email) and email like '%@%'),
  phone text,
  subjects text[] not null default '{}',
  pay_type pay_type not null default 'salary',
  salary int not null default 0 check (salary >= 0),
  share_pct numeric(5, 2) not null default 0 check (share_pct between 0 and 100),
  per_class int not null default 0 check (per_class >= 0),
  active boolean not null default true,
  unique (institute_id, email),
  unique (id, institute_id),
  foreign key (branch_id, institute_id) references branches (id, institute_id) on delete set null (branch_id),
  check (role <> 'manager' or branch_id is not null)
);

-- Teaching structure: Class (Class 9, SSC, HSC…) -> Subject (Math) -> Shift (Morning) -> Teacher(s).
create table classes (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  branch_id uuid not null,
  name text not null check (length(name) between 1 and 60),
  unique (branch_id, name),
  unique (id, institute_id, branch_id),
  foreign key (branch_id, institute_id) references branches (id, institute_id) on delete cascade
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  name text not null check (length(name) between 1 and 60),
  unique (class_id, name),
  unique (id, institute_id, branch_id, class_id),
  foreign key (class_id, institute_id, branch_id) references classes (id, institute_id, branch_id) on delete cascade
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  name text not null, -- e.g. Morning, Evening
  schedule text,
  class_days int[] not null default '{}',
  room text,
  seats int check (seats > 0),
  fee int not null default 0 check (fee >= 0),
  late_fine int not null default 0 check (late_fine >= 0),
  is_public boolean not null default false,
  about text,
  unique (subject_id, name),
  unique (id, institute_id),
  unique (id, class_id, subject_id),
  -- a shift always sits in its subject's class, branch and institute
  foreign key (subject_id, institute_id, branch_id, class_id) references subjects (id, institute_id, branch_id, class_id) on delete cascade
);

-- The institute assigns teachers to shifts (several allowed, e.g. "1st paper" / "2nd paper").
create table shift_teachers (
  institute_id uuid not null,
  shift_id uuid not null,
  member_id uuid not null,
  label text,
  primary key (shift_id, member_id),
  foreign key (shift_id, institute_id) references shifts (id, institute_id) on delete cascade,
  foreign key (member_id, institute_id) references members (id, institute_id) on delete cascade
);

create table guardians (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes on delete cascade,
  name text not null,
  email text not null check (email = lower(email) and email like '%@%'),
  phone text not null,
  unique (institute_id, email),
  unique (id, institute_id)
);

create table students (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  guardian_id uuid not null,
  name text not null,
  email text not null check (email = lower(email) and email like '%@%'),
  phone text,
  dob date,
  school text,
  address text,
  created_at timestamptz not null default now(),
  unique (institute_id, email),
  unique (id, institute_id),
  unique (id, class_id),
  foreign key (class_id, institute_id, branch_id) references classes (id, institute_id, branch_id),
  foreign key (guardian_id, institute_id) references guardians (id, institute_id)
);

-- A student takes several subjects of their class, each in one shift; fees are per enrolment.
create table enrolments (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  shift_id uuid not null,
  discount int not null default 0 check (discount >= 0),
  active boolean not null default true,
  joined_at date not null default current_date,
  unique (student_id, subject_id), -- one shift per subject
  unique (id, institute_id),
  foreign key (student_id, institute_id) references students (id, institute_id) on delete cascade,
  foreign key (shift_id, institute_id) references shifts (id, institute_id) on delete cascade,
  -- only shifts of the student's own class
  foreign key (student_id, class_id) references students (id, class_id) on delete cascade,
  foreign key (shift_id, class_id, subject_id) references shifts (id, class_id, subject_id) on delete cascade
);

create table fee_charges (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  enrolment_id uuid not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  kind text not null check (kind in ('fee', 'fine')),
  amount int not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (enrolment_id, month, kind),
  foreign key (enrolment_id, institute_id) references enrolments (id, institute_id) on delete cascade
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  enrolment_id uuid not null,
  amount int not null check (amount > 0),
  method text not null check (method in ('cash', 'bkash')),
  paid_at timestamptz not null default now(),
  recorded_by uuid references members on delete set null,
  foreign key (enrolment_id, institute_id) references enrolments (id, institute_id) on delete cascade
);

create table attendance (
  institute_id uuid not null,
  shift_id uuid not null,
  day date not null,
  student_id uuid not null,
  present boolean not null,
  primary key (shift_id, day, student_id),
  foreign key (shift_id, institute_id) references shifts (id, institute_id) on delete cascade,
  foreign key (student_id, institute_id) references students (id, institute_id) on delete cascade
);

create table staff_payouts (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null,
  member_id uuid not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount int not null check (amount > 0),
  paid_at timestamptz not null default now(),
  foreign key (member_id, institute_id) references members (id, institute_id) on delete cascade
);

-- ---------------------------------------------------------------------------------------------
-- Who is signed in. security definer + fixed search_path: these read tables the caller may not see.

create function app_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create function is_owner(inst uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where institute_id = inst and email = app_email() and role = 'owner' and active)
$$;

-- Owner of the institute, or the active manager of this branch.
create function manages_branch(inst uuid, br uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_owner(inst) or exists (
    select 1 from members where institute_id = inst and branch_id = br and email = app_email() and role = 'manager' and active)
$$;

-- Owner, or manager of any branch (guardians are institute-wide, shared by siblings across branches).
create function manages_institute(inst uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where institute_id = inst and email = app_email() and role in ('owner', 'manager') and active)
$$;

create function teaches_shift(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shift_teachers bt join members m on m.id = bt.member_id
    where bt.shift_id = b and m.email = app_email() and m.active)
$$;

create function is_member(inst uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where institute_id = inst and email = app_email() and active)
$$;

-- Students the signed-in person may see as that student or as their guardian.
create function my_student_ids() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from students s where s.email = app_email()
  union
  select s.id from students s join guardians g on g.id = s.guardian_id where g.email = app_email()
$$;

-- A teacher may see students enrolled in a shift they teach.
create function taught_student(st uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.student_id = st and e.active and teaches_shift(e.shift_id))
$$;

-- Policies below call these instead of querying each other's tables, which would recurse
-- (shifts <-> enrolments) or fail for signed-out visitors who can't read enrolments.
create function manages_shift(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shifts x where x.id = b and manages_branch(x.institute_id, x.branch_id))
$$;
create function enrolled_shift(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.shift_id = b and e.active and e.student_id in (select my_student_ids()))
$$;

-- Where a Gmail may go after Google sign-in. Empty = not registered (refuse).
create function my_access() returns table (role text, institute_id uuid, ref_id uuid) language sql stable security definer set search_path = public as $$
  select m.role::text, m.institute_id, m.id from members m where m.email = app_email() and m.active
  union all
  select 'student', s.institute_id, s.id from students s where s.email = app_email()
  union all
  select 'guardian', g.institute_id, g.id from guardians g where g.email = app_email()
$$;

-- Sign-up: creates an institute, its first branch and the signed-in user as owner.
-- An independent teacher signs up the same way.
create function create_institute(p_name text, p_branch text, p_owner_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
  br uuid;
begin
  if app_email() = '' then
    raise exception 'sign in first';
  end if;
  insert into institutes (name) values (p_name) returning id into inst;
  insert into branches (institute_id, name) values (inst, coalesce(nullif(p_branch, ''), 'Main')) returning id into br;
  insert into members (institute_id, branch_id, role, name, email) values (inst, br, 'owner', p_owner_name, app_email());
  return inst;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: each institute sees only its own data; managers only their branch;
-- teachers only the shifts they teach; students only themselves; guardians only their children.

alter table institutes enable row level security;
alter table branches enable row level security;
alter table members enable row level security;
alter table classes enable row level security;
alter table subjects enable row level security;
alter table shifts enable row level security;
alter table shift_teachers enable row level security;
alter table guardians enable row level security;
alter table students enable row level security;
alter table enrolments enable row level security;
alter table fee_charges enable row level security;
alter table payments enable row level security;
alter table attendance enable row level security;
alter table staff_payouts enable row level security;

create policy read on institutes for select using (
  is_member(id) or exists (select 1 from students s where s.institute_id = institutes.id and s.id in (select my_student_ids())));
create policy owner_edit on institutes for update using (is_owner(id)) with check (is_owner(id));

create policy read on branches for select using (is_member(institute_id));
create policy owner_all on branches for all using (is_owner(institute_id)) with check (is_owner(institute_id));

-- Pay details are private: teachers see only their own row; managers see their branch's teachers.
create policy read on members for select using (
  email = app_email() or is_owner(institute_id) or (role = 'teacher' and manages_branch(institute_id, branch_id)));
create policy owner_all on members for all using (is_owner(institute_id)) with check (is_owner(institute_id));
create policy manager_teachers on members for all
  using (role = 'teacher' and branch_id is not null and manages_branch(institute_id, branch_id))
  with check (role = 'teacher' and branch_id is not null and manages_branch(institute_id, branch_id));

create function sees_class(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shifts sh where sh.class_id = c and (sh.is_public or teaches_shift(sh.id) or enrolled_shift(sh.id)))
$$;
create function sees_subject(sub uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shifts sh where sh.subject_id = sub and (sh.is_public or teaches_shift(sh.id) or enrolled_shift(sh.id)))
$$;

-- A teacher sees only the classes/subjects of shifts assigned to them.
create policy read on classes for select using (manages_branch(institute_id, branch_id) or sees_class(id));
create policy manage on classes for all using (manages_branch(institute_id, branch_id)) with check (manages_branch(institute_id, branch_id));
create policy read on subjects for select using (manages_branch(institute_id, branch_id) or sees_subject(id));
create policy manage on subjects for all using (manages_branch(institute_id, branch_id)) with check (manages_branch(institute_id, branch_id));

-- Public shifts are visible to everyone (public course page), including signed-out visitors.
create policy read on shifts for select using (
  is_public or manages_branch(institute_id, branch_id) or teaches_shift(id) or enrolled_shift(id));
create policy manage on shifts for all using (manages_branch(institute_id, branch_id)) with check (manages_branch(institute_id, branch_id));

create policy read on shift_teachers for select using (
  teaches_shift(shift_id) or manages_shift(shift_id));
create policy manage on shift_teachers for all
  using (manages_shift(shift_id))
  with check (manages_shift(shift_id));

-- Only the institute (owner / managers) enrols and edits students and guardians.
create policy read on guardians for select using (
  email = app_email() or manages_institute(institute_id)
  or exists (select 1 from students s where s.guardian_id = guardians.id and taught_student(s.id)));
create policy manage on guardians for all using (manages_institute(institute_id)) with check (manages_institute(institute_id));

create policy read on students for select using (
  id in (select my_student_ids()) or manages_branch(institute_id, branch_id) or taught_student(id));
create policy manage on students for all using (manages_branch(institute_id, branch_id)) with check (manages_branch(institute_id, branch_id));

create policy read on enrolments for select using (
  student_id in (select my_student_ids()) or teaches_shift(shift_id)
  or manages_shift(shift_id));
create policy manage on enrolments for all
  using (manages_shift(shift_id))
  with check (manages_shift(shift_id));

-- Money: institute staff who manage the branch; students/guardians see their own.
create function manages_enrolment(en uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e join shifts b on b.id = e.shift_id where e.id = en and manages_branch(b.institute_id, b.branch_id))
$$;
create function my_enrolment(en uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrolments e where e.id = en and e.student_id in (select my_student_ids()))
$$;

create policy read on fee_charges for select using (manages_enrolment(enrolment_id) or my_enrolment(enrolment_id));
create policy manage on fee_charges for all using (manages_enrolment(enrolment_id)) with check (manages_enrolment(enrolment_id));
create policy read on payments for select using (manages_enrolment(enrolment_id) or my_enrolment(enrolment_id));
create policy manage on payments for all using (manages_enrolment(enrolment_id)) with check (manages_enrolment(enrolment_id));

-- Attendance: the shift's teachers and managers take it; students/guardians read their own.
create policy read on attendance for select using (
  student_id in (select my_student_ids()) or teaches_shift(shift_id)
  or manages_shift(shift_id));
create policy take on attendance for all
  using (teaches_shift(shift_id) or manages_shift(shift_id))
  with check (teaches_shift(shift_id) or manages_shift(shift_id));

create policy read on staff_payouts for select using (
  is_owner(institute_id) or exists (select 1 from members m where m.id = member_id and m.email = app_email()));
create policy owner_all on staff_payouts for all using (is_owner(institute_id)) with check (is_owner(institute_id));

-- Supabase roles: RLS above decides rows; signed-out visitors may only read public shifts and their classes/subjects.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on shifts, subjects, classes to anon;
-- Functions are callable by everyone by default; sign-in/sign-up functions only by signed-in users.
revoke execute on function my_access(), create_institute(text, text, text) from public;
grant execute on function my_access(), create_institute(text, text, text) to authenticated;
