// Tests for the chat router's Code nodes. Run with: node --test n8n/tests/
//
// The code under test is taken from n8n/workflows/01-chat-router.json, so these tests run exactly what n8n runs.
// Rebuild the workflow first (python scripts/build_workflows.py) after changing anything in n8n/src/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workflow = JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', '01-chat-router.json'), 'utf8'));
const codeOf = (name) => workflow.nodes.find((n) => n.name === name).parameters.jsCode;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Wednesday 21 October 2026, 10:30 in India.
const NOW = new Date('2026-10-21T10:30:00+05:30');
class FixedDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(NOW.getTime());
    else super(...args);
  }
  static now() { return NOW.getTime(); }
}

// Runs a Code node the way n8n does: $input, $('Node name'), this.helpers, and a clock we control.
async function run(name, { input, nodes = {}, helpers = {} }) {
  const wrap = (arr) => arr.map((json) => ({ json }));
  const $input = { first: () => wrap(input)[0], all: () => wrap(input) };
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`Node '${n}' hasn't been executed`);
    const items = wrap(nodes[n]);
    return { first: () => items[0], all: () => items };
  };
  const fn = new AsyncFunction('Date', '$input', '$', codeOf(name));
  const out = await fn.call({ helpers }, FixedDate, $input, $);
  return out.map((i) => i.json);
}

const SPACES = [{ slug: 'college', label: 'College' }, { slug: 'personal', label: 'Personal' }];
const gemini = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
const groq = (obj) => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });
const intent = (fields) => ({
  intent: 'clarify', title: null, when: null, recurrence: null, advance_days: null, space: null, type: null,
  scope: null, query: null, place: null, space_label: null, reply: null, ...fields,
});

// Prepare -> Build request -> Plan, with a canned model answer.
async function plan(text, llm, { body = {}, db = { spaces: SPACES, home_location: null } } = {}) {
  const [prepared] = await run('Prepare', { input: [{ body: { text, ...body } }] });
  const nodes = { Prepare: [prepared] };
  if (prepared.valid) nodes['Build request'] = await run('Build request', { input: [db], nodes });
  const [out] = await run('Plan', { input: [llm], nodes });
  return out.plan;
}

// Plan -> Reply, with canned database rows.
async function reply(planObj, rows = [], helpers = {}) {
  const [out] = await run('Reply', { input: rows.length ? rows : [{}], nodes: { Plan: [{ plan: planObj }] }, helpers });
  return out;
}

// ---------------------------------------------------------------- Prepare
test('Prepare accepts a normal request and stamps India time', async () => {
  const [p] = await run('Prepare', { input: [{ body: { text: '  remind me tomorrow  ', source: 'voice', space: 'college' } }] });
  assert.equal(p.text, 'remind me tomorrow');
  assert.equal(p.valid, true);
  assert.equal(p.source, 'voice');
  assert.equal(p.space_hint, 'college');
  assert.equal(p.now_ist, '2026-10-21T10:30:00+05:30');
  assert.equal(p.weekday, 'Wednesday');
});

test('Prepare rejects empty and oversized text and ignores bad source and space', async () => {
  const [empty] = await run('Prepare', { input: [{ body: { text: '   ' } }] });
  assert.equal(empty.valid, false);
  assert.equal(empty.invalid, 'missing_text');
  const [none] = await run('Prepare', { input: [{}] });
  assert.equal(none.invalid, 'missing_text');
  const [long] = await run('Prepare', { input: [{ body: { text: 'x'.repeat(1001) } }] });
  assert.equal(long.invalid, 'text_too_long');
  const [odd] = await run('Prepare', { input: [{ body: { text: 'hi', source: 'fax', space: 'Bad Space!' } }] });
  assert.equal(odd.source, 'app');
  assert.equal(odd.space_hint, null);
});

