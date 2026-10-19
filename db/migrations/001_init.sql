-- 001_init.sql: Jarvis core schema.
-- Run once in the Supabase SQL editor. Safe to re-run (uses IF NOT EXISTS).

-- n8n keeps its own tables here (DB_POSTGRESDB_SCHEMA=n8n in render.yaml).
create schema if not exists n8n;

create schema if not exists jarvis;

-- Spaces: every item belongs to one, so personal vs college is a filter, not a migration.
create table if not exists jarvis.spaces (
  slug        text primary key,
  label       text not null,
  created_at  timestamptz not null default now()
);

insert into jarvis.spaces (slug, label) values
  ('personal', 'Personal'),
  ('college',  'College')
on conflict (slug) do nothing;

-- Items: reminders, tasks, important dates, habits and ideas share one table.
create table if not exists jarvis.items (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('reminder', 'task', 'date', 'habit', 'idea')),
  title            text not null,
  body             text,
  space            text not null default 'personal' references jarvis.spaces (slug),
  tags             text[] not null default '{}',
  -- reminders/tasks: open, done, cancelled. ideas: new, exploring, parked, done. habits: active, archived.
  status           text not null default 'open'
                   check (status in ('open', 'done', 'cancelled', 'new', 'exploring', 'parked', 'active', 'archived')),
  due_at           timestamptz,
  remind_at        timestamptz,
  advance_days     int[] not null default '{}',   -- for dates: alert N days before (e.g. {7,1})
  recurrence       text,                          -- RRULE text, e.g. FREQ=DAILY
  last_notified_at timestamptz,                   -- stops duplicate push alerts
  ios_reminder_ref text,                          -- marker used by the iOS Reminders sync
  source           text not null default 'chat',  -- chat, voice, shortcut, email, ...
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists items_type_status_idx on jarvis.items (type, status);
create index if not exists items_remind_at_idx   on jarvis.items (remind_at) where status = 'open';
create index if not exists items_space_idx       on jarvis.items (space);

-- Keep updated_at fresh.
create or replace function jarvis.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists items_touch_updated_at on jarvis.items;
create trigger items_touch_updated_at
  before update on jarvis.items
  for each row execute function jarvis.touch_updated_at();

-- Habit check-ins: one row per habit per day.
create table if not exists jarvis.habit_logs (
  id        uuid primary key default gen_random_uuid(),
  habit_id  uuid not null references jarvis.items (id) on delete cascade,
  log_date  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  done      boolean not null default true,
  unique (habit_id, log_date)
);

-- Study sessions.
create table if not exists jarvis.study_logs (
  id        uuid primary key default gen_random_uuid(),
  subject   text not null,
  minutes   int not null check (minutes > 0),
  log_date  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  space     text not null default 'college' references jarvis.spaces (slug),
  note      text,
  created_at timestamptz not null default now()
);

create index if not exists study_logs_date_idx on jarvis.study_logs (log_date);

-- Email classification rules, per account. User rules win over model guesses.
create table if not exists jarvis.email_rules (
  id          uuid primary key default gen_random_uuid(),
  account     text not null check (account in ('personal', 'college')),
  match_type  text not null check (match_type in ('sender', 'domain')),
  match_value text not null,
  label       text not null check (label in ('important', 'normal', 'promo')),
  source      text not null default 'user' check (source in ('user', 'llm')),
  created_at  timestamptz not null default now(),
  unique (account, match_type, match_value)
);

-- Corrections ("that was an ad"): fed back to the classifier as examples.
create table if not exists jarvis.email_feedback (
  id          uuid primary key default gen_random_uuid(),
  message_id  text not null,
  account     text not null check (account in ('personal', 'college')),
  sender      text,
  subject     text,
  llm_label   text check (llm_label in ('important', 'normal', 'promo')),
  user_label  text not null check (user_label in ('important', 'normal', 'promo')),
  created_at  timestamptz not null default now()
);

create index if not exists email_feedback_recent_idx on jarvis.email_feedback (created_at desc);

-- Lock the tables against the public Supabase API. n8n connects as the database owner,
-- which bypasses row level security, so nothing else can read these tables.
alter table jarvis.spaces         enable row level security;
alter table jarvis.items          enable row level security;
alter table jarvis.habit_logs     enable row level security;
alter table jarvis.study_logs     enable row level security;
alter table jarvis.email_rules    enable row level security;
alter table jarvis.email_feedback enable row level security;
