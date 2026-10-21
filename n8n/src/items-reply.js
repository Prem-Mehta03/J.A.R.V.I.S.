// Node "Items reply": turns the database rows into the JSON the app shows.
// @include _lib.js

const plan = $('Items plan').first().json.plan;

if (plan.action === 'reply') {
  return [{ json: { ok: false, error: plan.error, reply: plan.reply } }];
}

const rows = $input.all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
const dbError = rows.length > 0 && rows[0].error !== undefined && rows[0].id === undefined && rows[0].items === undefined && rows[0].emails === undefined && rows[0].changed === undefined;
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
  const links = (Array.isArray(row.links) ? row.links : []).map((k) => ({ id: k.id, title: k.title, url: k.url }));
  const items = row.items.map((r) => ({
    id: r.id, type: r.type, title: r.title, space: r.space, status: r.status,
    due_at: iso(r.due_at), remind_at: iso(r.remind_at), recurrence: r.recurrence || null,
    advance_days: Array.isArray(r.advance_days) ? r.advance_days : [],
  }));
  return [{ json: { ok: true, now: plan.now_iso, items, habits, ideas, links, spaces: Array.isArray(row.spaces) ? row.spaces : [] } }];
}

if (plan.kind === 'email_list') {
  const row = rows[0];
  if (!row || !Array.isArray(row.emails)) return [{ json: { ok: false, error: 'db_error', reply: "I couldn't reach my database just now. Please try again in a minute." } }];
  const emails = row.emails.map((m) => ({
    id: m.id, account: m.account, from: m.sender_name || m.sender_email, sender: m.sender_email, subject: m.subject, snippet: m.snippet,
    received_at: iso(m.received_at), label: m.label, by: m.label_source,
  }));
  const rules = (Array.isArray(row.rules) ? row.rules : []).map((r) => ({ id: r.id, account: r.account, sender: r.sender, label: r.label }));
  return [{ json: { ok: true, emails, rules, synced_at: iso(row.synced_at) } }];
}

if (plan.kind === 'email_label') {
  const row = rows[0];
  if (!row || !Number(row.changed)) return [{ json: { ok: false, error: 'not_found', reply: 'That email is no longer stored.' } }];
  return [{ json: { ok: true, changed: Number(row.changed), sender: row.sender, account: row.account } }];
}

if (plan.kind === 'email_rule_delete') {
  const row = rows[0];
  if (!row || !row.id) return [{ json: { ok: false, error: 'not_found', reply: 'That rule no longer exists.' } }];
  return [{ json: { ok: true, id: row.id } }];
}

if (plan.kind === 'link_create' || plan.kind === 'link_delete') {
  const row = rows[0];
  if (!row || !row.id) return [{ json: { ok: false, error: 'not_found', reply: 'That link no longer exists.' } }];
  return [{ json: { ok: true, link: { id: row.id, title: row.title, url: row.url } } }];
}

if (plan.kind === 'exam_create' || plan.kind === 'work_create') {
  const row = rows[0];
  if (!row || !row.id) return [{ json: { ok: false, error: 'db_error', reply: "I couldn't reach my database just now. Please try again in a minute." } }];
  return [{ json: { ok: true, item: { id: row.id, type: row.type, title: row.title, space: row.space, due_at: iso(row.due_at), remind_at: null, recurrence: null, advance_days: Array.isArray(row.advance_days) ? row.advance_days : [] }, alerts: row.alerts === undefined ? undefined : Number(row.alerts) } }];
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
