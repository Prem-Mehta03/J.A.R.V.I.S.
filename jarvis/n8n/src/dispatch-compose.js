// Node "Compose": turns the rows the database just claimed into push messages, and works out the next time for repeating reminders.
// @include _lib.js
// @include _rrule.js

const now = new Date();
const out = [];
for (const item of $input.all()) {
  const r = item.json;
  if (!r || !r.kind || !r.id) continue;
  let title;
  let message;
  let priority = 'default';
  let tags = 'alarm_clock';
  let nextRemind = '';
  let occurrence = '';
  let adv = 0;

  if (r.kind === 'reminder') {
    title = 'Reminder';
    message = r.title;
    priority = 'high';
    if (r.recurrence) {
      const next = nextOccurrence(r.recurrence, new Date(r.remind_at), now);
      if (next) nextRemind = next.toISOString();
    }
  } else {
    const due = new Date(r.due_at);
    adv = Number(r.advance_days);
    occurrence = isoIst(startOfIstDay(due)).slice(0, 10);
    const d = toIst(due);
    const dateText = `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
    tags = 'calendar';
    title = 'Important date';
    if (adv === 0) { message = `Today: ${r.title}`; priority = 'high'; }
    else if (adv === 1) message = `Tomorrow: ${r.title} (${dateText})`;
    else message = `In ${adv} days: ${r.title} (${dateText})`;
  }
  out.push({
    json: {
      kind: r.kind, id: r.id, topic: r.ntfy_topic || '', title, message: String(message).slice(0, 500), priority, tags,
      next_remind: nextRemind, occurrence, adv,
    },
  });
}
return out;
