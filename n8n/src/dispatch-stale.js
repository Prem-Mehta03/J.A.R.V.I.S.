// Node "Roll stale": moves repeating reminders that were missed (for example while the service slept for days) to their next time.
// @include _lib.js
// @include _rrule.js

const now = new Date();
const rows = [];
for (const item of $input.all()) {
  const r = item.json;
  if (!r || !r.id || !r.recurrence) continue;
  const next = nextOccurrence(r.recurrence, new Date(r.remind_at), now);
  rows.push({ id: r.id, next_remind: next ? next.toISOString() : '' });
}
if (!rows.length) return [];
return [{ json: { rows: JSON.stringify(rows) } }];
