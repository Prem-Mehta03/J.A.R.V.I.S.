// Tests for the iOS Reminders sync (workflow 06).
// Run with: node --test n8n/tests/sync.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', '06-sync.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(name, { input, nodes = {} }) {
  const code = wf.nodes.find((n) => n.name === name).parameters.jsCode;
  const wrap = (arr) => arr.map((json) => ({ json }));
  const $input = { first: () => wrap(input)[0], all: () => wrap(input) };
  const $ = (n) => { const items = wrap(nodes[n]); return { first: () => items[0], all: () => items }; };
  const out = await new AsyncFunction('$input', '$', code).call({ helpers: {} }, $input, $);
  return out.map((i) => i.json);
}
const plan = async (body) => (await run('Sync plan', { input: [{ body }] }))[0].plan;
const A = '3f2b8c1e-5d4a-4b7e-9c10-1a2b3c4d5e6f';
const B = '9a8b7c6d-1111-4222-8333-444455556666';

test('ids are passed as parameters, never put into the SQL', async () => {
  const p = await plan({ done: [A.toUpperCase()], known: [B, B] });
  assert.equal(p.ok, true);
  assert.deepEqual(p.params, [`{${A}}`, `{${B}}`]);
  assert.ok(!p.sql.includes(A) && !p.sql.includes(B));
});

test('empty or missing lists are fine, and a text list with one id per line works', async () => {
  assert.deepEqual((await plan({})).params, ['{}', '{}']);
  assert.deepEqual((await plan({ done: '', known: `${A}\n${B}\n` })).params, ['{}', `{${A},${B}}`]);
});

test('only id-shaped text is used: notes with a prefix work, anything else is ignored, never reaches the SQL', async () => {
  const p = await plan({ done: `jarvis:${A}`, known: [`jarvis:${B}`, "x'; drop table jarvis.items;--", 42, 'buy milk'] });
  assert.deepEqual(p.params, [`{${A}}`, `{${B}}`]);
  assert.ok(!p.sql.includes('drop'));
});

test('an oversized list is refused before the database', async () => {
  const p = await plan({ done: Array(201).fill(0).map((_, i) => A.slice(0, -3) + String(i).padStart(3, '0')) });
  assert.equal(p.ok, false);
  assert.equal(p.action, 'reply');
  assert.equal(p.error, 'too_many');
});

test('recurring reminders and dates are never synced, only open reminders and tasks', async () => {
  const p = await plan({});
  assert.match(p.sql, /recurrence is null/);
  assert.match(p.sql, /type in \('reminder', 'task'\)/);
});

test('reply splits timed and untimed items and builds the closing list', async () => {
  const [r] = await run('Sync reply', {
    input: [{ add: [{ id: A, title: 'Call home', remind_at: '2026-10-22T12:30:00.000Z', due_at: null }, { id: B, title: 'Buy pens', remind_at: null, due_at: null }], close_ids: [B], completed: 1 }],
    nodes: { 'Sync plan': [{ plan: { ok: true, action: 'sql', now_iso: '2026-10-21T17:00:00+05:30' } }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.add.length, 1);
  assert.equal(r.add[0].due, '2026-10-22T18:00:00+05:30');
  assert.equal(r.add[0].note, `jarvis:${A}`);
  assert.equal(r.add_plain[0].title, 'Buy pens');
  assert.equal(r.close_text, B);
  assert.match(r.reply, /2 new, 1 closed on your phone, 1 marked done/);
});

test('nothing to do says so, and a database failure is a speakable error', async () => {
  const ctx = { 'Sync plan': [{ plan: { ok: true, action: 'sql', now_iso: 'x' } }] };
  const [ok] = await run('Sync reply', { input: [{ add: [], close_ids: [], completed: 0 }], nodes: ctx });
  assert.equal(ok.reply, 'Everything is already in sync.');
  const [bad] = await run('Sync reply', { input: [{ error: 'boom' }], nodes: ctx });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'db_error');
});
