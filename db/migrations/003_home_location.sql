-- 003_home_location.sql
-- Run once in the Supabase SQL editor, after 002. Safe to re-run.
-- Adds the setting the weather feature uses when you ask "what's the weather" without naming a place.

insert into jarvis.settings (key, value) values
  ('home_location', 'null'::jsonb)  -- set it with the update statement below
on conflict (key) do nothing;

insert into jarvis.schema_migrations (version, description) values
  ('003', 'home_location setting for the weather feature')
on conflict (version) do nothing;

-- Set your own location (replace the name and coordinates, then run this once):
--
--   update jarvis.settings
--   set value = '{"name": "Goa", "lat": 15.39, "lon": 73.88}'::jsonb
--   where key = 'home_location';
