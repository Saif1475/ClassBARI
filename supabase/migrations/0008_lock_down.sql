-- Lock the database down to the app's server.
-- The website and the phone apps never read or write tables themselves: everything goes through ClassBARI's server
-- (which checks who is asking), plus the two functions below. Until now a signed-in owner could still change their
-- own institute's row directly — including switching premium on for free. This closes that whole door.

-- One institute per owner account: asking again returns the one they have (so sign-up is safe to retry, and nobody
-- can fill the directory with thousands of institutes).
create or replace function create_institute(p_name text, p_branch text, p_owner_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inst uuid;
  br uuid;
begin
  if app_email() = '' then
    raise exception 'sign in first';
  end if;
  select institute_id into inst from members where email = app_email() and role = 'owner' order by id limit 1;
  if inst is not null then
    return inst;
  end if;
  insert into institutes (name) values (coalesce(nullif(left(btrim(p_name), 120), ''), 'My institute')) returning id into inst;
  insert into branches (institute_id, name) values (inst, coalesce(nullif(left(btrim(p_branch), 120), ''), 'Main')) returning id into br;
  insert into members (institute_id, branch_id, role, name, email)
    values (inst, br, 'owner', coalesce(nullif(left(btrim(p_owner_name), 120), ''), 'Owner'), app_email());
  return inst;
end
$$;

-- What AI has cost since a date, added up here so the monthly budget check can't miss rows.
create function ai_spent(since date) returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from ai_usage where day >= since
$$;

-- No direct access to any table for visitors or signed-in users (the row rules stay as a second lock).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Functions: only the two the apps call, and only when signed in.
-- (New functions in later migrations must do the same: Postgres lets everyone run a new function by default.)
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
grant execute on function my_access(), create_institute(text, text, text) to authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;
