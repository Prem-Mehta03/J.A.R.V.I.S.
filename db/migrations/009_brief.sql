-- 009_brief.sql (M9: morning brief)
-- Run once in the Supabase SQL editor, after 008. Safe to re-run.
-- brief_time: when the brief push is sent (India time, 24 hour). Change it by chat: "set my brief to 8 AM".
-- brief_last_sent: the date the push last went out, so it is sent once a day.

insert into jarvis.settings (key, value) values
  ('brief_time', '"07:00"'::jsonb),
  ('brief_last_sent', 'null'::jsonb)
on conflict (key) do nothing;

insert into jarvis.schema_migrations (version, description) values
  ('009', 'brief_time and brief_last_sent settings')
on conflict (version) do nothing;
