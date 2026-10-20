// Tests for the Items API (workflow 03), which the app uses to list and close items.
// Run with: node --test n8n/tests/items.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', '03-items-api.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const NOW = new Date('2026-10-21T10:30:00+05:30');
class FixedDate extends Date {
  constructor(...args) { if (args.length === 0) super(NOW.getTime()); else super(...args); }
  static now() { return NOW.getTime(); }
}
async function run(name, { input, nodes = {} }) {
  const code = wf.nodes.find((n) => n.name === name).parameters.jsCode;
  const wrap = (arr) => arr.map((json) => ({ json }));
  const $input = { first: () => wrap(input)[0], all: () => wrap(input) };
  const $ = (n) => { const items = wrap(nodes[n]); return { first: () => items[0], all: () => items }; };
  const out = await new AsyncFunction('Date', '$input', '$', code).call({ helpers: {} }, FixedDate, $input, $);
  return out.map((i) => i.json);
}
const plan = async (body) => (await run('Items plan', { input: [{ body }] }))[0].plan;
const ID = '3f2b8c1e-5d4a-4b7e-9c10-1a2b3c4d5e6f';

test('list asks for open items and spaces with no parameters', async () => {
  const p = await plan({ action: 'list' });
  assert.equal(p.ok, true);
  assert.equal(p.action, 'sql');
  assert.deepEqual(p.params, []);
  assert.match(p.sql, /status = 'open'/);
});

test('complete and cancel bind the id and the new status as parameters', async () => {
  const done = await plan({ action: 'complete', id: ID.toUpperCase() });
  assert.deepEqual(done.params, [ID, 'done']);
  const gone = await plan({ action: 'cancel', id: ID });
  assert.deepEqual(gone.params, [ID, 'cancelled']);
  assert.ok(!done.sql.includes(ID));
});

test('anything else is refused without touching the database', async () => {
  for (const body of [{}, { action: 'delete', id: ID }, { action: 'complete' }, { action: 'complete', id: "x'; drop table jarvis.items;--" }, { action: 'complete', id: 42 }]) {
    const p = await plan(body);
    assert.equal(p.ok, false);
    assert.equal(p.action, 'reply');
    assert.ok(['bad_action', 'bad_id'].includes(p.error));
  }
  assert.equal((await run('Items plan', { input: [{}] }))[0].plan.error, 'bad_action');
});

const reply = (p, rows) => run('Items reply', { input: rows, nodes: { 'Items plan': [{ plan: p }] } });

test('list reply uses India time for every timestamp and keeps spaces', async () => {
  const p = await plan({ action: 'list' });
  const [out] = await reply(p, [{
    items: [
      { id: ID, type: 'reminder', title: 'Call home', space: 'personal', status: 'open', due_at: null, remind_at: '2026-10-21T12:30:00.000Z', recurrence: 'FREQ=DAILY', advance_days: [] },
      { id: 'b', type: 'date', title: 'Exam', space: 'college', status: 'open', due_at: '2026-10-26T18:30:00.000Z', remind_at: null, recurrence: null, advance_days: [7, 1] },
    ],
    spaces: [{ slug: 'college', label: 'College' }],
  }]);
  assert.equal(out.ok, true);
  assert.equal(out.now, '2026-10-21T10:30:00+05:30');
  assert.equal(out.items[0].remind_at, '2026-10-21T18:00:00+05:30');
  assert.equal(out.items[1].due_at, '2026-10-27T00:00:00+05:30');
  assert.deepEqual(out.items[1].advance_days, [7, 1]);
  assert.deepEqual(out.spaces, [{ slug: 'college', label: 'College' }]);
});

test('list reply handles an empty database and a database error', async () => {
  const p = await plan({ action: 'list' });
  const [empty] = await reply(p, [{ items: [], spaces: [] }]);
  assert.deepEqual([empty.ok, empty.items, empty.spaces], [true, [], []]);
  const [bad] = await reply(p, [{ error: 'connection refused' }]);
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'db_error');
});

test('closing returns the item, or not_found when nothing was open with that id', async () => {
  const p = await plan({ action: 'complete', id: ID });
  const [ok] = await reply(p, [{ id: ID, type: 'task', title: 'Lab report', space: 'college', status: 'done' }]);
  assert.deepEqual(ok, { ok: true, item: { id: ID, type: 'task', title: 'Lab report', space: 'college', status: 'done' } });
  const [none] = await reply(p, [{}]);
  assert.equal(none.ok, false);
  assert.equal(none.error, 'not_found');
});

test('a refused request passes its message straight through', async () => {
  const p = await plan({ action: 'nope' });
  const [out] = await reply(p, [{}]);
  assert.deepEqual([out.ok, out.error], [false, 'bad_action']);
});
