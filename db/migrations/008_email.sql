-- 008_email.sql (M8: email intelligence)
-- Run once in the Supabase SQL editor, after 007. Safe to re-run.
-- Only sender, subject and a short snippet of each mail are stored. Never the body.
-- email_rules and email_feedback already exist from 001_init.sql and are used as they are:
--   email_rules (account, match_type 'sender' or 'domain', match_value, label, source)
--   email_feedback (message_id = the Gmail id, account, sender, subject, llm_label, user_label)

create table if not exists jarvis.email_messages (
  id           uuid primary key default gen_random_uuid(),
  account      text not null check (account in ('personal', 'college')),
  gmail_id     text not null,
  thread_id    text,
  sender_name  text not null default '',
  sender_email text not null,
  subject      text not null default '',
  snippet      text not null default '',
  received_at  timestamptz not null,
  label        text not null check (label in ('important', 'normal', 'promo')),
  label_source text not null check (label_source in ('rule', 'gmail', 'llm', 'user')),
  created_at   timestamptz not null default now(),
  unique (account, gmail_id)
);
create index if not exists email_messages_recent_idx on jarvis.email_messages (account, received_at desc);

-- Same lock as the other tables: only n8n (the database owner) can read it.
alter table jarvis.email_messages enable row level security;

insert into jarvis.schema_migrations (version, description) values
  ('008', 'email_messages table (rules and feedback tables come from 001)')
on conflict (version) do nothing;
