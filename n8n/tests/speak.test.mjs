// Tests for the text-to-speech workflow (05).
// Run with: node --test n8n/tests/speak.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', '05-speak.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(name, item, buffer) {
  const code = wf.nodes.find((n) => n.name === name).parameters.jsCode;
  const $input = { first: () => item };
  const ctx = { helpers: { getBinaryDataBuffer: async () => buffer } };
  return (await new AsyncFunction('$input', code).call(ctx, $input)).map((i) => i.json);
}

test('text is cleaned and the Groq body is built', async () => {
  const [o] = await run('Check text', { json: { body: { text: '  Hello   there.  ', voice: 'austin' } } });
  assert.deepEqual(o.tts_body, { model: 'canopylabs/orpheus-v1-english', input: 'Hello there.', voice: 'austin', response_format: 'wav' });
});

test('unknown voices fall back to the default; empty and long text are refused', async () => {
  const [a] = await run('Check text', { json: { body: { text: 'Hi', voice: 'evil; drop table' } } });
  assert.equal(a.tts_body.voice, 'troy');
  const [b] = await run('Check text', { json: { body: { text: '   ' } } });
  assert.equal(b.error, 'missing_text');
  const [c] = await run('Check text', { json: { body: { text: 'x'.repeat(401) } } });
  assert.equal(c.error, 'text_too_long');
});

test('audio comes back as base64', async () => {
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)]);
  const [o] = await run('Pack audio', { json: {}, binary: { data: { mimeType: 'audio/wav' } } }, wav);
  assert.equal(o.ok, true);
  assert.equal(Buffer.from(o.audio, 'base64').slice(0, 4).toString(), 'RIFF');
});

test('Groq errors turn into short, specific reasons', async () => {
  const err = (message) => Buffer.from(JSON.stringify({ error: { message } }));
  const bin = { binary: { data: { mimeType: 'application/json' } }, json: {} };
  const [t] = await run('Pack audio', bin, err('The model requires terms acceptance'));
  assert.equal(t.error, 'terms');
  const [b] = await run('Pack audio', bin, err('Rate limit reached for model'));
  assert.equal(b.error, 'busy');
  const [x] = await run('Pack audio', bin, err('something else'));
  assert.equal(x.error, 'tts_error');
  assert.equal(x.detail, 'something else');
  const [n] = await run('Pack audio', { json: {} }, Buffer.alloc(0));
  assert.equal(n.error, 'tts_error');
});

test('wiring: valid text goes to Groq, invalid text answers directly', () => {
  assert.deepEqual(wf.connections['Has text?'].main.map((b) => b.map((x) => x.node)), [['Groq speech'], ['Respond']]);
  assert.equal(wf.nodes.find((n) => n.name === 'Groq speech').parameters.options.response.response.responseFormat, 'file');
});
