// Node "Transcript": turns the speech-to-text answer into { ok, text } or a short, speakable error.
const r = $input.first().json || {};
const body = r.body && typeof r.body === 'object' ? r.body : {};
const status = Number(r.statusCode);

if (status >= 200 && status < 300 && typeof body.text === 'string') {
  const text = body.text.trim();
  // On near-silence, Whisper tends to invent a stock phrase. Treat those as "nothing heard".
  const stock = /^(thank you\.?|thanks\.?|thanks for watching\.?|you\.?|bye\.?|\.+)$/i;
  if (!text || stock.test(text)) {
    return [{ json: { ok: false, error: 'empty', reply: "I didn't catch anything. Try again." } }];
  }
  return [{ json: { ok: true, text } }];
}
if (status === 429) {
  return [{ json: { ok: false, error: 'busy', reply: 'The voice service is busy. Try again in a minute.' } }];
}
const detail = String(body.error && body.error.message ? body.error.message : (r.error || r.body || '')).slice(0, 200);
return [{ json: { ok: false, error: 'stt_error', reply: "I couldn't make that out. Try again.", detail } }];
