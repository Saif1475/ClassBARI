-- Saved AI answers: closeness of meaning alone reused answers for different questions ("second law" / "third law",
-- two equations that differ in one number). The server now also compares the words, so the function hands back the
-- saved question too, for the closest few instead of the closest one. (The return shape changes: drop, then create.)
drop function if exists match_answer(extensions.vector, float, text[], text);

create function match_answer(query extensions.vector(384), min_similarity float, models text[], p_lang text)
returns table (id bigint, question text, answer text, model text, similarity float)
language sql stable set search_path = '' as $$
  select a.id, a.question, a.answer, a.model, 1 - (a.embedding operator(extensions.<=>) query) as similarity
  from public.ai_answers a
  where a.model = any(models) and a.lang = p_lang
  order by a.embedding operator(extensions.<=>) query
  limit 5;
$$;
-- (min_similarity and the wording are checked by the caller; the index needs a plain ORDER BY … LIMIT.)

revoke execute on function match_answer(extensions.vector, float, text[], text) from public, anon, authenticated;
grant execute on function match_answer(extensions.vector, float, text[], text) to service_role;
