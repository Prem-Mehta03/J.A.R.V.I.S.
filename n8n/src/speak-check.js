// Node "Check text": validates the request and builds the Groq text-to-speech body.
const body = ($input.first().json || {}).body || {};
const VOICES = ['austin', 'troy', 'daniel', 'autumn', 'diana', 'hannah'];
const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
if (!text) return [{ json: { ok: false, error: 'missing_text', reply: 'There was nothing to say.' } }];
if (text.length > 400) return [{ json: { ok: false, error: 'text_too_long', reply: 'That is too long to speak in one piece.' } }];
const voice = VOICES.includes(body.voice) ? body.voice : 'troy';
return [{ json: { ok: true, tts_body: { model: 'canopylabs/orpheus-v1-english', input: text, voice, response_format: 'wav' } } }];
