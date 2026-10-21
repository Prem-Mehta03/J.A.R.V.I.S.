# Webhook contract

Status: `jarvis-ping` (M0), `jarvis` (M2), `jarvis-items` (M4) and `jarvis-transcribe` and `jarvis-speak` (M5) and `jarvis-sync` (M6) exist. The rest is the plan for later milestones and may change.

Every client (Siri Shortcuts, the PWA) talks to n8n through webhooks. One shared token protects all of them.

## Basics

- Production address: `https://<service>.onrender.com/webhook/<path>`. The `/webhook-test/` address only works while the n8n editor is listening and is for building, not for clients.
- Authentication: every request carries the header `X-Jarvis-Token: <token>`. In n8n, each Webhook node uses Authentication = Header Auth with a credential named **Jarvis token** (header name `X-Jarvis-Token`). n8n rejects requests without a valid token before any workflow logic runs.
- Content: JSON in, JSON out.
- Timeouts: the free Render service can take about a minute to wake if the pinger missed. Clients should allow 60 to 90 seconds and say "waking up" instead of failing.
- Times: ISO 8601 with an offset, like `2026-10-21T18:00:00+05:30`. Ids are UUIDs.
- Errors: application problems come back as HTTP 200 with `"ok": false` and a `reply` that can be spoken, so a Shortcut can always read `reply`. HTTP error statuses are only for authentication and transport.

## Endpoints

| Path | Method | Milestone | Purpose |
|---|---|---|---|
| `jarvis-ping` | POST | M0 (exists) | Health check. Returns `{"reply": "pong"}`. |
| `jarvis` | POST | M2 (exists) | Chat. Text in, spoken-style reply out. Creates and changes items. |
| `jarvis-sync` | POST | M6 (exists) | iOS Reminders sync: marks reminders ticked off on the phone as done, returns what to add and close there. "Jarvis, done with X" uses `jarvis` instead. |
| `jarvis-email-feedback` | POST | M8 | "That was an ad" corrections. |

### `POST jarvis` (M2)

Limits: `text` is required and at most 1000 characters. Intents handled: `reminder.create`, `task.create`, `date.create`, `item.list`, `item.complete`, `item.cancel`, `space.create`, `weather`, `chat`, `clarify`.

Request:

```json
{ "text": "remind me tomorrow at 6 to call home", "source": "app", "space": "personal" }
```

- `source`: `app`, `shortcut` or `voice`.
- `space`: optional. If missing, the router guesses from the wording and defaults to `personal`.

Response:

```json
{
  "ok": true,
  "reply": "Okay, I'll remind you tomorrow at 6 PM to call home.",
  "intent": "reminder.create",
  "item": { "id": "uuid", "type": "reminder", "title": "Call home", "space": "personal", "remind_at": "2026-10-21T18:00:00+05:30" }
}
```

Error codes: `missing_text`, `text_too_long`, `llm_unavailable`, `bad_llm_output`, `unknown_intent`, `db_error`, `weather_error`. When Jarvis needs more detail (or several items match "done with X") the response has `"needs_clarification": true`.

On a problem: `{ "ok": false, "reply": "I couldn't work out the time. When should I remind you?", "error": "missing_time" }`.

## `POST /webhook/jarvis-items` (M4, used by the app)

Same `X-Jarvis-Token` header. No language model involved: fixed queries only.

| Request body | Response |
|---|---|
| `{"action":"list"}` | `{"ok":true,"now":"ISO","items":[{"id","type","title","space","status","due_at","remind_at","recurrence","advance_days"}],"spaces":[{"slug","label"}]}`. Open reminders, tasks and dates, up to 300, times in +05:30. |
| `{"action":"complete","id":"<uuid>"}` | `{"ok":true,"item":{...,"status":"done"}}` |
| `{"action":"cancel","id":"<uuid>"}` | `{"ok":true,"item":{...,"status":"cancelled"}}` |

Errors (HTTP 200, `ok:false`, with a `reply`): `bad_action`, `bad_id`, `not_found` (already closed), `db_error`. A wrong token is HTTP 403.

