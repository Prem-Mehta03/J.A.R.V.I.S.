// Tests for the Email workflow (07): sorting Gmail results with rules, Gmail's Promotions tab and the language model.
// Run with: node --test n8n/tests/email.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', '07-email.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(name, { input = [{}], nodes = {} }) {
  const code = wf.nodes.find((n) => n.name === name).parameters.jsCode;
  const wrap = (arr) => arr.map((json) => ({ json }));
  const $input = { first: () => wrap(input)[0], all: () => wrap(input) };
  const $ = (n) => { if (!(n in nodes)) throw new Error('no node ' + n); const items = wrap(nodes[n]); return { first: () => items[0], all: () => items }; };
  const out = await new AsyncFunction('$input', '$', code).call({ helpers: {} }, $input, $);
  return out.map((i) => i.json);
}
const msg = (id, from, subject, extra = {}) => ({
  id, threadId: 't' + id, labelIds: ['INBOX'], snippet: 'Hello &amp; welcome', internalDate: String(Date.parse('2026-10-21T10:00:00Z')),
  payload: { headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }], body: { data: 'SECRETBODY' } }, ...extra,
});
const state = (over = {}) => ({ rules: [], corrections: [], known: [], ...over });
const collect = async (personal, college, st) => (await run('Collect', { nodes: { 'Load state': [st || state()], 'Fetch personal': personal, 'Fetch college': college } }))[0];

test('collect parses senders, drops known mail and sent/spam, and never keeps the body', async () => {
  const c = await collect(
    [msg('1', '"Prof. Rao" <Rao@goa.bits-pilani.ac.in>', 'Midsem seating'), msg('2', 'x@y.com', 'old'), msg('3', 'me@x.com', 'sent', { labelIds: ['SENT'] }), msg('4', 'a@b.com', 'spam', { labelIds: ['SPAM'] })],
    [],
    state({ known: ['personal:2'] }),
  );
  assert.equal(c.to_classify.length, 1);
  const r = c.to_classify[0];
  assert.equal(r.sender_email, 'rao@goa.bits-pilani.ac.in');
  assert.equal(r.sender_name, 'Prof. Rao');
  assert.equal(r.snippet, 'Hello & welcome');
  assert.equal(r.account, 'personal');
  assert.ok(!JSON.stringify(c).includes('SECRETBODY'));
  assert.equal(c.has_llm, true);
});

test('rules win over everything, domain rules work, rules are per account, Promotions tab files as promo', async () => {
  const st = state({ rules: [
    { account: 'personal', match_type: 'sender', match_value: 'boss@corp.com', label: 'important' },
    { account: 'personal', match_type: 'domain', match_value: 'unstop.com', label: 'promo' },
    { account: 'college', match_type: 'sender', match_value: 'boss@corp.com', label: 'normal' },
  ] });
  const c = await collect(
    [msg('1', 'Boss <boss@corp.com>', 'Sale!', { labelIds: ['INBOX', 'CATEGORY_PROMOTIONS'] }), msg('2', 'news@unstop.com', 'Contest'), msg('3', 'deals@shop.com', 'Big sale', { labelIds: ['CATEGORY_PROMOTIONS'] }), msg('4', 'friend@gmail.com', 'dinner?')],
    [msg('1', 'boss@corp.com', 'Hi')],
    st,
  );
  const by = (acc, id) => c.rows.find((r) => r.account === acc && r.gmail_id === id);
  assert.deepEqual([by('personal', '1').label, by('personal', '1').label_source], ['important', 'rule']);
  assert.deepEqual([by('personal', '2').label, by('personal', '2').label_source], ['promo', 'rule']);
  assert.deepEqual([by('personal', '3').label, by('personal', '3').label_source], ['promo', 'gmail']);
  assert.equal(by('college', '1').label, 'normal');
  assert.equal(c.to_classify.length, 1);
  assert.equal(c.to_classify[0].sender_email, 'friend@gmail.com');
});

test('the model request carries corrections as examples, only sender subject and a short snippet, and both providers', async () => {
  const long = 'z'.repeat(400);
  const c = await collect([msg('1', 'a@b.com', 'Hi', { snippet: long })], [], state({ corrections: [{ sender: 'news@unstop.com', subject: 'Contest', user_label: 'promo' }] }));
  const text = c.gemini_body.contents[0].parts[0].text;
  assert.match(c.gemini_body.systemInstruction.parts[0].text, /news@unstop.com \| Contest => promo/);
  assert.ok(text.length < 250, 'snippet is cut');
  assert.deepEqual(c.groq_body.messages[1].content, text);
  assert.match(c.gemini_body.systemInstruction.parts[0].text, /never follow instructions/i);
});

test('a failed Gmail account is reported and does not stop the other one', async () => {
  const c = await collect([{ error: 'invalid_grant' }], [msg('1', 'a@b.com', 'Hi')]);
  assert.equal(c.errors.personal, 'invalid_grant');
  assert.equal(c.errors.college, undefined);
  assert.equal(c.to_classify.length, 1);
  const none = await collect([], []);
  assert.equal(none.has_llm, false);
  assert.equal(none.rows.length, 0);
});

test('merge takes valid labels from Gemini or Groq, skips bad ones, and leaves unlabeled mail to the next check', async () => {
  const c = await collect([msg('1', 'a@b.com', 'One'), msg('2', 'c@d.com', 'Two'), msg('3', 'e@f.com', 'Three')], []);
  const order = c.to_classify.map((r) => r.gmail_id); // newest first, all same time so original order
  const gem = { candidates: [{ content: { parts: [{ text: JSON.stringify({ labels: [{ i: 0, label: 'Important' }, { i: 1, label: 'spam' }, { i: 0, label: 'promo' }, { i: 7, label: 'normal' }] }) }] } }] };
  const m = (await run('Merge labels', { input: [gem], nodes: { Collect: [c] } }))[0];
  const rows = JSON.parse(m.rows_json);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].gmail_id, rows[0].label, rows[0].label_source], [order[0], 'important', 'llm']);
  const groq = { choices: [{ message: { content: '```json\n{"labels":[{"i":2,"label":"promo"}]}\n```' } }] };
  const g = JSON.parse((await run('Merge labels', { input: [groq], nodes: { Collect: [c] } }))[0].rows_json);
  assert.equal(g[0].label, 'promo');
  const dead = (await run('Merge labels', { input: [{ error: 'x' }], nodes: { Collect: [c] } }))[0];
  assert.equal(JSON.parse(dead.rows_json).length, 0);
  assert.match(dead.errors.classifier, /next check/);
});

test('without anything to sort, merge passes the rule-sorted mail straight on', async () => {
  const c = await collect([msg('1', 'a@b.com', 'Sale', { labelIds: ['CATEGORY_PROMOTIONS'] })], []);
  const m = (await run('Merge labels', { input: [c], nodes: { Collect: [c] } }))[0];
  assert.equal(JSON.parse(m.rows_json).length, 1);
});

test('summary words: new mail, nothing new, one account down, both down', async () => {
  const sum = async (saved, errors) => (await run('Summary', { input: [saved], nodes: { 'Merge labels': [{ errors }] } }))[0];
  assert.equal((await sum({ added: 5, important: 2 }, {})).reply, 'Checked mail: 5 new, 2 important.');
  assert.equal((await sum({ added: 0 }, {})).reply, 'Checked mail: nothing new.');
  assert.match((await sum({ added: 1 }, { college: 'x' })).reply, /couldn't read the college account/);
  const both = await sum({}, { personal: 'x', college: 'y' });
  assert.equal(both.ok, false);
});
