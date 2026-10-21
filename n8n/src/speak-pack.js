// Node "Pack audio": the text-to-speech answer arrives as a file. If it is audio, hand it back as base64 JSON;
// otherwise it is an error message from Groq, so turn that into a short reason the app can show.
const item = $input.first();
const bin = item.binary && item.binary.data;
if (!bin) return [{ json: { ok: false, error: 'tts_error', reply: 'No audio came back.' } }];
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
if (/^audio\//i.test(String(bin.mimeType || '')) || buf.slice(0, 4).toString('latin1') === 'RIFF') {
  return [{ json: { ok: true, audio: buf.toString('base64'), mime: 'audio/wav' } }];
}
let detail = '';
try { const j = JSON.parse(buf.toString('utf8')); detail = String((j.error && (j.error.message || j.error.code)) || j.message || ''); } catch (e) { detail = buf.toString('utf8').slice(0, 160); }
detail = detail.slice(0, 200);
let error = 'tts_error';
if (/terms/i.test(detail)) error = 'terms';
else if (/rate|limit|quota|exceeded/i.test(detail)) error = 'busy';
return [{ json: { ok: false, error, reply: 'The natural voice is not available right now.', detail } }];
