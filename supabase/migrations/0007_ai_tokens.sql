-- Ask AI limit by tokens, in four 6-hour windows a day (Bangladesh time), like Claude's usage limits:
-- the day's allowance (AI_DAILY_TOKENS, default 200,000) is split into 4 equal parts that refill every 6 hours.
alter table ai_usage add column tokens bigint not null default 0;
alter table ai_usage add column slot smallint not null default 0 check (slot between 0 and 3); -- 0: 00–06, 1: 06–12, 2: 12–18, 3: 18–24
alter table ai_usage drop constraint ai_usage_pkey;
alter table ai_usage add primary key (user_key, day, slot);
