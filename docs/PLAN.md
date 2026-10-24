# Jarvis: Personal Assistant Plan

Status: M0 to M3.1 complete (reminders push through Bark); M4 (the app) built and tested locally, waiting for real-service checks. Everything below runs on free tiers, no card. M0 results are in [M0-checklist.md](M0-checklist.md); the reasoning behind the choices is in [decisions.md](decisions.md).

## 1. Goal

A personal assistant I can talk or type to from my iPhone. It keeps reminders, tasks, important dates, habits, study logs and ideas, summarizes my two Gmail accounts, answers simple questions, and can grow into web automation.

## 2. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Static PWA (HTML/JS), Cloudflare Pages or GitHub Pages | Chat + tabs. Add to Home Screen. The token is entered on the phone, never hard-coded (see api.md). |
| Automation / brain | n8n Community Edition 2.43.8 on Render (free web service) | Webhooks, schedules, LLM routing. Version pinned. |
| Keep-alive | cron-job.org pings `/healthz` every ~10 min | Render free sleeps after 15 min idle. |
| Database | Supabase free Postgres | Separate schemas: `n8n` for n8n, `jarvis` for our data. |
| LLM | Gemini free tier (primary), Groq free tier (fallback) | Tested in M0: `gemini-3.6-flash` and Groq `openai/gpt-oss-20b` both returned valid JSON. Retry on HTTP 429. |
| Speech to text | Whisper on Groq free tier | Browser records audio, n8n transcribes. |
| Text to speech | Browser `speechSynthesis` | No cost. |
| Push alerts | Bark (free iPhone app), called from n8n; Google Calendar event as the backup | Replaced ntfy in M3.1: ntfy.sh refused requests from Render's shared address. |
| iPhone integration | Siri Shortcuts | Open app, speak reminders, sync with iOS Reminders. |
| Weather | Open-Meteo | No API key. |
| Email | Gmail via n8n, two accounts (personal, college) | Both connected in M0 through one Google Cloud app. See section 5. |

Render free limits to design around: sleeps after 15 min without traffic, 750 free hours/month per workspace (one always-awake service fits), ephemeral filesystem (so all state goes to Supabase), may restart at any time.

## 3. Data model (Supabase, schema `jarvis`)

- `spaces`: personal, college, and more later (internships, projects).
- `items`: one table for reminders, tasks, dates, habits, ideas. Fields: id, type, title, body, space, tags[], status, due_at, remind_at, recurrence, advance_days[], last_notified_at, next_attempt_at, ios_reminder_ref, created_at, updated_at. `alert_log` records which advance alerts of a date were sent; `settings` holds small values such as `home_location` and `bark_key`.
- `habit_logs`: habit_id, date, done.
- `study_logs`: subject, minutes, date, space.
- `email_rules`: account, sender or domain, label (important / normal / promo), source (user or llm).
- `email_feedback`: message_id, account, sender, subject, llm_label, user_label, created_at.
- `settings`: key/value preferences (timezone, morning briefing time).
- `schema_migrations`: which migrations have been applied.

Every item has a `space` from day one, so splitting personal vs college is a filter, not a migration.

## 4. Features by version

v1 core: reminders, tasks, important dates (with advance alerts), weather and simple questions, chat + mic + spoken replies, Siri "Wake up Jarvis".
v2 daily use: habits, study tracking (weekly targets and summary), ideas inbox (new / exploring / parked / done), iOS Reminders sync, morning briefing, Google Calendar read and create.
v3 email: both accounts, important vs advertisement, per-account digest, learns from corrections.
v4 web: page and price watching, topic digests, "look this up" tasks.

## 5. Key design decisions

### iOS Reminders and Siri
- n8n cannot write to iOS Reminders directly (no public API). Sync is done by Shortcuts running on the phone, using a dedicated Reminders list named "Jarvis".
- Jarvis to iPhone: a "Jarvis Sync" shortcut fetches pending reminders from n8n and adds missing ones to the list (each carries `jarvis:<id>` in its notes).
- iPhone to Jarvis: the same shortcut finds completed reminders in that list and reports them to n8n. There is no "reminder completed" trigger in Shortcuts, so this runs on a schedule (time-of-day automations) and on demand. A voice shortcut ("Jarvis, done with X") gives instant completion.
- "Hey Siri, what are my reminders" works natively once items are in the list. A "Jarvis reminders" shortcut can also fetch and speak them.
- Exact-time alerts come from the push channel, so they do not depend on sync timing.
- Verified in M0: a time-of-day automation runs a shortcut on a locked phone without a prompt. Still to verify: whether "Wake up Jarvis" opens the Home Screen app or Safari.