// ---------------------------------------------------------------- Build request
test('Build request builds both model requests with the current time and spaces in the prompt', async () => {
  const [prepared] = await run('Prepare', { input: [{ body: { text: 'hello' } }] });
  const [out] = await run('Build request', { input: [{ spaces: SPACES, home_location: { name: 'Goa', lat: 15.39, lon: 73.88 } }], nodes: { Prepare: [prepared] } });
  const system = out.gemini_body.systemInstruction.parts[0].text;
  assert.match(system, /Wednesday 2026-10-21T10:30:00\+05:30/);
  assert.match(system, /college \(College\), personal \(Personal\)/);
  assert.match(system, /"when":"2026-10-22T18:00:00\+05:30"/); // "tomorrow at 6pm"
  assert.match(system, /"when":"2026-10-26T09:00:00\+05:30"/); // next Monday 9am
  assert.match(system, /"when":"2026-10-23T23:59:00\+05:30"/); // Friday, end of day
  assert.equal(out.gemini_body.contents[0].parts[0].text, 'hello');
  assert.equal(out.gemini_body.generationConfig.responseMimeType, 'application/json');
  assert.equal(out.groq_body.model, 'openai/gpt-oss-20b');
  assert.deepEqual(out.groq_body.response_format, { type: 'json_object' });
  assert.equal(out.groq_body.messages[1].content, 'hello');
  assert.deepEqual(out.home_location, { name: 'Goa', lat: 15.39, lon: 73.88 });
});

test('Build request still works when the context query failed', async () => {
  const [prepared] = await run('Prepare', { input: [{ body: { text: 'hello' } }] });
  const [out] = await run('Build request', { input: [{ error: 'connection refused' }], nodes: { Prepare: [prepared] } });
  assert.deepEqual(out.spaces.map((s) => s.slug), ['personal', 'college']);
  assert.equal(out.home_location, null);
  assert.equal(out.db_ok, false);
});

// ---------------------------------------------------------------- Plan: creating things
test('reminder.create becomes a parameterised insert', async () => {
  const p = await plan('remind me tomorrow at 6pm to call home', gemini(intent({ intent: 'reminder.create', title: 'call home.', when: '2026-10-22T18:00:00+05:30' })));
  assert.equal(p.ok, true);
  assert.equal(p.action, 'sql');
  assert.equal(p.provider, 'gemini');
  assert.match(p.sql, /^insert into jarvis\.items/);
  assert.deepEqual(p.params, ['reminder', 'Call home', 'personal', '', '2026-10-22T12:30:00.000Z', '', '{}', 'chat']);
});

test('SQL text never contains user text, only parameters do', async () => {
  const nasty = "x'); drop table jarvis.items; --";
  const a = await plan('a', gemini(intent({ intent: 'reminder.create', title: 'Call home', when: '2026-10-22T18:00:00+05:30' })));
  const b = await plan('b', gemini(intent({ intent: 'reminder.create', title: nasty, when: '2026-10-22T18:00:00+05:30' })));
  assert.equal(a.sql, b.sql);
  assert.ok(!b.sql.includes('drop table'));
  assert.ok(b.params.includes(nasty[0].toUpperCase() + nasty.slice(1)));
});

test('reminder.create asks when the time is missing, bad, or already past', async () => {
  const noTime = await plan('remind me to call the bank', gemini(intent({ intent: 'reminder.create', title: 'Call the bank' })));
  assert.equal(noTime.action, 'reply');
  assert.match(noTime.say, /When should I remind you to call the bank\?/);
  const bad = await plan('x', gemini(intent({ intent: 'reminder.create', title: 'Call', when: 'tomorrow evening' })));
  assert.equal(bad.action, 'reply');
  const past = await plan('x', gemini(intent({ intent: 'reminder.create', title: 'Call home', when: '2026-10-21T09:00:00+05:30' })));
  assert.match(past.say, /already passed/);
  const noTitle = await plan('x', gemini(intent({ intent: 'reminder.create', when: '2026-10-22T18:00:00+05:30' })));
  assert.match(noTitle.say, /What should I remind you about/);
});

test('a recurring reminder is accepted even if its first time is past, and the rule is validated', async () => {
  const ok = await plan('x', gemini(intent({ intent: 'reminder.create', title: 'Water plants', when: '2026-10-21T09:00:00+05:30', recurrence: 'FREQ=DAILY' })));
  assert.equal(ok.action, 'sql');
  assert.equal(ok.params[5], 'FREQ=DAILY');
  const evil = await plan('x', gemini(intent({ intent: 'reminder.create', title: 'Water plants', when: '2026-10-22T09:00:00+05:30', recurrence: "FREQ=DAILY; DROP" })));
  assert.equal(evil.params[5], '');
});

test('impossible dates are rejected', async () => {
  const p = await plan('x', gemini(intent({ intent: 'reminder.create', title: 'Call', when: '2026-02-31T10:00:00+05:30' })));
  assert.equal(p.action, 'reply');
});

