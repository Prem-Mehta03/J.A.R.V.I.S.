# Webhook contract

Status: `jarvis-ping` (M0) and `jarvis` (M2) exist. The rest is the plan for later milestones and may change.

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
| `jarvis-reminders` | GET | M6 | Pending reminders for the iOS Reminders sync. |
| `jarvis-done` | POST | M6 | Mark reminders done (from the sync, or "Jarvis, done with X"). |
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

## The token

- Generate: `.\scripts\new-token.ps1 | Set-Clipboard` (64 hex characters). It is never printed into a file.
- Where it lives: the n8n credential **Jarvis token**, typed by hand into each Shortcut, and entered once in the PWA. It is never committed.
- **The PWA must not hard-code it.** A static site's source is public, so anything written into the JavaScript is readable by anyone who finds the address. The app asks for the token on first launch and keeps it in the phone's local storage.
- Rotate if it is ever pasted somewhere it shouldn't be: generate a new one, update the n8n credential (the old one stops working immediately), then update each Shortcut and re-enter it in the PWA.

## Open points for later milestones

- **CORS (M4).** Calls from the PWA come from another origin, and the custom header makes the browser send a preflight request first. The Webhook node has an "Allowed Origins (CORS)" option; set it to the PWA's address and test that the preflight succeeds. Shortcuts are not affected by CORS.
- **Abuse.** The token is the only protection on a public address. If it ever looks abused, rotate it.