### Email
- Pipeline per account: fetch new mail on a schedule and on demand, apply sender/domain rules first, then the LLM for the rest, then a digest per account ("personal: ..., college: ...").
- Learning: no model training. Corrections ("that was an ad") write to `email_feedback` and `email_rules`. The classifier prompt includes recent corrections as examples.
- Gmail auth, done in M0: one Google Cloud project, app status "In production" so refresh tokens do not expire after about 7 days in Testing mode. Google's Branding page needed a homepage and privacy policy on an authorized domain; a GitHub Pages site verified in Search Console worked (copy in `site/`). Both Gmail accounts use the same OAuth client. Re-check the connection about 8 days after setup (2026-10-28).
- Permissions: only the narrowest Gmail permission offered by n8n was granted ("read, compose and send"). Jarvis workflows must never send or delete mail.
- College account: connected in M0. If the college changes its policy later, fall back to forwarding what is needed to the personal account, or drop it.
- Privacy: free LLM tiers may use submitted data for improvement. Send only sender, subject and a short snippet. Never send full bodies.

### Reliability
- Alerts must not depend on one free service. Dual path: push (Bark, with a Google Calendar event as the backup when a push fails) plus iOS Reminders.
- Pinger keeps n8n awake so schedules fire. Supabase free projects can pause after inactivity, and regular scheduled queries should prevent it (verify).
- Webhook protected by a secret token. Secrets stay out of git, and out of exported workflows (the export script checks).

## 6. Repo layout

```
jarvis/
  README.md
  docs/            PLAN.md, M0-checklist.md, M1-checklist.md, api.md, decisions.md
  db/migrations/   001_init.sql, 002_migration_log_and_settings.sql, ...
  n8n/workflows/   exported workflow JSON (no credentials, no pinned data)
  scripts/         new-token.ps1, export_n8n.py
  frontend/        index.html, app.js, sw.js, manifest.webmanifest, icons
  shortcuts/       setup notes and shortcut links
  site/            the OAuth homepage and privacy pages (published from a separate GitHub Pages repo)
  infra/           render.yaml, .env.example
  .gitignore       .env, credential exports
```

## 7. Build steps

Each milestone ends with a commit and a working demo.

- [x] **M0: Feasibility spikes (go / no-go).** Done 2026-10-20, result: go. Details in [M0-checklist.md](M0-checklist.md).
- [x] **M1: Repo and foundations.**
  - Webhook contract and token handling: [api.md](api.md), `scripts/new-token.ps1`.
  - Migration log and settings table: `db/migrations/002_migration_log_and_settings.sql`.
  - n8n export routine with a secret scan: `scripts/export_n8n.py`.
  - Decisions and M0 results written down; copy of the OAuth pages in `site/`.
  - Done when: all of this is committed, migration 002 is applied, and the M0 test workflows are exported. See [M1-checklist.md](M1-checklist.md).
