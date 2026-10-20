-- 005_bark.sql (M3.1)
-- Run once in the Supabase SQL editor, after 004. Safe to re-run.
-- Push alerts now go through Bark instead of ntfy, because ntfy.sh kept refusing requests from Render's shared address.

insert into jarvis.settings (key, value) values
  ('bark_key', 'null'::jsonb)             -- set it with the update statement below
on conflict (key) do nothing;

-- ntfy is no longer used.
delete from jarvis.settings where key = 'ntfy_topic';

-- Clear the old error so a fresh failure is easy to spot.
delete from jarvis.settings where key = 'last_push_error';

insert into jarvis.schema_migrations (version, description) values
  ('005', 'bark_key setting replaces ntfy_topic')
on conflict (version) do nothing;

-- Your Bark device key: the part of your Bark URL after https://api.day.app/ (open the Bark app to see it).
-- Replace the text and run once, keeping the double quotes inside the single quotes:
--
--   update jarvis.settings set value = '"your-bark-key"'::jsonb where key = 'bark_key';
