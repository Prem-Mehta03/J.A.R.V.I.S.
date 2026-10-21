// Tests for the voice workflow (04): the audio check and the transcript judge.
// Run with: node --test n8n/tests/voice.test.mjs   (rebuild first: python scripts/build_workflows.py)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wf = JSON.parse(fs.readFileSync(path.join(here, '..', 'workflows', '04-voice.json'), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(name, item) {
  const code = wf.nodes.find((n) => n.name === name).parameters.jsCode;
  const $input = { first: () => item, all: () => [item] };
  return (await new AsyncFunction('$input', code)($input)).map((i) => ({ json: i.json, binary: i.binary }));
}

test('missing audio gets a speakable error', async () => {
  const [o] = await run('Check audio', { json: {}, binary: {} });
  assert.equal(o.json.ok, false);
  assert.equal(o.json.error, 'no_audio');
});

test('audio is passed on with a file name Whisper understands', async () => {
  for (const [mime, ext] of [['audio/mp4', 'm4a'], ['audio/webm;codecs=opus', 'webm'], ['audio/ogg', 'ogg'], ['audio/wav', 'wav'], ['application/octet-stream', 'm4a']]) {
    const [o] = await run('Check audio', { json: {}, binary: { audio: { mimeType: mime, fileName: 'x' } } });
    assert.equal(o.json.ok, true);
    assert.equal(o.binary.audio.fileName, 'voice.' + ext);
  }
});

test('a good transcript comes back as text', async () => {
  const [o] = await run('Transcript', { json: { statusCode: 200, body: { text: '  remind me at six to call home ' } } });
  assert.deepEqual(o.json, { ok: true, text: 'remind me at six to call home' });
});

test('silence and Whisper stock phrases count as nothing heard', async () => {
  for (const text of ['', '   ', 'Thank you.', 'you', 'Thanks for watching!'.replace('!', '.'), '.']) {
    const [o] = await run('Transcript', { json: { statusCode: 200, body: { text } } });
    assert.equal(o.json.ok, false, text);
    assert.equal(o.json.error, 'empty');
  }
});

test('rate limit and other failures give short replies', async () => {
  const [busy] = await run('Transcript', { json: { statusCode: 429, body: { error: { message: 'rate' } } } });
  assert.equal(busy.json.error, 'busy');
  const [bad] = await run('Transcript', { json: { statusCode: 400, body: { error: { message: 'bad file' } } } });
  assert.equal(bad.json.error, 'stt_error');
  assert.equal(bad.json.detail, 'bad file');
  const [dead] = await run('Transcript', { json: { error: 'ECONNRESET' } });
  assert.equal(dead.json.error, 'stt_error');
});

test('workflow wiring: audio goes to Whisper, a missing file answers directly', () => {
  assert.deepEqual(wf.connections['Has audio?'].main.map((b) => b.map((x) => x.node)), [['Whisper'], ['Respond']]);
  const whisper = wf.nodes.find((n) => n.name === 'Whisper').parameters;
  assert.equal(whisper.contentType, 'multipart-form-data');
  assert.equal(whisper.bodyParameters.parameters[0].inputDataFieldName, 'audio');
});