- [x] **M2: Chat brain (built, see docs/M2-checklist.md).** Webhook, LLM intent router returning structured JSON, handlers for tasks, reminders, dates, weather, spaces.
- [x] **M3: Reminder engine (built, see docs/M3-checklist.md).** A dispatcher checks every minute (starting up to a minute early so alerts land on time) and pushes due reminders and date alerts (through ntfy at first, Bark from M3.1). Dates alert at 9 AM a week before, a day before and on the day. If a push fails, a Google Calendar event replaces it. Mark M3 as fully done after the checklist's real-service tests pass.
- [x] **M3.1: Push through Bark (built, see docs/M3.1-checklist.md).** Bark replaces ntfy; everything else in M3 is unchanged. Mark M3 and M3.1 done after the checklist's real-service tests pass.
- [x] **M4: Frontend PWA (built, see docs/M4-checklist.md).** Chat plus Today, Tasks, Reminders and Dates tabs, space filter, mark done or cancel, offline copy, manifest and Home Screen install, hosted on GitHub Pages. Backend addition: `03-items-api.json` (`jarvis-items`) and CORS on the webhooks. Mark fully done after the checklist's real-device tests pass.
- [x] **M5: Voice and Siri (built, see docs/M5-checklist.md).** Mic in the app, speech to text on Groq Whisper (free), voice mode page, natural spoken replies (Groq Orpheus, phone voice fallback), orb reacts to the voice level. Siri shortcuts: "Jarvis" (hands-free, no app), "Jarvis reminders", and "Wake up Jarvis" (opens the app, listening). Mark fully done after the real-device tests pass.
- [x] **M6: iOS Reminders sync (built, see docs/M6-checklist.md).** `jarvis-sync` endpoint, "Jarvis Sync" shortcut (both directions, runs on time-of-day automations), "Jarvis done" voice shortcut. Mark fully done after the real-device test.
- [x] **M7: Habits and ideas (built, see docs/M7-checklist.md).** Habits with streaks, a month calendar of done days and past-day fixes; ideas as plain multi-line text, editable in the app; chat and Siri "Jarvis idea". Study tab (exam calendar with 7 PM-before and 2-hours-before alerts, college work list, important links, Siri "Jarvis study"); no separate study-hours tracker; weekly target on habits instead, the Sunday summary was dropped, M9 gets a college work summary instead. Mark fully done after the real-device test.
- [x] **M8: Email intelligence (built, see docs/M8-checklist.md).** Both Gmail accounts every 15 minutes and on Refresh; rules, Gmail Promotions and the model sort mail into Important, Normal and Ads; Email tab with per-account lists and correction buttons; chat "any important emails" and corrections; digest only, no email pushes. Mark fully done after the real Gmail check.
- [x] **M9: Morning briefing and calendar (built, see docs/M9-checklist.md; mark fully done after the real-device test).** Daily push combining schedule, tasks, dates, habits, weather, email digest. Also: a college work summary (all open tasks from the Study tab, in the brief and on request; replaces the Sunday summary, which is dropped), and yesterday's cleanup. The brief lists reminders from yesterday that were never marked done and asks whether to close them all; the Reminders tab already shows them under "Waiting to fire" so they can be checked first, then "close them" or "keep X" by chat. Needs a bulk-close action in `jarvis-items`.
- [x] **M10: Dropped.** Web lookup, page watching and news digests are not needed (a normal LLM or search covers them).
- [x] **M11: Hardening (built, see docs/M11-checklist.md and docs/RECOVERY.md; mark fully done after a real restore test).** Nightly JSON backup committed to a private GitHub repository, `export_all`/`import_all` SQL functions, Bark alerts for crashed workflows and a 6-hourly health check, recovery guide. LLM fallback was checked and already exists everywhere a model is used.
- [x] **M12: Several commands in one message (built, see docs/M12-checklist.md).** "Remind me at 6 to call mom and mark the lab report done" runs both, in order, up to 5, with one combined reply. Chat, voice and Siri all use it.

## 7b. Status (22 Oct 2026)

All planned milestones are built (M10 was dropped). What remains is not building but confirming on real devices and keeping things alive:
- Real-device checks still open: Siri "Jarvis brief" and the wake-alarm automation (M9), the morning Bark push at 7:00, a restore test of a backup on a spare Supabase project (M11), an alert push on the phone (M11).
- Around 28 Oct: confirm the Gmail and Calendar sign-ins survived (health alerts will also say so).
- Renew the GitHub backup token when it expires.
- Ideas not planned: creating Google Calendar events from chat, more brief sections, per-space habits. Add them as M12+ only if wanted.

## 8. Open questions

1. ~~Backup alert channel~~ Decided in M3: a Google Calendar event, created only when a push fails (no Telegram).
2. Which spaces beyond personal and college?
3. ~~Briefing time~~ Decided in M9: 7:00 AM, changeable by chat (`settings.brief_time`).
4. Which habits and study subjects to start with?
5. Does "Wake up Jarvis" open the Home Screen app or Safari? (Test at the start of M5.)
