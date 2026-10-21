-- 007_study.sql (Study tab: exam alerts and saved links)
-- Run once in the Supabase SQL editor, after 006. Safe to re-run.
-- Exam alerts (the evening before and two hours before) are ordinary reminders linked to the exam, so the existing
-- reminder engine rings them. parent_id is that link. Closing an exam cancels its alerts.

alter table jarvis.items add column if not exists parent_id uuid references jarvis.items (id) on delete cascade;
create index if not exists items_parent_idx on jarvis.items (parent_id) where parent_id is not null;

create table if not exists jarvis.links (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  url        text not null,
  created_at timestamptz not null default now()
);

insert into jarvis.schema_migrations (version, description) values
  ('007', 'parent_id for exam alerts, links table')
on conflict (version) do nothing;
