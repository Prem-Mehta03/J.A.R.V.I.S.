# Jarvis: Personal Assistant Plan

Status: M0, M1 and M2 complete; M3 (reminder engine) built, in testing on the real services. Everything below runs on free tiers, no card. M0 results are in [M0-checklist.md](M0-checklist.md); the reasoning behind the choices is in [decisions.md](decisions.md).

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
| Push alerts | ntfy (free iOS app), called from n8n | Works, but ntfy.sh answered "too many requests" to n8n on Render until its daily reset. Backup (decided in M3): when a push fails, Jarvis creates a Google Calendar event that rings the phone instead, so there is still one alert. |
| iPhone integration | Siri Shortcuts | Open app, speak reminders, sync with iOS Reminders. |
| Weather | Open-Meteo | No API key. |
| Email | Gmail via n8n, two accounts (personal, college) | Both connected in M0 through one Google Cloud app. See section 5. |

Render free limits to design around: sleeps after 15 min without traffic, 750 free hours/month per workspace (one always-awake service fits), ephemeral filesystem (so all state goes to Supabase), may restart at any time.

## 3. Data model (Supabase, schema `jarvis`)

- `spaces`: personal, college, and more later (internships, projects).
- `items`: one table for reminders, tasks, dates, habits, ideas. Fields: id, type, title, body, space, tags[], status, due_at, remind_at, recurrence, advance_days[], last_notified_at, next_attempt_at, ios_reminder_ref, created_at, updated_at. `alert_log` records which advance alerts of a date were sent; `settings` holds small values such as `home_location` and `ntfy_topic`.
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
- Alerts must not depend on one free service. Dual path: push (ntfy, with a Google Calendar event as the backup when a push fails) plus iOS Reminders.
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
- [ ] **M1: Repo and foundations.**
  - Webhook contract and token handling: [api.md](api.md), `scripts/new-token.ps1`.
  - Migration log and settings table: `db/migrations/002_migration_log_and_settings.sql`.
  - n8n export routine with a secret scan: `scripts/export_n8n.py`.
  - Decisions and M0 results written down; copy of the OAuth pages in `site/`.
  - Done when: all of this is committed, migration 002 is applied, and the M0 test workflows are exported. See [M1-checklist.md](M1-checklist.md).
- [x] **M2: Chat brain (built, see docs/M2-checklist.md).** Webhook, LLM intent router returning structured JSON, handlers for tasks, reminders, dates, weather, spaces.
- [x] **M3: Reminder engine (built, see docs/M3-checklist.md).** A dispatcher checks every minute (starting up to a minute early so alerts land on time) and pushes due reminders and date alerts through ntfy. Dates alert at 9 AM a week before, a day before and on the day. If a push fails, a Google Calendar event replaces it. Mark M3 as fully done after the checklist's real-service tests pass.
- [ ] **M4: Frontend PWA.** Chat plus tabs (Today, Tasks, Reminders), manifest, Home Screen install, hosting.
- [ ] **M5: Voice and Siri.** Mic to Whisper, spoken replies, "Wake up Jarvis" shortcut, "Jarvis reminders" shortcut.
- [ ] **M6: iOS Reminders sync.** Two-way Shortcut sync and the voice "done" shortcut.
- [ ] **M7: Habits, study, ideas.** Tables, handlers, tabs, streaks, weekly summary.
- [ ] **M8: Email intelligence.** Per-account fetch, classification, digest, correction loop.
- [ ] **M9: Morning briefing and calendar.** Daily push combining schedule, tasks, dates, habits, weather, email digest.
- [ ] **M10: Web automation.** Page watching, digests, lookups.
- [ ] **M11: Hardening.** Scheduled database export backup, error alerts, LLM fallback, docs.

## 8. Open questions

1. ~~Backup alert channel~~ Decided in M3: a Google Calendar event, created only when an ntfy push fails (no Telegram).
2. Which spaces beyond personal and college?
3. Preferred morning briefing time? (Stored in `settings` once decided.)
4. Which habits and study subjects to start with?
5. Does "Wake up Jarvis" open the Home Screen app or Safari? (Test at the start of M5.)
