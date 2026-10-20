// Node "Calendar plan": decides whether the Google Calendar backup copy of an item must be created or removed.
// Runs after the database step as a side branch, so a slow or failing calendar never delays the spoken reply.
// @include _lib.js

const plan = $('Plan').first().json.plan;
const rows = $('Run SQL').all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
const row = rows[0];
if (!row) return [];

// Remove the calendar copy when an item is completed or cancelled (even if the backup was switched off since).
if (plan.intent === 'item.complete' || plan.intent === 'item.cancel') {
  const u = row.updated;
  if (Number(row.match_count) === 1 && u && typeof u.calendar_event_id === 'string' && u.calendar_event_id) {
    return [{ json: { op: 'delete', event_id: u.calendar_event_id } }];
  }
  return [];
}

if (!plan.ctx.calendar_backup) return [];
if (!row.id) return [];

if (plan.intent === 'reminder.create' && row.remind_at) {
  const start = new Date(row.remind_at);
  const end = new Date(start.getTime() + 15 * 60000);
  const body = {
    summary: '⏰ ' + row.title,
    description: 'Created by Jarvis',
    start: { dateTime: isoIst(start), timeZone: 'Asia/Kolkata' },
    end: { dateTime: isoIst(end), timeZone: 'Asia/Kolkata' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    extendedProperties: { private: { jarvis_id: row.id } },
  };
  if (row.recurrence) body.recurrence = ['RRULE:' + row.recurrence];
  return [{ json: { op: 'create', item_id: row.id, body } }];
}

if (plan.intent === 'date.create' && row.due_at) {
  const day = new Date(row.due_at);
  const startDay = isoIst(startOfIstDay(day)).slice(0, 10);
  const endDay = isoIst(addDays(startOfIstDay(day), 1)).slice(0, 10);
  // An all-day event starts at midnight, so "N days before at 9 AM" is N*1440 - 540 minutes before it.
  const advance = Array.isArray(row.advance_days) ? row.advance_days : [];
  const minutes = [...new Set([0, ...advance.filter((n) => Number.isInteger(n) && n >= 0 && n <= 28)])]
    .sort((a, b) => b - a)
    .slice(0, 5)
    .map((n) => (n === 0 ? 0 : n * 1440 - 540));
  const body = {
    summary: '📅 ' + row.title,
    description: 'Created by Jarvis',
    start: { date: startDay },
    end: { date: endDay },
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: minutes.map((m) => ({ method: 'popup', minutes: m })) },
    extendedProperties: { private: { jarvis_id: row.id } },
  };
  if (row.recurrence) body.recurrence = ['RRULE:' + row.recurrence];
  return [{ json: { op: 'create', item_id: row.id, body } }];
}

return [];