CORS: both `jarvis` and `jarvis-items` have Allowed Origins `*` on the Webhook node. That is safe here because the token travels in a header, not a cookie, so a foreign page cannot ride on a logged-in session; it still needs the token.

## `POST /webhook/jarvis-transcribe` (M5, used by the app's microphone)

Same `X-Jarvis-Token` header. Request is `multipart/form-data` with one file field named `audio` (the app sends `voice.m4a` from iPhone, `voice.webm` from Chrome). Speech to text runs on Groq's free Whisper (`whisper-large-v3-turbo`, English). The app then sends the text to `jarvis` as a normal chat message.

Response: `{"ok": true, "text": "remind me tomorrow at 6 pm to call home"}`, or `{"ok": false, "error": "...", "reply": "..."}` with `no_audio`, `empty` (silence; Whisper's stock phrases such as "Thank you." are treated as silence), `busy` (rate limit) or `stt_error` (plus a short `detail`).

Limits: Groq's free tier allows about 20 requests a minute and 2,000 a day, far above personal use. Keep recordings under a minute.

## `POST /webhook/jarvis-speak` (M5, used by voice mode and Settings)

Same `X-Jarvis-Token` header. JSON body `{"text": "...", "voice": "troy"}`. `text` is up to 400 characters (the app sends pieces of at most 190, because Groq's speech model takes short input). `voice` is one of `austin, troy, daniel, autumn, diana, hannah` (default `troy`). Runs Groq `canopylabs/orpheus-v1-english` and returns the audio inline.

Response: `{"ok": true, "audio": "<base64 WAV>", "mime": "audio/wav"}`, or `{"ok": false, "error": "...", "reply": "...", "detail": "..."}` with `missing_text`, `text_too_long`, `terms` (model terms not yet accepted in the Groq console), `busy` (rate limit, about 100 requests a day on the free tier) or `tts_error`. The app falls back to the phone's voice on any error.

## `POST /webhook/jarvis-sync` (M6, used by the "Jarvis Sync" Shortcut)

Same `X-Jarvis-Token` header. JSON body `{"done": "<text>", "known": "<text>"}`. Each is the Notes of reminders in the iPhone "Jarvis" list (one per line, a real list also works): `done` from the ticked-off ones, `known` from the open ones. Only text shaped like an id is used (`jarvis:<id>` or a bare id); anything else is ignored. At most 200 ids in each.

In one database statement it marks the `done` ids as done (open reminders and tasks only) and answers:

```json
{"ok": true, "add": [{"id": "...", "title": "Call home", "due": "2026-10-22T18:00:00+05:30", "note": "jarvis:<id>"}],
 "add_plain": [{"id": "...", "title": "Buy pens", "due": "", "note": "jarvis:<id>"}],
 "close_ids": ["..."], "close_text": "id\nid", "completed": 1, "reply": "Synced. 1 new, 1 closed on your phone, 1 marked done in Jarvis."}
```

`add`: open, non-repeating reminders and tasks with a time, not in `known`, at most 50. `add_plain`: the same with no time. `close_ids`: ids in `known` that are no longer open in Jarvis (done, cancelled or gone). Repeating reminders and dates are never synced. Errors (HTTP 200, `ok:false`): `too_many` (over 200 ids) and `db_error`.

## The token

- Generate: `.\scripts\new-token.ps1 | Set-Clipboard` (64 hex characters). It is never printed into a file.
- Where it lives: the n8n credential **Jarvis token**, typed by hand into each Shortcut, and entered once in the PWA. It is never committed.
- **The PWA must not hard-code it.** A static site's source is public, so anything written into the JavaScript is readable by anyone who finds the address. The app asks for the token on first launch and keeps it in the phone's local storage.
- Rotate if it is ever pasted somewhere it shouldn't be: generate a new one, update the n8n credential (the old one stops working immediately), then update each Shortcut and re-enter it in the PWA.

## Open points for later milestones

- **CORS (done in M4).** See the `jarvis-items` section.
- **Abuse.** The token is the only protection on a public address. If it ever looks abused, rotate it.
