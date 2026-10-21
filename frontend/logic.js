// Pure helpers for the Jarvis app: India-time formatting, grouping of items into the screens, address checking.
// Nothing here touches the page or the network, so it can be tested with plain Node.

export const IST_OFFSET_MS = 330 * 60000; // India has no daylight saving, so a fixed +05:30 is exact.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const shift = (d) => new Date(d.getTime() + IST_OFFSET_MS); // getUTC* now reads India clock values

export function startOfDay(d) {
  const s = shift(d);
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - IST_OFFSET_MS);
}

// Whole India calendar days from `from` to `to` (negative when `to` is earlier).
export function dayDiff(to, from) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

export function fmtTime(d) {
  const s = shift(d);
  const h = s.getUTCHours();
  const m = s.getUTCMinutes();
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'pm' : 'am'}`;
}

export function fmtShortDate(d, now) {
  const s = shift(d);
  let text = `${DAYS[s.getUTCDay()].slice(0, 3)} ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()].slice(0, 3)}`;
  if (shift(now).getUTCFullYear() !== s.getUTCFullYear()) text += ` ${s.getUTCFullYear()}`;
  return text;
}

export function fmtDay(d, now) {
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return fmtShortDate(d, now);
}

export function longDate(now) {
  const s = shift(now);
  return { weekday: DAYS[s.getUTCDay()], day: `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}` };
}

export const isEndOfDay = (d) => {
  const s = shift(d);
  return s.getUTCHours() === 23 && s.getUTCMinutes() === 59;
};

export const itemTime = (item) => {
  const v = item.remind_at || item.due_at;
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export function repeatText(rule) {
  if (!rule) return '';
  const freq = (rule.match(/^FREQ=(\w+)/) || [])[1];
  const by = (rule.match(/BYDAY=([A-Z,]+)/) || [])[1];
  const names = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
  if (freq === 'DAILY') return 'Repeats daily';
  if (freq === 'WEEKLY') return by ? 'Repeats ' + by.split(',').map((x) => names[x] || x).join(', ') : 'Repeats weekly';
  if (freq === 'MONTHLY') return 'Repeats monthly';
  if (freq === 'YEARLY') return 'Repeats yearly';
  return '';
}

export function filterSpace(items, slug) {
  return !slug || slug === 'all' ? items : items.filter((i) => i.space === slug);
}

const byTime = (a, b) => (itemTime(a)?.getTime() ?? Infinity) - (itemTime(b)?.getTime() ?? Infinity);

// ---- Today: overdue, then today as a timeline with a "now" position, then tomorrow ----
export function groupToday(items, now) {
  const overdue = [];
  const tomorrow = [];
  const rail = [];
  for (const item of items) {
    const t = itemTime(item);
    if (!t) continue;
    const diff = dayDiff(t, now);
    if (item.type === 'date') {
      if (diff === 0) rail.push({ item, time: t, label: 'All day', allDay: true, past: false });
      continue;
    }
    if (diff < 0) overdue.push(item);
    else if (diff === 0) {
      rail.push({ item, time: t, label: item.type === 'task' && isEndOfDay(t) ? 'Due' : fmtTime(t), allDay: false, past: t.getTime() < now.getTime() });
    } else if (diff === 1) tomorrow.push(item);
  }
  overdue.sort(byTime);
  tomorrow.sort(byTime);
  rail.sort((a, b) => (a.allDay === b.allDay ? a.time - b.time : a.allDay ? -1 : 1));
  // Where the "now" marker goes: before the first timed entry that is still ahead.
  let nowIndex = rail.findIndex((e) => !e.allDay && !e.past);
  if (nowIndex < 0) nowIndex = rail.length;
  return { overdue, rail, nowIndex, tomorrow };
}

export function summarizeToday(g) {
  const today = g.rail.filter((e) => !e.allDay).length + g.rail.filter((e) => e.allDay).length;
  const parts = [];
  if (today) parts.push(`${today} ${today === 1 ? 'thing' : 'things'} today`);
  if (g.overdue.length) parts.push(`${g.overdue.length} overdue`);
  return parts.length ? parts.join(', ') : 'Nothing due today';
}

// ---- Tasks ----
export function groupTasks(items, now) {
  const g = { overdue: [], today: [], upcoming: [], none: [] };
  for (const item of items.filter((i) => i.type === 'task')) {
    const t = itemTime(item);
    if (!t) g.none.push(item);
    else {
      const diff = dayDiff(t, now);
      if (diff < 0) g.overdue.push(item);
      else if (diff === 0) g.today.push(item);
      else g.upcoming.push(item);
    }
  }
  for (const k of ['overdue', 'today', 'upcoming']) g[k].sort(byTime);
  return g;
}

// ---- Reminders ----
export function groupReminders(items, now) {
  const g = { earlier: [], today: [], tomorrow: [], later: [] };
  for (const item of items.filter((i) => i.type === 'reminder')) {
    const t = itemTime(item);
    if (!t) continue;
    const diff = dayDiff(t, now);
    if (t.getTime() < now.getTime()) g.earlier.push(item);
    else if (diff === 0) g.today.push(item);
    else if (diff === 1) g.tomorrow.push(item);
    else g.later.push(item);
  }
  for (const k of Object.keys(g)) g[k].sort(byTime);
  return g;
}

// ---- Important dates, nearest first, with the number of days left ----
export function listDates(items, now) {
  return items
    .filter((i) => i.type === 'date' && itemTime(i))
    .map((item) => ({ item, days: dayDiff(itemTime(item), now) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days);
}

// ---- The server address typed on the setup screen ----
export function parseServerUrl(input) {
  let text = String(input || '').trim();
  if (!text) return { ok: false, error: 'Enter the address of your Jarvis server.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text;
  let url;
  try { url = new URL(text); } catch (e) { return { ok: false, error: 'That does not look like a web address.' }; }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    return { ok: false, error: 'The address must start with https://.' };
  }
  return { ok: true, url: url.origin };
}

export function timeAgo(then, now) {
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 90) return '1 minute ago';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 7200) return '1 hour ago';
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export function searchTitle(list, q) {
  const s = String(q || '').trim().toLowerCase();
  return s ? list.filter((e) => String((e.item || e).title).toLowerCase().includes(s)) : list;
}

// ---- Habits ----
// Dates are India calendar days written 2026-10-21. A habit's `dates` are the days it was done.
const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => { const s = shift(d); return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`; };
const dayNum = (str) => Math.round(Date.UTC(Number(str.slice(0, 4)), Number(str.slice(5, 7)) - 1, Number(str.slice(8, 10))) / 86400000);
const fromDayNum = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const weekdayOf = (str) => (new Date(dayNum(str) * 86400000).getUTCDay() + 6) % 7; // Monday = 0

