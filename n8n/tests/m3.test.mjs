// Tests for the M3 Code nodes of the reminder dispatcher (workflow 02).
// Run with: node --test n8n/tests/m3.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', f), 'utf8'));
const dispatcher = load('02-reminder-dispatcher.json');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const NOW = new Date('2026-10-21T10:30:00+05:30'); // Wednesday
class FixedDate extends Date {
  constructor(...args) { if (args.length === 0) super(NOW.getTime()); else super(...args); }
  static now() { return NOW.getTime(); }
}

async function run(wf, name, { input, nodes = {} }) {
  const code = wf.nodes.find((n) => n.name === name).parameters.jsCode;
  const wrap = (arr) => arr.map((json) => ({ json }));
  const $input = { first: () => wrap(input)[0], all: () => wrap(input) };
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`Node '${n}' hasn't been executed`);
    const items = wrap(nodes[n]);
    return { first: () => items[0], all: () => items };
  };
  const out = await new AsyncFunction('Date', '$input', '$', code).call({ helpers: {} }, FixedDate, $input, $);
  return out.map((i) => i.json);
}

const ist = (s) => new Date(s).toISOString();
const compose = (rows) => run(dispatcher, 'Compose', { input: rows });
const nextOf = async (rule, last) => {
  const [out] = await compose([{ kind: 'reminder', id: 'x', title: 't', remind_at: ist(last), recurrence: rule, bark_key: 'bk' }]);
  return out.next_remind;
};

// ---------------------------------------------------------------- repeat rules
test('daily repeat moves to the next future time at the same clock time', async () => {
  assert.equal(await nextOf('FREQ=DAILY', '2026-10-20T07:00:00+05:30'), ist('2026-10-22T07:00:00+05:30'));
  assert.equal(await nextOf('FREQ=DAILY', '2026-10-21T10:29:00+05:30'), ist('2026-10-22T10:29:00+05:30'));
});

test('weekly repeat with days picks the next listed weekday', async () => {
  // Friday 16 Oct 09:00, Mondays and Fridays: Monday 19th is past, so Friday 23rd.
  assert.equal(await nextOf('FREQ=WEEKLY;BYDAY=MO,FR', '2026-10-16T09:00:00+05:30'), ist('2026-10-23T09:00:00+05:30'));
  assert.equal(await nextOf('FREQ=WEEKLY;BYDAY=TH', '2026-10-15T20:00:00+05:30'), ist('2026-10-22T20:00:00+05:30'));
});

test('weekly repeat without days adds whole weeks', async () => {
  assert.equal(await nextOf('FREQ=WEEKLY', '2026-10-14T08:00:00+05:30'), ist('2026-10-28T08:00:00+05:30'));
});

test('monthly repeat clamps to the end of short months and recovers', async () => {
  assert.equal(await nextOf('FREQ=MONTHLY', '2026-01-31T09:00:00+05:30'), ist('2026-10-31T09:00:00+05:30'));
  assert.equal(await nextOf('FREQ=MONTHLY', '2026-10-31T09:00:00+05:30'), ist('2026-11-30T09:00:00+05:30'));
});

test('yearly repeat on 29 February lands on 28 February in other years', async () => {
  assert.equal(await nextOf('FREQ=YEARLY', '2024-02-29T09:00:00+05:30'), ist('2027-02-28T09:00:00+05:30'));
});

test('INTERVAL is respected and a rule it does not understand gives no next time', async () => {
  assert.equal(await nextOf('FREQ=DAILY;INTERVAL=3', '2026-10-20T07:00:00+05:30'), ist('2026-10-23T07:00:00+05:30'));
  assert.equal(await nextOf('NOT A RULE', '2026-10-20T07:00:00+05:30'), '');
});

// ---------------------------------------------------------------- Compose
test('Compose writes the push text for reminders and for each kind of date alert', async () => {
  const due = ist('2026-10-27T00:00:00+05:30');
  const out = await compose([
    { kind: 'reminder', id: 'a', title: 'Call home', remind_at: ist('2026-10-21T10:29:00+05:30'), recurrence: null, bark_key: 'bk' },
    { kind: 'date', id: 'b', title: 'Exam', due_at: due, advance_days: 7, bark_key: 'bk' },
    { kind: 'date', id: 'c', title: 'Exam', due_at: due, advance_days: 1, bark_key: 'bk' },
    { kind: 'date', id: 'd', title: 'Exam', due_at: due, advance_days: 0, bark_key: 'bk' },
  ]);
  assert.equal(out[0].message, 'Call home');
  assert.equal(out[0].level, 'timeSensitive');
  assert.equal(out[0].next_remind, '');
  assert.equal(out[1].message, 'In 7 days: Exam (Tuesday, 27 Oct)');
  assert.equal(out[2].message, 'Tomorrow: Exam (Tuesday, 27 Oct)');
  assert.equal(out[3].message, 'Today: Exam');
  assert.equal(out[3].level, 'timeSensitive');
  assert.equal(out[2].level, 'active');
  assert.equal(out[1].occurrence, '2026-10-27');
  assert.equal(out[1].key, 'bk');
});

