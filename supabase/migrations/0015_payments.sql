-- (Named pay_requests: the first migration already has a "payments" table, from an earlier design for tuition fees.)
-- Payments to ClassBARI by bKash or Nagad "Send Money": the payer types the transaction ID (TrxID), our staff check it
-- in the bKash or Nagad app and approve; an approved AI pack switches on by itself. No card numbers or PINs are kept.
create table pay_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  institute_id uuid not null references institutes on delete cascade,
  payer_email text not null,
  payer_role text not null,
  kind text not null check (kind in ('ai_pack', 'plan')),
  item text not null,                       -- the pack (150, 400…) or the plan (basic, pro)
  student_id int,                           -- an AI pack: whose
  months int not null check (months between 1 and 12),
  amount int not null check (amount > 0),   -- ৳, worked out by the server from the price list
  method text not null check (method in ('bkash', 'nagad')),
  sender text not null,                     -- the number the money came from
  trx_id text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  decided_at timestamptz,
  unique (method, trx_id)                   -- one transaction pays for one thing
);
create index pay_requests_status on pay_requests (status, created_at);
create index pay_requests_payer on pay_requests (payer_email, created_at);

alter table pay_requests enable row level security;
revoke all on pay_requests from anon, authenticated;
grant select, insert, update, delete on pay_requests to service_role;
