-- Extra AI credit: students buy it (from ৳50) to keep chatting after their daily limit. Kept as a US$ value
-- (taka × (1 − margin) ÷ dollar rate at approval time) and never expires. Every change goes through ai_credit_change
-- below, which updates the balance and writes the log in one transaction, so a balance always equals the sum of its log.

alter table pay_requests drop constraint pay_requests_kind_check;
alter table pay_requests add constraint pay_requests_kind_check check (kind in ('ai_pack', 'plan', 'ai_credit'));
alter table pay_requests drop constraint pay_requests_status_check;
alter table pay_requests add constraint pay_requests_status_check check (status in ('pending', 'approved', 'rejected', 'refunded'));

create table ai_credit (
  user_key text primary key,            -- '<institute>:student:<id>', the same key as ai_usage
  institute_id uuid not null references institutes on delete cascade,
  usd numeric not null default 0 check (usd >= 0),
  updated_at timestamptz not null default now()
);

create table ai_credit_log (
  id bigint generated always as identity primary key,
  user_key text not null,
  institute_id uuid not null references institutes on delete cascade,
  kind text not null check (kind in ('purchase', 'spend', 'admin_add', 'admin_remove', 'refund')),
  usd numeric not null,                  -- signed: what the balance really changed by
  taka numeric,                          -- purchase: paid; refund: to give back
  pay_request_id uuid references pay_requests on delete set null,
  note text,
  by text,                               -- 'system' or the admin
  day date,                              -- spend: the Dhaka day (one row per student per day)
  at timestamptz not null default now()
);
create index ai_credit_log_key on ai_credit_log (user_key, at desc);
create index ai_credit_log_at on ai_credit_log (at);
create unique index ai_credit_log_spend_day on ai_credit_log (user_key, day) where kind = 'spend';
create unique index ai_credit_log_purchase on ai_credit_log (pay_request_id) where kind = 'purchase';
create unique index ai_credit_log_refund on ai_credit_log (pay_request_id) where kind = 'refund';

/**
 * The one way to change a balance. p_usd: + to add, − to take (purchase/admin_add/spend/admin_remove).
 * - purchase: once per payment (asking again changes nothing).
 * - spend: added to the student's one 'spend' row for p_day.
 * - refund: p_usd is ignored; takes back the purchase's credit, at most what is left, once per payment.
 * Taking never goes below 0. Returns {balance, usd (the real change), taka}.
 */
create function ai_credit_change(p_key text, p_institute uuid, p_kind text, p_usd numeric, p_taka numeric default null,
  p_pay uuid default null, p_note text default null, p_by text default 'system', p_day date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  change numeric;
  v_taka numeric := p_taka;
  bought record;
begin
  insert into ai_credit (user_key, institute_id) values (p_key, p_institute) on conflict (user_key) do nothing;
  select usd into bal from ai_credit where user_key = p_key for update; -- one change at a time per student
  if p_kind = 'purchase' then
    if p_pay is null or p_usd <= 0 then raise exception 'purchase needs a payment and a positive amount'; end if;
    if exists (select 1 from ai_credit_log where pay_request_id = p_pay and kind = 'purchase') then
      return jsonb_build_object('balance', bal, 'usd', 0, 'taka', 0);
    end if;
    change := p_usd;
  elsif p_kind = 'admin_add' then
    if p_usd <= 0 then raise exception 'add a positive amount'; end if;
    change := p_usd;
  elsif p_kind in ('spend', 'admin_remove') then
    if p_usd > 0 then raise exception 'take a negative amount'; end if;
    change := greatest(p_usd, -bal);
  elsif p_kind = 'refund' then
    select usd, taka into bought from ai_credit_log where pay_request_id = p_pay and kind = 'purchase' and user_key = p_key;
    if not found then raise exception 'no such purchase'; end if;
    if exists (select 1 from ai_credit_log where pay_request_id = p_pay and kind = 'refund') then raise exception 'already refunded'; end if;
    change := -least(bought.usd, bal);
    v_taka := round(coalesce(bought.taka, 0) * (-change) / bought.usd, 2);
  else
    raise exception 'bad kind %', p_kind;
  end if;

  if p_kind = 'spend' then
    insert into ai_credit_log (user_key, institute_id, kind, usd, by, day) values (p_key, p_institute, 'spend', change, coalesce(p_by, 'system'), coalesce(p_day, current_date))
      on conflict (user_key, day) where kind = 'spend' do update set usd = ai_credit_log.usd + excluded.usd, at = now();
  else
    insert into ai_credit_log (user_key, institute_id, kind, usd, taka, pay_request_id, note, by)
      values (p_key, p_institute, p_kind, change, v_taka, p_pay, p_note, coalesce(p_by, 'system'));
  end if;
  update ai_credit set usd = bal + change, updated_at = now() where user_key = p_key;
  return jsonb_build_object('balance', bal + change, 'usd', change, 'taka', v_taka);
end
$$;

-- Balances that differ from the sum of their log (should be none). Reports only, never fixes.
create function ai_credit_check() returns table (user_key text, balance numeric, logged numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(c.user_key, l.user_key), coalesce(c.usd, 0), coalesce(l.total, 0)
  from ai_credit c full join (select user_key, sum(usd) as total from ai_credit_log group by user_key) l on l.user_key = c.user_key
  where coalesce(c.usd, 0) <> coalesce(l.total, 0)
$$;

-- This month's figures for the admin panel (since = the 1st, Dhaka).
create function ai_credit_totals(since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'takaSold', coalesce((select sum(taka) from ai_credit_log where kind = 'purchase' and at >= since), 0),
    'usdIssued', coalesce((select sum(usd) from ai_credit_log where kind in ('purchase', 'admin_add') and at >= since), 0),
    'usdSpent', coalesce((select -sum(usd) from ai_credit_log where kind = 'spend' and at >= since), 0),
    'usdOutstanding', coalesce((select sum(usd) from ai_credit), 0))
$$;

alter table ai_credit enable row level security;
alter table ai_credit_log enable row level security;
revoke all on ai_credit, ai_credit_log from anon, authenticated;
grant select, insert, update, delete on ai_credit, ai_credit_log to service_role;
-- Only the server may run them (Postgres lets everyone run a new function by default).
revoke execute on function ai_credit_change(text, uuid, text, numeric, numeric, uuid, text, text, date) from public, anon, authenticated;
revoke execute on function ai_credit_check() from public, anon, authenticated;
revoke execute on function ai_credit_totals(timestamptz) from public, anon, authenticated;
grant execute on function ai_credit_change(text, uuid, text, numeric, numeric, uuid, text, text, date) to service_role;
grant execute on function ai_credit_check() to service_role;
grant execute on function ai_credit_totals(timestamptz) to service_role;
