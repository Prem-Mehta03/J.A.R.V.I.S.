// Node "Sync reply": shapes the database answer into what the "Jarvis Sync" Shortcut reads.
// @include _lib.js

const plan = $('Sync plan').first().json.plan;
if (plan.action === 'reply') {
  return [{ json: { ok: false, error: plan.error, reply: plan.reply } }];
}

const rows = $input.all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
const row = rows[0];
if (!row || !Array.isArray(row.add)) {
  return [{ json: { ok: false, error: 'db_error', reply: "I couldn't reach my database just now. Please try again in a minute." } }];
}

const when = (v) => (v ? isoIst(new Date(v)) : '');
const mapped = row.add.map((r) => ({ id: r.id, title: r.title, due: when(r.remind_at || r.due_at), note: 'jarvis:' + r.id }));
const add = mapped.filter((r) => r.due);          // has a time: the Shortcut sets the due date
const addPlain = mapped.filter((r) => !r.due);    // no time: the Shortcut adds the title only
const closeIds = Array.isArray(row.close_ids) ? row.close_ids : [];
const completed = Number(row.completed) || 0;

const parts = [];
if (mapped.length) parts.push(`${mapped.length} new`);
if (closeIds.length) parts.push(`${closeIds.length} closed on your phone`);
if (completed) parts.push(`${completed} marked done in Jarvis`);
const reply = parts.length ? 'Synced. ' + parts.join(', ') + '.' : 'Everything is already in sync.';

return [{ json: { ok: true, now: plan.now_iso, add, add_plain: addPlain, close_ids: closeIds, close_text: closeIds.join('\n'), completed, reply } }];