test('task.create keeps an optional due date', async () => {
  const withDue = await plan('x', gemini(intent({ intent: 'task.create', title: 'finish DSA assignment', when: '2026-10-23T23:59:00+05:30', space: 'college' })));
  assert.deepEqual(withDue.params, ['task', 'Finish DSA assignment', 'college', '2026-10-23T18:29:00.000Z', '', '', '{}', 'chat']);
  const noDue = await plan('x', gemini(intent({ intent: 'task.create', title: 'Buy a notebook' })));
  assert.equal(noDue.params[3], '');
});

test('date.create rolls a past yearly date forward and defaults the advance alerts', async () => {
  const p = await plan('x', gemini(intent({ intent: 'date.create', title: "Mother's birthday", when: '2026-03-14T00:00:00+05:30', recurrence: 'FREQ=YEARLY' })));
  assert.equal(p.action, 'sql');
  assert.equal(p.params[3], '2027-03-13T18:30:00.000Z'); // 14 March 2027, 00:00 India
  assert.equal(p.params[6], '{7,1}');
  assert.equal(p.params[5], 'FREQ=YEARLY');
  const upcoming = await plan('x', gemini(intent({ intent: 'date.create', title: 'Exam', when: '2026-11-20', advance_days: [14, 3, 'x', -2, 500] })));
  assert.equal(upcoming.params[3], '2026-11-19T18:30:00.000Z');
  assert.equal(upcoming.params[6], '{14,3}');
  const past = await plan('x', gemini(intent({ intent: 'date.create', title: 'Exam', when: '2026-09-01' })));
  assert.match(past.say, /already passed/);
});

test('space: the request hint wins, unknown spaces fall back to personal', async () => {
  const hint = await plan('x', gemini(intent({ intent: 'task.create', title: 'Lab', space: 'personal' })), { body: { space: 'college' } });
  assert.equal(hint.params[2], 'college');
  const unknown = await plan('x', gemini(intent({ intent: 'task.create', title: 'Lab', space: 'nonsense' })));
  assert.equal(unknown.params[2], 'personal');
  const fromModel = await plan('x', gemini(intent({ intent: 'task.create', title: 'Lab', space: 'college' })));
  assert.equal(fromModel.params[2], 'college');
});

// ---------------------------------------------------------------- Plan: reading and changing things
test('item.list works out the time window', async () => {
  const today = await plan('x', gemini(intent({ intent: 'item.list', type: 'reminder', scope: 'today' })));
  assert.deepEqual(today.params, ['reminder', '', '2026-10-20T18:30:00.000Z', '2026-10-21T18:30:00.000Z', 'today']);
  const week = await plan('x', gemini(intent({ intent: 'item.list', type: 'any', scope: 'upcoming', space: 'college' })));
  assert.deepEqual(week.params, ['any', 'college', '2026-10-20T18:30:00.000Z', '2026-10-28T18:30:00.000Z', 'upcoming']);
  const late = await plan('x', gemini(intent({ intent: 'item.list', scope: 'overdue' })));
  assert.deepEqual(late.params, ['any', '', '1970-01-01T00:00:00.000Z', '2026-10-21T05:00:00.000Z', 'overdue']);
  const odd = await plan('x', gemini(intent({ intent: 'item.list', type: 'weird', scope: 'whenever' })));
  assert.equal(odd.params[0], 'any');
  assert.equal(odd.params[4], 'upcoming');
});

test('item.complete and item.cancel match by word stems and only ever bind safe text', async () => {
  const done = await plan('x', gemini(intent({ intent: 'item.complete', type: 'task', query: 'DSA assignment' })));
  assert.deepEqual(done.params, ['any', '{dsa,assignment}', 'done', 'DSA assignment']);
  const cancel = await plan('x', gemini(intent({ intent: 'item.cancel', query: "x'; drop table jarvis.items;--" })));
  assert.match(cancel.params[1], /^\{[a-z0-9,]+\}$/);
  assert.ok(!cancel.sql.includes('drop'));
  const missing = await plan('x', gemini(intent({ intent: 'item.complete' })));
  assert.equal(missing.action, 'reply');
  const symbols = await plan('x', gemini(intent({ intent: 'item.complete', query: '%_' })));
  assert.equal(symbols.action, 'reply');
});