// The current streak counts back from today, or from yesterday while today is still open, so one day without a check-in does not erase it until the day has passed.
export function streakInfo(dates, today) {
  const days = [...new Set((dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(dayNum))].sort((a, b) => a - b);
  const set = new Set(days);
  const t = dayNum(today);
  let current = 0;
  for (let d = set.has(t) ? t : t - 1; set.has(d); d--) current++;
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev !== null && d === prev + 1 ? run + 1 : 1; if (run > best) best = run; prev = d; }
  return { current, best, total: days.length, doneToday: set.has(t) };
}

// The last seven days ending today, for the small strip on each habit.
export function lastDays(dates, today, n = 7) {
  const set = new Set(dates || []);
  const t = dayNum(today);
  return Array.from({ length: n }, (_, i) => {
    const date = fromDayNum(t - (n - 1 - i));
    return { date, letter: 'MTWTFSS'[weekdayOf(date)], done: set.has(date), today: date === today };
  });
}

// How many days this week (Monday to Sunday) the habit was done.
export function weekCount(dates, today) {
  const start = dayNum(today) - weekdayOf(today);
  return new Set((dates || []).filter((d) => { const n = dayNum(d); return n >= start && n < start + 7; })).size;
}

// A month as rows of seven (Monday first). `null` cells pad the first and last week.
export function monthGrid(year, month) {
  const first = `${year}-${pad(month + 1)}-01`;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array(weekdayOf(first)).fill(null);
  for (let d = 1; d <= count; d++) cells.push({ date: `${year}-${pad(month + 1)}-${pad(d)}`, day: d });
  while (cells.length % 7) cells.push(null);
  return { label: `${MONTHS[month]} ${year}`, cells };
}

export function shiftMonth({ y, m }, delta) {
  const t = y * 12 + m + delta;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

// Adds or removes one day from a list of done days.
export function withDay(dates, date, done) {
  const rest = (dates || []).filter((d) => d !== date);
  return done ? [...rest, date].sort() : rest;
}

// ---- Ideas ----
export function ideaParts(body) {
  const lines = String(body || '').split('\n');
  const first = lines.find((l) => l.trim()) || '';
  return { first: first.trim(), more: lines.slice(lines.indexOf(first) + 1).join('\n').trim() };
}

// ---- Study: exams are important dates in the College space; college work is tasks in it ----
export const COLLEGE = 'college';
export function listExams(items, now) {
  return items
    .filter((i) => i.type === 'date' && i.space === COLLEGE && itemTime(i))
    .map((item) => ({ item, days: dayDiff(itemTime(item), now), date: dateStr(itemTime(item)) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => itemTime(a.item) - itemTime(b.item));
}
export const collegeWork = (items) => items.filter((i) => i.type === 'task' && i.space === COLLEGE);
export const hasClock = (d) => { const s = shift(d); return s.getUTCHours() + s.getUTCMinutes() > 0; };
