-- Count an AI answer in one step. The server used to read the row and write it back, so answers that finished at the
-- same moment overwrote each other's count: four questions sent together cost the student about as much as one or two
-- (found by `npm run check:cap`). Adding inside the database counts every one of them.
create function ai_usage_add(p_key text, p_day date, p_slot int, p_institute uuid, p_cost numeric, p_tokens bigint) returns void
language sql set search_path = public as $$
  insert into ai_usage (user_key, day, slot, institute_id, questions, cost_usd, tokens)
  values (p_key, p_day, p_slot, p_institute, 1, p_cost, p_tokens)
  on conflict (user_key, day, slot) do update
    set questions = ai_usage.questions + 1, cost_usd = ai_usage.cost_usd + excluded.cost_usd, tokens = ai_usage.tokens + excluded.tokens;
$$;
-- Only the server may run it (see 0008: Postgres lets everyone run a new function by default).
revoke execute on function ai_usage_add(text, date, int, uuid, numeric, bigint) from public, anon, authenticated;
grant execute on function ai_usage_add(text, date, int, uuid, numeric, bigint) to service_role;