test('different wording of the same task gives the same stems', async () => {
  const stems = async (q) => (await plan('x', gemini(intent({ intent: 'item.complete', query: q })))).params[1];
  const base = await stems('charge laptop');
  for (const q of ['charging laptop', 'charged the laptop', 'Charge my laptop', 'Charges laptop']) assert.equal(await stems(q), base, q);
  assert.equal(base, '{charg,laptop}');
  assert.equal(await stems('running'), '{run}');
  assert.equal(await stems('call home'), '{call,hom}');
});

test('"done X" and "I finished X" close an item even if the model wanted to create one', async () => {
  for (const [text, intentName] of [['Done, charge laptop', 'task.create'], ['I finished charge laptop', 'task.create'], ['finished the DSA lab', 'reminder.create'], ['done with charging laptop', 'chat']]) {
    const p = await plan(text, gemini(intent({ intent: intentName, title: 'Charge laptop', when: null })));
    assert.equal(p.intent, 'item.complete', text);
    assert.equal(p.action, 'sql');
  }
  const first = await plan('Done, charge laptop', gemini(intent({ intent: 'task.create', title: 'x' })));
  assert.equal(first.data.query, 'charge laptop');
  // Other sentences are left to the model.
  const other = await plan('add a task to do the done list', gemini(intent({ intent: 'task.create', title: 'Do the done list' })));
  assert.equal(other.intent, 'task.create');
});

test('space.create makes a safe slug', async () => {
  const p = await plan('x', gemini(intent({ intent: 'space.create', space_label: 'Side Projects!' })));
  assert.deepEqual(p.params, ['side-projects', 'Side Projects']);
  const none = await plan('x', gemini(intent({ intent: 'space.create', space_label: '!!!' })));
  assert.equal(none.action, 'reply');
});

test('weather, chat, unsupported and clarify need no database', async () => {
  const w = await plan('x', gemini(intent({ intent: 'weather', place: 'Panaji', scope: 'tomorrow' })));
  assert.equal(w.action, 'weather');
  assert.deepEqual(w.data, { place: 'Panaji', scope: 'tomorrow' });
  const c = await plan('x', gemini(intent({ intent: 'chat', reply: 'Hello there.' })));
  assert.equal(c.say, 'Hello there.');
  const u = await plan('x', gemini(intent({ intent: 'unsupported', reply: "I can't track habits yet." })));
  assert.equal(u.say, "I can't track habits yet.");
  assert.equal(u.action, 'reply');
});

// ---------------------------------------------------------------- Plan: bad model output
test('Plan copes with fenced JSON, Groq-shaped answers, junk, and no answer at all', async () => {
  const fenced = await plan('x', gemini('```json\n' + JSON.stringify(intent({ intent: 'chat', reply: 'Hi.' })) + '\n```'));
  assert.equal(fenced.say, 'Hi.');
  const g = await plan('x', groq(intent({ intent: 'chat', reply: 'Hi from Groq.' })));
  assert.equal(g.provider, 'groq');
  const junk = await plan('x', gemini('I think you want a reminder!'));
  assert.equal(junk.error, 'bad_llm_output');
  assert.equal(junk.ok, false);
  const none = await plan('x', { error: { message: 'quota' } });
  assert.equal(none.error, 'llm_unavailable');
  const unknown = await plan('x', gemini(intent({ intent: 'launch.rockets' })));
  assert.equal(unknown.error, 'unknown_intent');
  const empty = await plan('   ', {});
  assert.equal(empty.error, 'missing_text');
  assert.equal(empty.action, 'reply');
});

// ---------------------------------------------------------------- Reply
const planFor = (intentName, data, extra = {}) => ({
  ok: true, intent: intentName, action: 'sql', sql: 'select 1', params: [], say: null, error: null, provider: 'gemini', data,
  ctx: { now_iso: NOW.toISOString(), source: 'app', home_location: null, spaces: SPACES }, ...extra,
});

test('Reply confirms a reminder in plain spoken English', async () => {
  const out = await reply(planFor('reminder.create', {}), [{ id: 'abc', type: 'reminder', title: 'Call home', space: 'personal', remind_at: '2026-10-22T12:30:00.000Z', due_at: null, recurrence: null, advance_days: [] }]);
  assert.equal(out.ok, true);
  assert.equal(out.reply, "Okay, I'll remind you tomorrow at 6 PM to call home.");
  assert.equal(out.item.remind_at, '2026-10-22T18:00:00+05:30');
  const weekly = await reply(planFor('reminder.create', {}), [{ id: 'abc', type: 'reminder', title: 'Submit lab report', space: 'college', remind_at: '2026-10-26T03:30:00.000Z', recurrence: 'FREQ=WEEKLY;BYDAY=MO', advance_days: [] }]);
  assert.equal(weekly.reply, "Okay, I'll remind you on Monday at 9 AM to submit lab report, repeating every Monday. Filed under College.");
});

