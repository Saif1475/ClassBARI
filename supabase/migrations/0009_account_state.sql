-- Login asks "first time here, or back again?": whether a sign-in account exists for an email, and whether it has a
-- password ('password'), only Google so far ('google'), or nothing confirmed yet ('new'). Only our server may ask.
create or replace function account_state(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case
       when u.email_confirmed_at is null then 'new'
       when coalesce(u.encrypted_password, '') = '' then 'google'
       else 'password'
     end
     from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1),
    'new');
$$;
revoke execute on function account_state(text) from public, anon, authenticated;
grant execute on function account_state(text) to service_role;
