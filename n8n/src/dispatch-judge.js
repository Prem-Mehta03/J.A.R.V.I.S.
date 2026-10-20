// Node "Judge": pairs each push attempt with its result. For a push that failed, it also prepares the Google Calendar
// event that will make the phone ring instead (a couple of minutes from now), so there is still exactly one alert.
// @include _lib.js

const planned = $('Compose').all().map((i) => i.json);
const results = $input.all().map((i) => i.json);

const now = new Date();
// The next whole minute that is at least two minutes away, so the calendar alert is in the future when Google receives it.
const start = new Date(Math.ceil((now.getTime() + 120000) / 60000) * 60000);
const end = new Date(start.getTime() + 15 * 60000);

return planned.map((p, idx) => {
  const r = results.length === planned.length ? results[idx] : null;
  // The Bark node returns the full answer (statusCode, headers, body). The no-key path passes the composed items straight on.
  let ok = false;
  let pushError = '';
  if (r && r.kind) {
    pushError = 'no bark_key is set in jarvis.settings';
  } else if (r && typeof r.statusCode === 'number') {
    const body = r.body && typeof r.body === 'object' ? r.body : {};
    ok = r.statusCode >= 200 && r.statusCode < 300 && (body.code === undefined || Number(body.code) === 200);
    if (!ok) {
      const detail = typeof r.body === 'string' ? r.body : (body.message || body.error || JSON.stringify(r.body || ''));
      const retry = r.headers && (r.headers['retry-after'] || r.headers['x-ratelimit-reset']);
      pushError = `HTTP ${r.statusCode}${body.code ? ` (code ${body.code})` : ''}: ${detail}${retry ? ` [retry-after ${retry}]` : ''}`;
    }
  } else if (r && r.error) {
    const e = r.error;
    pushError = typeof e === 'string' ? e : ([e && e.httpCode, e && e.message, e && e.description].filter(Boolean).join(' - ') || JSON.stringify(e));
  } else {
    pushError = 'Bark gave no answer';
  }
  pushError = pushError.replace(/\s+/g, ' ').slice(0, 400);
  const backup = ok ? null : {
    summary: (p.kind === 'reminder' ? '⏰ ' : '📅 ') + p.message,
    description: 'Sent by Jarvis because the push notification failed',
    start: { dateTime: isoIst(start), timeZone: 'Asia/Kolkata' },
    end: { dateTime: isoIst(end), timeZone: 'Asia/Kolkata' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  };
  return { json: Object.assign({}, p, { ok, backup_body: backup, push_error: pushError }) };
});
