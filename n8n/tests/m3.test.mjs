// Tests for the M3 Code nodes: dispatcher (02) and the calendar branch of the router (01).
// Run with: node --test n8n/tests/m3.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', f), 'utf8'));
const router = load('01-chat-router.json');
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
  const [out] = await compose([{ kind: 'reminder', id: 'x', title: 't', remind_at: ist(last), recurrence: rule, ntfy_topic: 'tp' }]);
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
    { kind: 'reminder', id: 'a', title: 'Call home', remind_at: ist('2026-10-21T10:29:00+05:30'), recurrence: null, ntfy_topic: 'tp' },
    { kind: 'date', id: 'b', title: 'Exam', due_at: due, advance_days: 7, ntfy_topic: 'tp' },
    { kind: 'date', id: 'c', title: 'Exam', due_at: due, advance_days: 1, ntfy_topic: 'tp' },
    { kind: 'date', id: 'd', title: 'Exam', due_at: due, advance_days: 0, ntfy_topic: 'tp' },
  ]);
  assert.equal(out[0].message, 'Call home');
  assert.equal(out[0].priority, 'high');
  assert.equal(out[0].next_remind, '');
  assert.equal(out[1].message, 'In 7 days: Exam (Tuesday, 27 Oct)');
  assert.equal(out[2].message, 'Tomorrow: Exam (Tuesday, 27 Oct)');
  assert.equal(out[3].message, 'Today: Exam');
  assert.equal(out[1].occurrence, '2026-10-27');
  assert.equal(out[1].topic, 'tp');
});

test('Compose passes an empty topic through so the workflow can skip pushing', async () => {
  const [o] = await compose([{ kind: 'reminder', id: 'a', title: 'X', remind_at: ist('2026-10-21T10:29:00+05:30'), ntfy_topic: null }]);
  assert.equal(o.topic, '');
});

// ---------------------------------------------------------------- Finish
test('Finish marks pushes with an ntfy answer as sent and everything else as failed', async () => {
  const planned = [
    { kind: 'reminder', id: '1', topic: 't', next_remind: '', occurrence: '', adv: 0 },
    { kind: 'reminder', id: '2', topic: 't', next_remind: '', occurrence: '', adv: 0 },
    { kind: 'date', id: '3', topic: 't', next_remind: '', occurrence: '2026-10-27', adv: 7 },
  ];
  const [res] = await run(dispatcher, 'Finish', {
    input: [{ id: 'n1', event: 'message' }, { error: { message: '429' } }, { id: 'n3', event: 'message' }],
    nodes: { Compose: planned },
  });
  const rows = JSON.parse(res.rows);
  assert.deepEqual(rows.map((r) => r.ok), [true, false, true]);
  assert.equal(res.failed, 1);
  // The no-topic path hands the composed items straight on: all failed.
  const [none] = await run(dispatcher, 'Finish', { input: planned, nodes: { Compose: planned } });
  assert.equal(none.failed, 3);
});

// ---------------------------------------------------------------- Roll stale
test('Roll stale moves old repeating reminders on and emits nothing when there are none', async () => {
  const [o] = await run(dispatcher, 'Roll stale', { input: [{ id: 'z', remind_at: ist('2026-10-15T07:00:00+05:30'), recurrence: 'FREQ=DAILY' }] });
  assert.deepEqual(JSON.parse(o.rows), [{ id: 'z', next_remind: ist('2026-10-22T07:00:00+05:30') }]);
  const none = await run(dispatcher, 'Roll stale', { input: [{}] });
  assert.equal(none.length, 0);
});

// ---------------------------------------------------------------- Calendar plan
const calPlan = (intent, rows, backup = true) => run(router, 'Calendar plan', {
  input: rows,
  nodes: { Plan: [{ plan: { intent, ctx: { calendar_backup: backup } } }], 'Run SQL': rows },
});

test('Calendar plan builds a timed event with a popup at the time for a reminder', async () => {
  const [o] = await calPlan('reminder.create', [{ id: 'r1', title: 'Call home', remind_at: ist('2026-10-22T18:00:00+05:30'), recurrence: 'FREQ=WEEKLY;BYDAY=MO' }]);
  assert.equal(o.op, 'create');
  assert.equal(o.item_id, 'r1');
  assert.equal(o.body.start.dateTime, '2026-10-22T18:00:00+05:30');
  assert.equal(o.body.end.dateTime, '2026-10-22T18:15:00+05:30');
  assert.deepEqual(o.body.reminders.overrides, [{ method: 'popup', minutes: 0 }]);
  assert.deepEqual(o.body.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=MO']);
});

test('Calendar plan builds an all-day event with 9 AM advance popups for a date', async () => {
  const [o] = await calPlan('date.create', [{ id: 'd1', title: "Mom's birthday", due_at: ist('2027-03-03T00:00:00+05:30'), advance_days: [7, 1], recurrence: 'FREQ=YEARLY' }]);
  assert.equal(o.body.start.date, '2027-03-03');
  assert.equal(o.body.end.date, '2027-03-04');
  assert.deepEqual(o.body.reminders.overrides.map((x) => x.minutes), [9540, 900, 0]);
  assert.deepEqual(o.body.recurrence, ['RRULE:FREQ=YEARLY']);
});

test('Calendar plan removes the copy when an item is closed, even with the backup switched off', async () => {
  const [o] = await calPlan('item.complete', [{ match_count: 1, updated: { id: 'r1', calendar_event_id: 'evt9' } }], false);
  assert.deepEqual(o, { op: 'delete', event_id: 'evt9' });
  assert.equal((await calPlan('item.cancel', [{ match_count: 1, updated: { id: 'r1', calendar_event_id: null } }])).length, 0);
  assert.equal((await calPlan('item.cancel', [{ match_count: 2, updated: null }])).length, 0);
});

test('Calendar plan does nothing when the backup is off, for tasks, lists and failed saves', async () => {
  const row = { id: 'r1', title: 'x', remind_at: ist('2026-10-22T18:00:00+05:30') };
  assert.equal((await calPlan('reminder.create', [row], false)).length, 0);
  assert.equal((await calPlan('task.create', [{ id: 't', title: 'x', due_at: ist('2026-10-23T23:59:00+05:30') }])).length, 0);
  assert.equal((await calPlan('item.list', [row])).length, 0);
  assert.equal((await calPlan('reminder.create', [{}])).length, 0);
});