test('Reply confirms tasks and dates', async () => {
  const task = await reply(planFor('task.create', {}), [{ id: 't', type: 'task', title: 'Finish DSA assignment', space: 'college', due_at: '2026-10-23T18:29:00.000Z' }]);
  assert.equal(task.reply, 'Added "Finish DSA assignment" to your tasks, due on Friday. Filed under College.');
  const open = await reply(planFor('task.create', {}), [{ id: 't', type: 'task', title: 'Buy a notebook', space: 'personal', due_at: null }]);
  assert.equal(open.reply, 'Added "Buy a notebook" to your tasks.');
  const date = await reply(planFor('date.create', {}), [{ id: 'd', type: 'date', title: "Mother's birthday", space: 'personal', due_at: '2027-03-13T18:30:00.000Z', recurrence: 'FREQ=YEARLY', advance_days: [7, 1] }]);
  assert.equal(date.reply, "Saved Mother's birthday on 14 March 2027, repeating every year. I'll remind you a week before and a day before.");
});

test('Reply lists items, handles empty lists, and trims long ones', async () => {
  const rows = [
    { id: '1', type: 'reminder', title: 'Call home', space: 'personal', remind_at: '2026-10-21T12:30:00.000Z' },
    { id: '2', type: 'task', title: 'Finish DSA assignment', space: 'college', due_at: '2026-10-21T18:29:00.000Z' },
  ];
  const out = await reply(planFor('item.list', { type: 'any', scope: 'today' }), rows);
  assert.equal(out.reply, 'You have 2 items today. Call home at 6 PM. Finish DSA assignment, due today.');
  assert.equal(out.items.length, 2);
  const none = await reply(planFor('item.list', { type: 'reminder', scope: 'today' }), []);
  assert.equal(none.reply, 'You have no reminders today.');
  assert.deepEqual(none.items, []);
  const many = Array.from({ length: 7 }, (_, i) => ({ id: String(i), type: 'task', title: `Task ${i + 1}`, space: 'personal', due_at: null }));
  const long = await reply(planFor('item.list', { type: 'task', scope: 'all' }), many);
  assert.match(long.reply, /^You have 7 open tasks\. Task 1\. Task 2\. Task 3\. Task 4\. Task 5\. And 2 more\.$/);
});

test('Reply handles complete and cancel for zero, one and several matches', async () => {
  const data = { type: 'task', query: 'dsa', closing: 'done' };
  const zero = await reply(planFor('item.complete', data), [{ match_count: '0', candidates: null, updated: null }]);
  assert.equal(zero.reply, 'I couldn\'t find an open item matching "dsa".');
  const one = await reply(planFor('item.complete', data), [{ match_count: '1', candidates: [{ id: 'x', title: 'Finish DSA assignment' }], updated: { id: 'x', type: 'task', title: 'Finish DSA assignment', space: 'college' } }]);
  assert.equal(one.reply, 'Done. I marked "Finish DSA assignment" as complete.');
  const cancelled = await reply(planFor('item.cancel', { ...data, closing: 'cancelled' }), [{ match_count: '1', candidates: [], updated: { id: 'x', type: 'task', title: 'Finish DSA assignment', space: 'college' } }]);
  assert.equal(cancelled.reply, 'Okay, I cancelled "Finish DSA assignment".');
  const many = await reply(planFor('item.complete', data), [{ match_count: '2', candidates: [{ id: '1', title: 'DSA lab' }, { id: '2', title: 'DSA notes' }], updated: null }]);
  assert.equal(many.reply, 'I found 2 matches: DSA lab, DSA notes. Which one do you mean?');
  assert.equal(many.needs_clarification, true);
});

