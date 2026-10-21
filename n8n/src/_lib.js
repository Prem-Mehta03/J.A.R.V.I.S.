// ---- shared helpers: scripts/build_workflows.py pastes this into every Code node that includes it ----
// India has no daylight saving, so a fixed +05:30 offset is exact.
const IST_OFFSET_MIN = 330;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad2 = (n) => String(n).padStart(2, '0');
// Shift a Date so that the getUTC* methods return India clock values.
const toIst = (date) => new Date(date.getTime() + IST_OFFSET_MIN * 60000);
const addDays = (date, n) => new Date(date.getTime() + n * 86400000);

function isoIst(date) {
  const d = toIst(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}+05:30`;
}

function startOfIstDay(date) {
  const d = toIst(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MIN * 60000);
}

// A moment on the India calendar: dayOffset days from today's date, at hour:minute.
function istAt(now, dayOffset, hour, minute) {
  return new Date(startOfIstDay(now).getTime() + dayOffset * 86400000 + (hour * 60 + (minute || 0)) * 60000);
}

// Accepts 2026-10-21, 2026-10-21T18:00, 2026-10-21T18:00:00+05:30, ...Z. No offset means India time.
function parseWhen(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  let offsetMin = IST_OFFSET_MIN;
  if (tz) {
    if (tz === 'Z') offsetMin = 0;
    else {
      const digits = tz.replace(':', '');
      offsetMin = (digits[0] === '-' ? -1 : 1) * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
    }
  }
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0), Number(s || 0)) - offsetMin * 60000;
  const date = new Date(utc);
  const year = Number(y);
  if (Number.isNaN(date.getTime()) || year < 2020 || year > 2100) return null;
  // Reject impossible dates such as 2026-02-31 (they would silently roll over).
  const check = new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
  if (check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) return null;
  return date;
}

function clock12(date) {
  const d = toIst(date);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const h12 = h % 12 || 12;
  return `${h12}${m ? ':' + pad2(m) : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}

// "today at 6 PM", "tomorrow", "on Friday at 4:30 PM", "on 12 November". allDay drops the time.
function speakWhen(date, now, allDay) {
  const diff = Math.round((startOfIstDay(date).getTime() - startOfIstDay(now).getTime()) / 86400000);
  const d = toIst(date);
  let day;
  if (diff === 0) day = 'today';
  else if (diff === 1) day = 'tomorrow';
  else if (diff === -1) day = 'yesterday';
  else if (diff > 1 && diff < 7) day = 'on ' + DAY_NAMES[d.getUTCDay()];
  else {
    day = `on ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
    if (d.getUTCFullYear() !== toIst(now).getUTCFullYear()) day += ` ${d.getUTCFullYear()}`;
  }
  return allDay ? day : `${day} at ${clock12(date)}`;
}

function lowerFirst(text) {
  // "Call home" -> "call home", but leave "SQL exam" and "I owe Ravi" alone.
  if (text.length > 1 && /[A-Z]/.test(text[0]) && /[a-z]/.test(text[1])) return text[0].toLowerCase() + text.slice(1);
  return text;
}

// Models sometimes wrap JSON in code fences or add a sentence around it.
function parseLlmJson(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

// ---- habits ----
// The India calendar date of a moment, as 2026-10-21.
function istDateStr(date) {
  const d = toIst(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
const dayNumber = (str) => Math.round(Date.UTC(Number(str.slice(0, 4)), Number(str.slice(5, 7)) - 1, Number(str.slice(8, 10))) / 86400000);

// Streak numbers from the days a habit was done. The current streak counts back from today, or from yesterday
// when today is not done yet, so it only drops to zero once a whole day has been missed.
function streakInfo(dates, today) {
  const days = [...new Set((dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(dayNumber))].sort((a, b) => a - b);
  const set = new Set(days);
  const t = dayNumber(today);
  let current = 0;
  for (let d = set.has(t) ? t : t - 1; set.has(d); d--) current++;
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev !== null && d === prev + 1 ? run + 1 : 1; if (run > best) best = run; prev = d; }
  return { current, best, total: days.length, doneToday: set.has(t) };
}

