-- 006_habits_ideas.sql (M7)
-- Run once in the Supabase SQL editor, after 005. Safe to re-run.
-- Habits get an optional weekly target (for example "5 days a week"). Ideas use the existing title/body columns.

alter table jarvis.items add column if not exists target_per_week int
  check (target_per_week is null or target_per_week between 1 and 7);

create index if not exists habit_logs_habit_date_idx on jarvis.habit_logs (habit_id, log_date);

insert into jarvis.schema_migrations (version, description) values
  ('006', 'habits weekly target, habit log index')
on conflict (version) do nothing;