test('Reply handles spaces and database failures', async () => {
  const created = await reply(planFor('space.create', { slug: 'side-projects', label: 'Side Projects' }), [{ slug: 'side-projects', label: 'Side Projects' }]);
  assert.equal(created.reply, 'Created the Side Projects space.');
  const existing = await reply(planFor('space.create', { slug: 'side-projects', label: 'Side Projects' }), []);
  assert.equal(existing.reply, 'You already have a space called Side Projects.');
  const failed = await reply(planFor('reminder.create', {}), [{ error: 'connection refused' }]);
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'db_error');
  const nothing = await reply(planFor('reminder.create', {}), []);
  assert.equal(nothing.error, 'db_error');
});

test('Reply passes plain answers straight through', async () => {
  const out = await reply({ ...planFor('clarify', {}), action: 'reply', sql: null, say: 'When should I remind you?' });
  assert.deepEqual(out, { ok: true, intent: 'clarify', provider: 'gemini', reply: 'When should I remind you?', needs_clarification: true });
  const bad = await reply({ ...planFor('clarify', {}), action: 'reply', ok: false, error: 'llm_unavailable', say: 'Try again.' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'llm_unavailable');
});

// ---------------------------------------------------------------- Weather
const FORECAST = {
  current: { temperature_2m: 29.4, apparent_temperature: 33.2, weather_code: 2 },
  daily: { temperature_2m_max: [31.1, 30.2], temperature_2m_min: [25.0, 24.6], precipitation_probability_max: [60, 80], weather_code: [2, 61] },
};
const weatherPlan = (data, home) => ({ ...planFor('weather', data), action: 'weather', sql: null, ctx: { now_iso: NOW.toISOString(), source: 'app', home_location: home || null, spaces: SPACES } });

test('weather for the home location and for a named place', async () => {
  const calls = [];
  const helpers = { httpRequest: async (o) => { calls.push(o.url); return o.url.includes('geocoding') ? { results: [{ name: 'Panaji', latitude: 15.49, longitude: 73.83 }] } : FORECAST; } };
  const home = await reply(weatherPlan({ place: '', scope: 'today' }, { name: 'BITS Goa', lat: 15.39, lon: 73.88 }), [], helpers);
  assert.equal(home.reply, "In BITS Goa it's 29 degrees and partly cloudy, feeling like 33. Today's high is 31 and the low is 25, with a 60 percent chance of rain.");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /latitude=15\.39&longitude=73\.88/);
  assert.match(calls[0], /timezone=Asia%2FKolkata/);
  const place = await reply(weatherPlan({ place: 'Panaji', scope: 'tomorrow' }), [], helpers);
  assert.equal(place.reply, 'Tomorrow in Panaji it will be rainy, with a high of 30 and a low of 25, with a 80 percent chance of rain.');
  assert.match(calls[1], /name=Panaji/);
  assert.equal(place.weather.high_c, 30);
});

