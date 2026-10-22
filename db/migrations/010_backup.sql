-- 010_backup.sql (M11: backup and restore)
-- Run once in the Supabase SQL editor, after 009. Safe to re-run.
-- export_all(): all Jarvis data as one JSON document (the nightly backup calls it).
--   Left out on purpose: email_messages (rebuilt from Gmail), schema_migrations, and the Bark key (so a backup
--   file never holds a push key; enter it again after a restore).
-- import_all(json): puts a backup back into a database that already has the tables (migrations 001 to 010 applied).
--   Rows that already exist are kept, except settings, which are overwritten by the backup. Tables are filled in a
--   safe order automatically. Answers what was restored.

create or replace function jarvis.export_all() returns jsonb
language plpgsql as $fn$
declare
  t text;
  rows_ jsonb;
  out_ jsonb := '{}'::jsonb;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'jarvis' and table_type = 'BASE TABLE'
      and table_name not in ('email_messages', 'schema_migrations')
    order by table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from jarvis.%I x', t) into rows_;
    if t = 'settings' then
      select coalesce(jsonb_agg(r), '[]'::jsonb) into rows_ from jsonb_array_elements(rows_) r where r->>'key' <> 'bark_key';
    end if;
    out_ := out_ || jsonb_build_object(t, rows_);
  end loop;
  return jsonb_build_object('app', 'jarvis', 'version', 1, 'exported_at', now(), 'tables', out_);
end
$fn$;

create or replace function jarvis.import_all(data jsonb) returns jsonb
language plpgsql as $fn$
declare
  tbl jsonb := data -> 'tables';
  pending text[];
  t text;
  n int;
  pass_ int;
  progress boolean;
  done_ jsonb := '{}'::jsonb;
  sql_ text;
begin
  if tbl is null or jsonb_typeof(tbl) <> 'object' then
    raise exception 'This is not a Jarvis backup (no "tables" object).';
  end if;
  select array_agg(k) into pending
  from jsonb_object_keys(tbl) k
  where k not in ('email_messages', 'schema_migrations')
    and exists (select 1 from information_schema.tables where table_schema = 'jarvis' and table_name = k and table_type = 'BASE TABLE');

  for pass_ in 1..8 loop
    exit when pending is null or cardinality(pending) = 0;
    progress := false;
    foreach t in array pending loop
      begin
        if t = 'settings' then
          -- a stored JSON null comes back as SQL null from the recordset, so settings are read key by key
          sql_ := 'insert into jarvis.settings (key, value) select r->>''key'', coalesce(r->''value'', ''null''::jsonb) from jsonb_array_elements($1) r on conflict (key) do update set value = excluded.value';
        else
          sql_ := format('insert into jarvis.%I select * from jsonb_populate_recordset(null::jarvis.%I, $1) on conflict do nothing', t, t);
        end if;
        execute sql_ using tbl -> t;
        get diagnostics n = row_count;
        done_ := done_ || jsonb_build_object(t, n);
        pending := array_remove(pending, t);
        progress := true;
      exception when foreign_key_violation then
        null; -- its parent table is not in yet; try again on the next pass
      end;
    end loop;
    exit when not progress;
  end loop;
  return jsonb_build_object('restored', done_, 'not_restored', to_jsonb(coalesce(pending, '{}'::text[])));
end
$fn$;

insert into jarvis.settings (key, value) values
  ('backup_last_ok', 'null'::jsonb),
  ('backup_repo', 'null'::jsonb),  -- "owner/repo" of the private GitHub repository that receives the nightly backup
  ('health_alerts', '{}'::jsonb),
  ('email_status', 'null'::jsonb)
on conflict (key) do nothing;

insert into jarvis.schema_migrations (version, description) values
  ('010', 'export_all and import_all, backup and health settings')
on conflict (version) do nothing;