test('Compose passes an empty key through so the workflow can skip pushing', async () => {
  const [o] = await compose([{ kind: 'reminder', id: 'a', title: 'X', remind_at: ist('2026-10-21T10:29:00+05:30'), bark_key: null }]);
  assert.equal(o.key, '');
});

// ---------------------------------------------------------------- Judge
const planned = [
  { kind: 'reminder', id: '1', title: 't1', message: 'Call home', key: 'k', next_remind: '', occurrence: '', adv: 0 },
  { kind: 'reminder', id: '2', title: 't2', message: 'Water plants', key: 'k', next_remind: '', occurrence: '', adv: 0 },
  { kind: 'date', id: '3', title: 'Exam', message: 'In 7 days: Exam (Tuesday, 27 Oct)', key: 'k', next_remind: '', occurrence: '2026-10-27', adv: 7 },
];

test('Judge marks pushes with a Bark answer as sent and prepares a calendar event for the rest', async () => {
  const out = await run(dispatcher, 'Judge', {
    input: [
      { statusCode: 200, headers: {}, body: { code: 200, message: 'success' } },
      { statusCode: 429, headers: { 'retry-after': '30' }, body: { code: 429, message: 'too many requests' } },
      { statusCode: 200, headers: {}, body: { code: 200, message: 'success' } },
    ],
    nodes: { Compose: planned },
  });
  assert.deepEqual(out.map((o) => o.ok), [true, false, true]);
  assert.equal(out[0].backup_body, null);
  assert.equal(out[0].push_error, '');
  assert.equal(out[1].push_error, 'HTTP 429 (code 429): too many requests [retry-after 30]');
  const b = out[1].backup_body;
  assert.equal(b.summary, '\u23F0 Water plants');
  // 10:30 now, so the next whole minute at least two minutes away is 10:32.
  assert.equal(b.start.dateTime, '2026-10-21T10:32:00+05:30');
  assert.equal(b.end.dateTime, '2026-10-21T10:47:00+05:30');
  assert.deepEqual(b.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] });
});

test('Judge also copes with a network error and with an answer that is not JSON', async () => {
  const out = await run(dispatcher, 'Judge', {
    input: [{ error: { httpCode: '500', message: 'boom' } }, { statusCode: 502, headers: {}, body: '<html>Bad gateway</html>' }, { statusCode: 200, headers: {}, body: { code: 400, message: 'device key not found' } }],
    nodes: { Compose: planned },
  });
  assert.deepEqual(out.map((o) => o.ok), [false, false, false]);
  assert.equal(out[0].push_error, '500 - boom');
  assert.equal(out[1].push_error, 'HTTP 502: <html>Bad gateway</html>');
  assert.equal(out[2].push_error, 'HTTP 200 (code 400): device key not found');
});

test('Judge treats the no-key path (items passed straight on) as failed and uses the date icon for dates', async () => {
  const noKey = planned.map((p) => ({ ...p, key: '' }));
  const out = await run(dispatcher, 'Judge', { input: noKey, nodes: { Compose: noKey } });
  assert.deepEqual(out.map((o) => o.ok), [false, false, false]);
  assert.equal(out[0].push_error, 'no bark_key is set in jarvis.settings');
  assert.equal(out[2].backup_body.summary, '\uD83D\uDCC5 In 7 days: Exam (Tuesday, 27 Oct)');
});

test('Judge backup counts a failed push as delivered only when Calendar accepted the event', async () => {
  const judged = [
    { ...planned[0], ok: true },
    { ...planned[1], ok: false, backup_body: {} },
    { ...planned[2], ok: false, backup_body: {} },
  ];
  const out = await run(dispatcher, 'Judge backup', {
    input: [{ id: 'evt1' }, { error: { message: 'denied' } }],
    nodes: { Judge: judged },
  });
  assert.deepEqual(out.map((o) => [o.id, o.ok]), [['2', true], ['3', false]]);
});

// ---------------------------------------------------------------- Roll stale
test('Roll stale moves old repeating reminders on and emits nothing when there are none', async () => {
  const [o] = await run(dispatcher, 'Roll stale', { input: [{ id: 'z', remind_at: ist('2026-10-15T07:00:00+05:30'), recurrence: 'FREQ=DAILY' }] });
  assert.deepEqual(JSON.parse(o.rows), [{ id: 'z', next_remind: ist('2026-10-22T07:00:00+05:30') }]);
  const none = await run(dispatcher, 'Roll stale', { input: [{}] });
  assert.equal(none.length, 0);
});
