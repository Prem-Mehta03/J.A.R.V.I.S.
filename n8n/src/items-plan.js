// Node "Items plan": checks what the app asked for and picks the fixed database statement to run.
// The app can list open items, habits and ideas, close items by id, check habits in and out, and add, edit or delete ideas. Nothing else.
// @include _lib.js

const first = $input.first().json || {};
const body = first.body && typeof first.body === 'object' ? first.body : {};
const action = typeof body.action === 'string' ? body.action : '';
const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
const now = new Date();

const fail = (error, reply) => [{ json: { plan: { ok: false, action: 'reply', error, reply } } }];

const HABITS_SQL = `(select coalesce(json_agg(h), '[]'::json) from (
     select i.id, i.title, i.space, i.target_per_week, i.created_at,
            (select coalesce(json_agg(to_char(l.log_date, 'YYYY-MM-DD') order by l.log_date), '[]'::json)
             from jarvis.habit_logs l
             where l.habit_id = i.id and l.done and l.log_date >= (now() at time zone 'Asia/Kolkata')::date - 400) as dates
     from jarvis.items i where i.type = 'habit' and i.status = 'active' order by i.created_at
   ) h) as habits,
  (select coalesce(json_agg(d), '[]'::json) from (
     select id, title, body, created_at, updated_at from jarvis.items
     where type = 'idea' and status <> 'archived' order by updated_at desc limit 200
   ) d) as ideas,`;

const LIST_SQL = `select
  ${HABITS_SQL}
  (select coalesce(json_agg(x), '[]'::json) from (
     select id, type, title, space, status, due_at, remind_at, recurrence, advance_days, created_at
     from jarvis.items
     where status = 'open' and type in ('reminder', 'task', 'date')
     order by coalesce(remind_at, due_at) nulls last, created_at
     limit 300
   ) x) as items,
  (select coalesce(json_agg(json_build_object('slug', slug, 'label', label) order by slug), '[]'::json) from jarvis.spaces) as spaces`;

const CLOSE_SQL = `update jarvis.items set status = $2
where id = $1::uuid and status = 'open' and type in ('reminder', 'task', 'date')
returning id, type, title, space, status`;

if (action === 'list') {
  return [{ json: { plan: { ok: true, action: 'sql', kind: 'list', sql: LIST_SQL, params: [], now_iso: isoIst(now) } } }];
}
if (action === 'complete' || action === 'cancel') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return fail('bad_id', 'That item has no valid id.');
  }
  return [{ json: { plan: { ok: true, action: 'sql', kind: action, sql: CLOSE_SQL, params: [id, action === 'complete' ? 'done' : 'cancelled'], now_iso: isoIst(now) } } }];
}

// ---- habits and ideas ----
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const okId = UUID.test(id);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const sql = (kind, text, params) => [{ json: { plan: { ok: true, action: 'sql', kind, sql: text, params, now_iso: isoIst(now) } } }];
const validDate = (str) => { const d = new Date(str + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str; };
const ideaTitle = (text) => (text.split('\n').map((l) => l.trim()).find(Boolean) || '').slice(0, 80);

if (action === 'habit_create') {
  const title = clean(body.title, 60).replace(/\s+/g, ' ');
  if (!title) return fail('missing_title', 'What should the habit be called?');
  const target = Number.isInteger(body.target_per_week) && body.target_per_week >= 1 && body.target_per_week <= 7 ? body.target_per_week : null;
  return sql('habit_create', `with ex as (select id, title from jarvis.items where type = 'habit' and status = 'active' and lower(title) = lower($1) limit 1),
ins as (insert into jarvis.items (type, title, status, target_per_week, source)
        select 'habit', $1, 'active', $2::int, 'app' where not exists (select 1 from ex) returning id, title)
select id, title, false as existing from ins union all select id, title, true from ex`, [title, target]);
}
if (action === 'habit_log') {
  if (!okId) return fail('bad_id', 'That habit has no valid id.');
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const today = istDateStr(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validDate(date)) return fail('bad_date', 'That date is not valid.');
  if (date > today) return fail('future_date', 'You cannot log a habit for a day that has not happened yet.');
  if (dayNumber(today) - dayNumber(date) > 400) return fail('old_date', 'That date is too far back.');
  if (body.done === false) {
    return sql('habit_log', `with d as (delete from jarvis.habit_logs where habit_id = $1::uuid and log_date = $2::date returning habit_id)
select id, title from jarvis.items where id = $1::uuid and type = 'habit' and status = 'active'`, [id, date]);
  }
  return sql('habit_log', `with h as (select id, title from jarvis.items where id = $1::uuid and type = 'habit' and status = 'active'),
up as (insert into jarvis.habit_logs (habit_id, log_date, done) select id, $2::date, true from h
       on conflict (habit_id, log_date) do update set done = true returning habit_id)
select id, title from h`, [id, date]);
}
if (action === 'habit_archive') {
  if (!okId) return fail('bad_id', 'That habit has no valid id.');
  return sql('habit_archive', `update jarvis.items set status = 'archived' where id = $1::uuid and type = 'habit' and status = 'active' returning id, title`, [id]);
}
if (action === 'idea_create') {
  const text = clean(body.text, 4000);
  if (!text) return fail('missing_text', 'The idea was empty.');
  return sql('idea_create', `insert into jarvis.items (type, title, body, status, source) values ('idea', $1, $2, 'new', $3) returning id, title, body, created_at, updated_at`,
    [ideaTitle(text), text, ['app', 'shortcut', 'voice'].includes(body.source) ? body.source : 'app']);
}
if (action === 'idea_update') {
  if (!okId) return fail('bad_id', 'That idea has no valid id.');
  const text = clean(body.text, 4000);
  if (!text) return fail('missing_text', 'The idea was empty.');
  return sql('idea_update', `update jarvis.items set title = $2, body = $3 where id = $1::uuid and type = 'idea' returning id, title, body, created_at, updated_at`, [id, ideaTitle(text), text]);
}
if (action === 'idea_delete') {
  if (!okId) return fail('bad_id', 'That idea has no valid id.');
  return sql('idea_delete', `delete from jarvis.items where id = $1::uuid and type = 'idea' returning id, title`, [id]);
}
return fail('bad_action', 'The app asked for something Jarvis does not do.');
