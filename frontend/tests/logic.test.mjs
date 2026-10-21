// Run with: node --test frontend/tests/logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

const NOW = new Date('2026-10-21T10:30:00+05:30'); // Wednesday
const at = (s) => new Date(s).toISOString();
const item = (type, title, when, extra = {}) => ({
  id: title, type, title, space: 'personal', status: 'open',
  remind_at: type === 'reminder' ? at(when) : null, due_at: type !== 'reminder' && when ? at(when) : null, ...extra,
});

test('India time formatting', () => {
  assert.equal(L.fmtTime(new Date('2026-10-21T18:00:00+05:30')), '6 pm');
  assert.equal(L.fmtTime(new Date('2026-10-21T00:05:00+05:30')), '12:05 am');
  assert.equal(L.fmtTime(new Date('2026-10-21T12:30:00+05:30')), '12:30 pm');
  assert.equal(L.fmtDay(new Date('2026-10-21T20:00:00+05:30'), NOW), 'Today');
  assert.equal(L.fmtDay(new Date('2026-10-22T09:00:00+05:30'), NOW), 'Tomorrow');
  assert.equal(L.fmtDay(new Date('2026-10-23T09:00:00+05:30'), NOW), 'Fri 23 Oct');
  assert.equal(L.fmtDay(new Date('2027-03-03T00:00:00+05:30'), NOW), 'Wed 3 Mar 2027');
  assert.deepEqual(L.longDate(NOW), { weekday: 'Wednesday', day: '21 October' });
});

test('a time late in the evening in India counts as that India day, not the UTC day', () => {
  // 23:30 IST on the 21st is 18:00 UTC on the 21st; 00:30 IST on the 22nd is 19:00 UTC on the 21st.
  assert.equal(L.dayDiff(new Date('2026-10-22T00:30:00+05:30'), NOW), 1);
  assert.equal(L.dayDiff(new Date('2026-10-21T23:30:00+05:30'), NOW), 0);
});

test('Today groups overdue, a timeline with a now position, and tomorrow', () => {
  const g = L.groupToday([
    item('task', 'Old task', '2026-10-19T23:59:00+05:30'),
    item('reminder', 'Morning stretch', '2026-10-21T07:00:00+05:30'),
    item('reminder', 'Call home', '2026-10-21T18:00:00+05:30'),
    item('task', 'Lab report', '2026-10-21T23:59:00+05:30'),
    item('date', 'Exam', '2026-10-21T00:00:00+05:30'),
    item('date', 'Far birthday', '2027-03-03T00:00:00+05:30'),
    item('reminder', 'Tomorrow thing', '2026-10-22T09:00:00+05:30'),
    item('task', 'No date', null),
  ], NOW);
  assert.deepEqual(g.overdue.map((i) => i.title), ['Old task']);
  assert.deepEqual(g.rail.map((e) => [e.item.title, e.label]), [['Exam', 'All day'], ['Morning stretch', '7 am'], ['Call home', '6 pm'], ['Lab report', 'Due']]);
  assert.equal(g.nowIndex, 2); // after the all-day date and the 7 am reminder that has passed
  assert.deepEqual(g.tomorrow.map((i) => i.title), ['Tomorrow thing']);
  assert.equal(L.summarizeToday(g), '4 things today, 1 overdue');
  assert.equal(L.summarizeToday({ overdue: [], rail: [], tomorrow: [] }), 'Nothing due today');
});

test('now position is at the end when everything today has passed', () => {
  const g = L.groupToday([item('reminder', 'Early', '2026-10-21T06:00:00+05:30')], NOW);
  assert.equal(g.nowIndex, 1);
});

test('Tasks and Reminders and Dates group as expected', () => {
  const items = [
    item('task', 'a', '2026-10-20T23:59:00+05:30'), item('task', 'b', '2026-10-21T23:59:00+05:30'),
    item('task', 'c', '2026-10-25T23:59:00+05:30'), item('task', 'd', null),
    item('reminder', 'r1', '2026-10-21T09:00:00+05:30'), item('reminder', 'r2', '2026-10-21T20:00:00+05:30'),
    item('reminder', 'r3', '2026-10-22T09:00:00+05:30'), item('reminder', 'r4', '2026-11-01T09:00:00+05:30'),
    item('date', 'soon', '2026-10-24T00:00:00+05:30'), item('date', 'today', '2026-10-21T00:00:00+05:30'), item('date', 'gone', '2026-10-10T00:00:00+05:30'),
  ];
  const t = L.groupTasks(items, NOW);
  assert.deepEqual([t.overdue, t.today, t.upcoming, t.none].map((x) => x.map((i) => i.title)), [['a'], ['b'], ['c'], ['d']]);
  const r = L.groupReminders(items, NOW);
  assert.deepEqual([r.earlier, r.today, r.tomorrow, r.later].map((x) => x.map((i) => i.title)), [['r1'], ['r2'], ['r3'], ['r4']]);
  assert.deepEqual(L.listDates(items, NOW).map((e) => [e.item.title, e.days]), [['today', 0], ['soon', 3]]);
});

