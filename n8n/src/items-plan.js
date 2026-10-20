// Node "Items plan": checks what the app asked for and picks the fixed database statement to run.
// The app can list open items, or mark one done or cancelled by its id. Nothing else.
// @include _lib.js

const first = $input.first().json || {};
const body = first.body && typeof first.body === 'object' ? first.body : {};
const action = typeof body.action === 'string' ? body.action : '';
const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
const now = new Date();

const fail = (error, reply) => [{ json: { plan: { ok: false, action: 'reply', error, reply } } }];

const LIST_SQL = `select
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
return fail('bad_action', 'The app asked for something Jarvis does not do.');
