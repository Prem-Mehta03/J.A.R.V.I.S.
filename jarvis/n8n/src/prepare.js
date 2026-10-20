// Node "Prepare": checks the request body and stamps the current India time on it.
// @include _lib.js

const first = $input.first().json || {};
const body = first.body && typeof first.body === 'object' ? first.body : {};
const now = new Date();

const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '';
let invalid = null;
if (!text) invalid = 'missing_text';
else if (text.length > 1000) invalid = 'text_too_long';

const source = ['app', 'voice', 'shortcut'].includes(body.source) ? body.source : 'app';
const spaceHint = typeof body.space === 'string' && /^[a-z0-9-]{1,30}$/.test(body.space) ? body.space : null;

return [{
  json: {
    text,
    source,
    space_hint: spaceHint,
    invalid,
    valid: !invalid,
    now_iso: now.toISOString(),
    now_ist: isoIst(now),
    weekday: DAY_NAMES[toIst(now).getUTCDay()],
  },
}];
