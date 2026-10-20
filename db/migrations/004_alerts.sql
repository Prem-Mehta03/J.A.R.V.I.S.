-- 004_alerts.sql
-- Run once in the Supabase SQL editor, after 003. Safe to re-run.
-- Supports the reminder dispatcher (M3) and the Google Calendar backup copies.

alter table jarvis.items add column if not exists calendar_event_id text;   -- Google Calendar copy of a reminder or date
alter table jarvis.items add column if not exists next_attempt_at timestamptz; -- retry time after a failed push

-- One row per advance alert already sent for a date, so each alert goes out once.
create table if not exists jarvis.alert_log (
  item_id       uuid not null references jarvis.items (id) on delete cascade,
  occurrence    date not null,            -- the date the alert is about (India calendar)
  advance_days  int  not null,            -- 0 means the day itself
  sent_at       timestamptz not null default now(),
  ok            boolean not null default true,   -- false while a failed push waits for its retry
  retry_at      timestamptz,
  primary key (item_id, occurrence, advance_days)
);

insert into jarvis.settings (key, value) values
  ('ntfy_topic', 'null'::jsonb),          -- set it with the update statement below
  ('calendar_backup', 'true'::jsonb)      -- false turns off the Google Calendar copies
on conflict (key) do nothing;

insert into jarvis.schema_migrations (version, description) values
  ('004', 'alert_log, calendar_event_id, ntfy_topic and calendar_backup settings')
on conflict (version) do nothing;

-- Your ntfy topic (the secret part of your ntfy address). Replace and run once:
--
--   update jarvis.settings set value = '"your-topic-here"'::jsonb where key = 'ntfy_topic';
--
-- To turn off the calendar copies:
--
--   update jarvis.settings set value = 'false'::jsonb where key = 'calendar_backup';

