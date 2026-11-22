-- Notifications: the devices that get them (browsers and the phone apps), what each person switched off, the ones
-- waiting for a time, and the "already sent" marks. Until now browser subscriptions lived in a file on one server.
create table push_devices (
  token text primary key,             -- a browser's push address, or a phone app's Firebase token
  kind text not null check (kind in ('web', 'fcm')),
  sub jsonb,                          -- browsers: the subscription's keys
  institute_id uuid not null references institutes on delete cascade,
  email text not null,
  role text not null,                 -- owner, manager, teacher, student, guardian
  student_ids int[] not null default '{}', -- a student's own id, or a guardian's children
  lang text not null default 'en',
  updated_at timestamptz not null default now()
);
create index push_devices_institute on push_devices (institute_id);

-- One person's switches (the same for all their devices): the groups they turned off.
create table notify_prefs (
  institute_id uuid not null references institutes on delete cascade,
  email text not null,
  off text[] not null default '{}',
  primary key (institute_id, email)
);

-- Waiting for a time (an absence is sent 15 minutes after it is marked, if it still stands then).
create table notify_later (
  key text primary key,
  institute_id uuid not null references institutes on delete cascade,
  due_at timestamptz not null,
  what jsonb not null
);
create index notify_later_due on notify_later (due_at);

-- Sent once only (homework due tomorrow, the month's fee, an absence): claimed by inserting the key.
create table notify_sent (
  key text primary key,
  at timestamptz not null default now()
);

alter table push_devices enable row level security;
alter table notify_prefs enable row level security;
alter table notify_later enable row level security;
alter table notify_sent enable row level security;
revoke all on push_devices, notify_prefs, notify_later, notify_sent from anon, authenticated;
grant select, insert, update, delete on push_devices, notify_prefs, notify_later, notify_sent to service_role;
