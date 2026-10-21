// Node "Sync plan": checks what the Shortcut sent and builds the one fixed statement for the iOS Reminders sync.
// The Shortcut sends two lists of Jarvis ids it read from the notes of reminders in the "Jarvis" list:
//   done:  the ones ticked off on the iPhone (Jarvis marks them done)
//   known: the ones still open on the iPhone (Jarvis says which of these should now be closed there, and what is new)
// @include _lib.js

const first = $input.first().json || {};
const body = first.body && typeof first.body === 'object' ? first.body : {};
const now = new Date();

const fail = (error, reply) => [{ json: { plan: { ok: false, action: 'reply', error, reply } } }];

// The Shortcut sends the notes of the reminders as one text (or a list). Only things shaped like an id are used,
// so a reminder with no notes, or notes you typed yourself, is simply ignored.
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const toList = (v) => {
  if (v == null || v === '') return [];
  const text = Array.isArray(v) ? v.map(String).join('\n') : String(v);
  return (text.match(UUID_G) || []).map((x) => x.toLowerCase());
};
const done = toList(body.done);
const known = toList(body.known);
if (done.length > 200 || known.length > 200) return fail('too_many', 'That is more reminders than one sync handles. Clear some completed ones from the Jarvis list.');
const uniq = (a) => [...new Set(a)];
const arr = (a) => '{' + uniq(a).join(',') + '}';

const SYNC_SQL = `with closed as (
  update jarvis.items set status = 'done'
  where id = any($1::uuid[]) and status = 'open' and type in ('reminder', 'task')
  returning id
)
select
  (select coalesce(json_agg(x), '[]'::json) from (
     select id, type, title, remind_at, due_at
     from jarvis.items
     where status = 'open' and type in ('reminder', 'task') and recurrence is null
       and id <> all($1::uuid[]) and id <> all($2::uuid[])
     order by coalesce(remind_at, due_at) nulls last, created_at
     limit 50
   ) x) as add,
  (select coalesce(json_agg(k), '[]'::json) from unnest($2::uuid[]) k
     where not exists (select 1 from jarvis.items i where i.id = k and i.status = 'open')
       and k <> all($1::uuid[])) as close_ids,
  (select count(*) from closed)::int as completed`;

return [{ json: { plan: { ok: true, action: 'sql', sql: SYNC_SQL, params: [arr(done), arr(known)], now_iso: isoIst(now) } } }];
