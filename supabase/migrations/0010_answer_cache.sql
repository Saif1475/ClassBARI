-- AI chat: answers saved on the server, so a question another student asked before (in other words, or the other
-- language's script excluded) is answered from the saved copy instead of a new, paid AI call.
-- Only our server (service role) reads or writes it; no student's name or account is stored with a question.
create extension if not exists vector with schema extensions;

create table if not exists ai_answers (
  id bigint generated always as identity primary key,
  question text not null,
  answer text not null,
  model text not null,              -- the model that wrote it
  lang text not null,               -- 'bn' or 'en': a Bangla question gets a Bangla answer
  embedding extensions.vector(384) not null,
  hits int not null default 0,      -- how many times it was reused
  created_at timestamptz not null default now()
);
create index if not exists ai_answers_embedding on ai_answers using hnsw (embedding extensions.vector_cosine_ops);
alter table ai_answers enable row level security; -- no policies: nobody but the service role

-- The closest saved answer (cosine similarity at least min_similarity) written by one of the given models, in this language.
create or replace function match_answer(query extensions.vector(384), min_similarity float, models text[], p_lang text)
returns table (id bigint, answer text, model text, similarity float)
language sql stable set search_path = '' as $$
  select a.id, a.answer, a.model, 1 - (a.embedding operator(extensions.<=>) query) as similarity
  from public.ai_answers a
  where a.model = any(models) and a.lang = p_lang
  order by a.embedding operator(extensions.<=>) query
  limit 1;
$$;
-- (min_similarity is checked by the caller on the returned similarity; the index needs a plain ORDER BY … LIMIT.)

create or replace function answer_reused(p_id bigint) returns void
language sql set search_path = '' as $$ update public.ai_answers set hits = hits + 1 where id = p_id; $$;

revoke all on table ai_answers from public, anon, authenticated;
revoke execute on function match_answer(extensions.vector, float, text[], text), answer_reused(bigint) from public, anon, authenticated;
grant all on table ai_answers to service_role;
grant execute on function match_answer(extensions.vector, float, text[], text), answer_reused(bigint) to service_role;
