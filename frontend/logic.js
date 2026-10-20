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
