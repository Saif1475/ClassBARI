-- Premium "highlighted PDFs": every PDF a teacher uploads in a premium institute is read once (text, plus the AI
-- reading scanned/Bangla pages) and its key terms, definitions, formulas and exam points are marked once.
-- Teachers can preview and fix the highlights; students see them only with a premium subscription.

alter table institutes add column premium boolean not null default false; -- set by ClassBARI (admin panel)

create table pdf_insights (
  file_path text primary key,                  -- '<institute id>/<file id>' in the private "files" bucket
  institute_id uuid not null references institutes on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  source text check (source in ('ai', 'basic')), -- 'basic' = marked without AI (no AI key yet)
  pages jsonb,                                 -- [{ n, scanned, text }]
  highlights jsonb,                            -- [{ page, text, type, hidden }]
  error text,
  updated_at timestamptz not null default now()
);
create index pdf_insights_institute on pdf_insights (institute_id);

-- Only the app's server reads or writes it, after checking premium.
alter table pdf_insights enable row level security;
revoke all on pdf_insights from anon, authenticated;
grant select, insert, update, delete on pdf_insights to service_role;