test('weather explains missing location, unknown place, and network failure', async () => {
  const none = await reply(weatherPlan({ place: '', scope: 'today' }), [], { httpRequest: async () => { throw new Error('no network'); } });
  assert.match(none.reply, /I don't have a home location yet/);
  const unknown = await reply(weatherPlan({ place: 'Zzyzx', scope: 'today' }), [], { httpRequest: async () => ({}) });
  assert.equal(unknown.reply, "I couldn't find a place called Zzyzx.");
  const down = await reply(weatherPlan({ place: 'Panaji', scope: 'today' }), [], { httpRequest: async () => { throw new Error('timeout'); } });
  assert.equal(down.ok, false);
  assert.equal(down.error, 'weather_error');
  const weird = await reply(weatherPlan({ place: '', scope: 'today' }, { name: 'X', lat: 999, lon: 0 }), [], { httpRequest: async () => FORECAST });
  assert.equal(weird.error, 'weather_error');
});

// ---------------------------------------------------------------- M7: habits and ideas
const withLists = { spaces: SPACES, home_location: null, habits: ['Meditate', 'Gym workout'], open_items: [{ type: 'reminder', title: 'Charge laptop' }] };

test('the prompt lists the open items and the habits, and habits and ideas are no longer "unsupported"', async () => {
  const [prepared] = await run('Prepare', { input: [{ body: { text: 'hi' } }] });
  const [b] = await run('Build request', { input: [withLists], nodes: { Prepare: [prepared] } });
  const prompt = b.gemini_body.systemInstruction.parts[0].text;
  assert.match(prompt, /Habits the user tracks[\s\S]*- Meditate[\s\S]*- Gym workout/);
  assert.match(prompt, /habit\.log/);
  assert.match(prompt, /idea\.create/);
  assert.doesNotMatch(prompt, /unsupported: habits/);
});

test('habit.create validates the name and target', async () => {
  const p = await plan('x', gemini(intent({ intent: 'habit.create', title: 'meditate.', target: 5 })), { db: withLists });
  assert.deepEqual(p.params, ['Meditate', 5, 'chat']);
  assert.equal((await plan('x', gemini(intent({ intent: 'habit.create', title: 'Run', target: 12 })), { db: withLists })).params[1], null);
  assert.equal((await plan('x', gemini(intent({ intent: 'habit.create' })), { db: withLists })).action, 'reply');
});

test('habit.log matches by stems, uses today or yesterday, and never puts text into the SQL', async () => {
  const today = await plan('x', gemini(intent({ intent: 'habit.log', query: 'meditated', scope: 'today' })), { db: withLists });
  assert.deepEqual(today.params, ['{meditat}', '2026-10-21', 'meditated']);
  const yest = await plan('x', gemini(intent({ intent: 'habit.log', query: "Gym workout'; drop table x;--", scope: 'yesterday' })), { db: withLists });
  assert.equal(yest.params[1], '2026-10-20');
  assert.ok(!yest.sql.includes('drop'));
  assert.equal((await plan('x', gemini(intent({ intent: 'habit.log' })), { db: withLists })).action, 'reply');
});

test('"done meditate" checks in a habit, "done charge laptop" closes the reminder', async () => {
  const habit = await plan('Done meditating', gemini(intent({ intent: 'task.create', title: 'Meditating' })), { db: withLists });
  assert.equal(habit.intent, 'habit.log');
  const item = await plan('Done, charge laptop', gemini(intent({ intent: 'task.create', title: 'Charge laptop' })), { db: withLists });
  assert.equal(item.intent, 'item.complete');
});

test('idea.create keeps the words whole; idea.list and habit.list need no input', async () => {
  const p = await plan('x', gemini(intent({ intent: 'idea.create', text: 'A budget app that reads bank texts and sorts them' })), { db: withLists });
  assert.deepEqual(p.params, ['A budget app that reads bank texts and sorts them', 'A budget app that reads bank texts and sorts them', 'chat']);
  assert.equal((await plan('x', gemini(intent({ intent: 'idea.create' })), { db: withLists })).action, 'reply');
  assert.equal((await plan('x', gemini(intent({ intent: 'idea.list' })), { db: withLists })).action, 'sql');
  assert.equal((await plan('x', gemini(intent({ intent: 'habit.list' })), { db: withLists })).params.length, 0);
});

test('Reply speaks habit check-ins with the streak', async () => {
  const data = { query: 'meditate', day: '2026-10-21', today: '2026-10-21', yesterday: false };
  const habit = { id: 'h1', title: 'Meditate' };
  const one = await reply(planFor('habit.log', data), [{ match_count: '1', habit, dates: ['2026-10-19', '2026-10-20'], candidates: [habit] }]);
  assert.equal(one.reply, "Logged Meditate for today. That's a 3 day streak.");
  const again = await reply(planFor('habit.log', data), [{ match_count: '1', habit, dates: ['2026-10-21'], candidates: [habit] }]);
  assert.match(again.reply, /already checked in for today/);
  const first = await reply(planFor('habit.log', data), [{ match_count: '1', habit, dates: [], candidates: [habit] }]);
  assert.match(first.reply, /day one/);
  const none = await reply(planFor('habit.log', data), [{ match_count: '0', habit: null, dates: [], candidates: null }]);
  assert.match(none.reply, /couldn't find a habit/);
  const list = await reply(planFor('habit.list', { today: '2026-10-21' }), [{ id: 'h1', title: 'Meditate', dates: ['2026-10-20', '2026-10-21'] }, { id: 'h2', title: 'Gym', dates: [] }]);
  assert.equal(list.reply, 'You track 2 habits. Meditate, 2 day streak, done today. Gym, no streak.');
});

test('streakInfo counts from yesterday until a day is missed, and finds the best run', async () => {
  const [r] = await run('Reply', {
    input: [{ match_count: '1', habit: { id: 'h', title: 'X' }, dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-19', '2026-10-20'], candidates: [] }],
    nodes: { Plan: [{ plan: planFor('habit.log', { query: 'x', day: '2026-10-20', today: '2026-10-21', yesterday: true }) }] },
  });
  assert.match(r.reply, /2 day streak/);
});
