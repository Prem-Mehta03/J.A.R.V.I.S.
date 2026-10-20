// Node "Items reply": turns the database rows into the JSON the app shows.
// @include _lib.js

const plan = $('Items plan').first().json.plan;

if (plan.action === 'reply') {
  return [{ json: { ok: false, error: plan.error, reply: plan.reply } }];
}

const rows = $input.all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
const dbError = rows.length > 0 && rows[0].error !== undefined && rows[0].id === undefined && rows[0].items === undefined;
if (dbError) {
  return [{ json: { ok: false, error: 'db_error', reply: "I couldn't reach my database just now. Please try again in a minute." } }];
}

const iso = (value) => (value ? isoIst(new Date(value)) : null);

if (plan.kind === 'list') {
  const row = rows[0];
  if (!row || !Array.isArray(row.items)) {
    return [{ json: { ok: false, error: 'db_error', reply: "I couldn't reach my database just now. Please try again in a minute." } }];
  }
  const items = row.items.map((r) => ({
    id: r.id, type: r.type, title: r.title, space: r.space, status: r.status,
    due_at: iso(r.due_at), remind_at: iso(r.remind_at), recurrence: r.recurrence || null,
    advance_days: Array.isArray(r.advance_days) ? r.advance_days : [],
  }));
  return [{ json: { ok: true, now: plan.now_iso, items, spaces: Array.isArray(row.spaces) ? row.spaces : [] } }];
}

// complete or cancel
const r = rows[0];
if (!r || !r.id) {
  return [{ json: { ok: false, error: 'not_found', reply: 'That item is already closed or no longer exists.' } }];
}
return [{ json: { ok: true, item: { id: r.id, type: r.type, title: r.title, space: r.space, status: r.status } } }];