test('space filter and repeat wording', () => {
  const items = [{ space: 'college' }, { space: 'personal' }];
  assert.equal(L.filterSpace(items, 'college').length, 1);
  assert.equal(L.filterSpace(items, 'all').length, 2);
  assert.equal(L.repeatText('FREQ=WEEKLY;BYDAY=MO,FR'), 'Repeats Mon, Fri');
  assert.equal(L.repeatText('FREQ=YEARLY'), 'Repeats yearly');
  assert.equal(L.repeatText(null), '');
});

test('server address is checked and cleaned', () => {
  assert.deepEqual(L.parseServerUrl('jarvis-n8n-rd61.onrender.com'), { ok: true, url: 'https://jarvis-n8n-rd61.onrender.com' });
  assert.deepEqual(L.parseServerUrl('https://x.onrender.com/webhook/jarvis/'), { ok: true, url: 'https://x.onrender.com' });
  assert.equal(L.parseServerUrl('http://x.onrender.com').ok, false);
  assert.equal(L.parseServerUrl('http://localhost:5678').ok, true);
  assert.equal(L.parseServerUrl('').ok, false);
  assert.equal(L.parseServerUrl('not a url').ok, false);
});

test('time ago wording', () => {
  assert.equal(L.timeAgo(new Date(NOW - 10000), NOW), 'just now');
  assert.equal(L.timeAgo(new Date(NOW - 5 * 60000), NOW), '5 minutes ago');
  assert.equal(L.timeAgo(new Date(NOW - 3 * 3600000), NOW), '3 hours ago');
});

test('search by title', () => {
  const list = [{ item: { title: "Mom's birthday" }, days: 3 }, { item: { title: 'Exam' }, days: 5 }];
  assert.equal(L.searchTitle(list, 'mom').length, 1);
  assert.equal(L.searchTitle(list, '  ').length, 2);
  assert.equal(L.searchTitle([{ title: 'Lab report' }], 'LAB').length, 1);
});

// ---- M7: habits ----
test('streak counts back from today, or from yesterday while today is still open', () => {
  assert.deepEqual(L.streakInfo(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-21'), { current: 3, best: 3, total: 3, doneToday: true });
  assert.equal(L.streakInfo(['2026-10-19', '2026-10-20'], '2026-10-21').current, 2);
  assert.equal(L.streakInfo(['2026-10-18', '2026-10-19'], '2026-10-21').current, 0);
  assert.equal(L.streakInfo([], '2026-10-21').current, 0);
});

test('best streak finds the longest run, duplicates and junk are ignored, month ends count', () => {
  const info = L.streakInfo(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-01', 'x', '2026-10-05', '2026-10-06'], '2026-10-21');
  assert.equal(info.best, 3);
  assert.equal(info.total, 5);
});

test('last seven days and the week count use Monday as the first day', () => {
  const days = L.lastDays(['2026-10-21', '2026-10-19'], '2026-10-21');
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.letter).join(''), 'TFSSMTW');
  assert.equal(days[6].today, true);
  assert.equal(days[6].done, true);
  assert.equal(L.weekCount(['2026-10-19', '2026-10-20', '2026-10-18'], '2026-10-21'), 2); // Sunday the 18th is last week
});

test('a month grid starts on Monday and pads to whole weeks', () => {
  const g = L.monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(g.label, 'October 2026');
  assert.equal(g.cells.length % 7, 0);
  assert.equal(g.cells.slice(0, 3).every((c) => c === null), true);
  assert.equal(g.cells[3].date, '2026-10-01');
  assert.equal(g.cells.filter(Boolean).length, 31);
  assert.equal(L.monthGrid(2028, 1).cells.filter(Boolean).length, 29); // leap year
  assert.deepEqual(L.shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 });
  assert.deepEqual(L.shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 });
});

test('withDay adds and removes a day without duplicates; dateStr reads the India day', () => {
  assert.deepEqual(L.withDay(['2026-10-20'], '2026-10-19', true), ['2026-10-19', '2026-10-20']);
  assert.deepEqual(L.withDay(['2026-10-20'], '2026-10-20', true), ['2026-10-20']);
  assert.deepEqual(L.withDay(['2026-10-20'], '2026-10-20', false), []);
  assert.equal(L.dateStr(new Date('2026-10-20T19:00:00Z')), '2026-10-21'); // 12:30 am in India
});

test('ideaParts splits the first line from the rest', () => {
  assert.deepEqual(L.ideaParts('\nBudget app\nreads texts\n\nsorts'), { first: 'Budget app', more: 'reads texts\n\nsorts' });
  assert.deepEqual(L.ideaParts('one line'), { first: 'one line', more: '' });
});
