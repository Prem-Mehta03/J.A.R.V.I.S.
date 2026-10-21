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
  const habits = (Array.isArray(row.habits) ? row.habits : []).map((h) => ({
    id: h.id, title: h.title, space: h.space, target_per_week: h.target_per_week || null, created_at: iso(h.created_at),
    dates: Array.isArray(h.dates) ? h.dates : [],
  }));
  const ideas = (Array.isArray(row.ideas) ? row.ideas : []).map((d) => ({
    id: d.id, title: d.title, body: d.body || d.title, created_at: iso(d.created_at), updated_at: iso(d.updated_at),
  }));
  const items = row.items.map((r) => ({
    id: r.id, type: r.type, title: r.title, space: r.space, status: r.status,
    due_at: iso(r.due_at), remind_at: iso(r.remind_at), recurrence: r.recurrence || null,
    advance_days: Array.isArray(r.advance_days) ? r.advance_days : [],
  }));
  return [{ json: { ok: true, now: plan.now_iso, items, habits, ideas, spaces: Array.isArray(row.spaces) ? row.spaces : [] } }];
}

if (plan.kind.startsWith('habit_') || plan.kind.startsWith('idea_')) {
  const row = rows[0];
  if (!row || !row.id) return [{ json: { ok: false, error: 'not_found', reply: 'That one no longer exists.' } }];
  const key = plan.kind.startsWith('habit_') ? 'habit' : 'idea';
  return [{ json: { ok: true, [key]: { id: row.id, title: row.title, existing: row.existing === true, body: row.body || undefined, created_at: iso(row.created_at), updated_at: iso(row.updated_at) } } }];
}

// complete or cancel
const r = rows[0];
if (!r || !r.id) {
  return [{ json: { ok: false, error: 'not_found', reply: 'That item is already closed or no longer exists.' } }];
}
return [{ json: { ok: true, item: { id: r.id, type: r.type, title: r.title, space: r.space, status: r.status } } }];
