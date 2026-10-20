-- 002_migration_log_and_settings.sql
-- Run once in the Supabase SQL editor, after 001_init.sql. Safe to re-run.
-- From now on, every migration ends by adding a row to jarvis.schema_migrations.

-- Which migrations have been applied.
create table if not exists jarvis.schema_migrations (
  version     text primary key,
  description text not null,
  applied_at  timestamptz not null default now()
);

-- Small key/value preferences, so they are data and not hard-coded inside workflows.
create table if not exists jarvis.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Reuses the function created in 001_init.sql.
drop trigger if exists settings_touch_updated_at on jarvis.settings;
create trigger settings_touch_updated_at
  before update on jarvis.settings
  for each row execute function jarvis.touch_updated_at();

insert into jarvis.settings (key, value) values
  ('timezone', '"Asia/Kolkata"'::jsonb),
  ('morning_briefing_time', 'null'::jsonb)  -- set to "HH:MM" once decided
on conflict (key) do nothing;

-- Same lock-down as the other tables: n8n connects as the database owner and is unaffected.
alter table jarvis.schema_migrations enable row level security;
alter table jarvis.settings          enable row level security;

insert into jarvis.schema_migrations (version, description) values
  ('001', 'Core schema: spaces, items, habit_logs, study_logs, email_rules, email_feedback'),
  ('002', 'schema_migrations and settings')
on conflict (version) do nothing;
