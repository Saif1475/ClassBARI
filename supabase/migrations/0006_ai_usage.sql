-- "Ask AI" usage: questions and cost per person per day, for the daily limit and the monthly budget cap.
create table ai_usage (
  user_key text not null,  -- '<institute>:<role>:<student id or staff name>' (no emails or names of students)
  day date not null,
  institute_id uuid not null references institutes on delete cascade,
  questions int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  primary key (user_key, day)
);
create index ai_usage_day on ai_usage (day);

alter table ai_usage enable row level security;
revoke all on ai_usage from anon, authenticated;
grant select, insert, update, delete on ai_usage to service_role;
