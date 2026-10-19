# Jarvis: Personal Assistant Plan

Status: planning (drafted 2026-10-19). Everything below runs on free tiers, no card.

## 1. Goal

A personal assistant I can talk or type to from my iPhone. It keeps reminders, tasks, important dates, habits, study logs and ideas, summarizes my two Gmail accounts, answers simple questions, and can grow into web automation.

## 2. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Static PWA (HTML/JS), Cloudflare Pages or GitHub Pages | Chat + tabs. Add to Home Screen. |
| Automation / brain | n8n Community Edition on Render (free web service) | Webhooks, schedules, LLM routing. |
| Keep-alive | cron-job.org pings n8n every ~10 min | Render free sleeps after 15 min idle. |
| Database | Supabase free Postgres | Separate schema for Jarvis data. n8n's own tables live elsewhere. |
| LLM | Gemini free tier (primary), Groq free tier (fallback) | Retry on HTTP 429. |
| Speech to text | Whisper on Groq free tier | Browser records audio, n8n transcribes. |
| Text to speech | Browser `speechSynthesis` | No cost. |
| Push alerts | ntfy (free iOS app), called from n8n | Simpler than web push on iOS. |
| iPhone integration | Siri Shortcuts | Open app, speak reminders, sync with iOS Reminders. |
| Weather | Open-Meteo | No API key. |
| Email | Gmail via n8n, two accounts (personal, college) | See risks. |

Render free limits to design around: sleeps after 15 min without traffic, 750 free hours/month per workspace (one always-awake service fits), ephemeral filesystem (so all state goes to Supabase), may restart at any time.

## 3. Data model (Supabase, schema `jarvis`)

- `spaces`: personal, college, and more later (internships, projects).
- `items`: one table for reminders, tasks, dates, habits, ideas. Fields: id, type, title, body, space, tags[], status, due_at, remind_at, recurrence, ios_reminder_ref, created_at, updated_at.
- `habit_logs`: habit_id, date, done.
- `study_logs`: subject, minutes, date, space.
- `email_rules`: account, sender or domain, label (important / normal / promo), source (user or llm).
- `email_feedback`: message_id, account, sender, subject, llm_label, user_label, created_at.

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
- Exact-time alerts come from ntfy, so they do not depend on sync timing.
- To verify early: time-of-day automations running without a prompt, and whether the shortcut opens Safari or the installed app.

### Email
- Pipeline per account: fetch new mail on a schedule and on demand, apply sender/domain rules first, then the LLM for the rest, then a digest per account ("personal: ..., college: ...").
- Learning: no model training. Corrections ("that was an ad") write to `email_feedback` and `email_rules`. The classifier prompt includes recent corrections as examples.
- Gmail auth gotcha: Google OAuth apps in "Testing" status can have refresh tokens expire after about 7 days. Fix by setting the app to "In production" (unverified is fine for personal use), or use IMAP with app passwords.
- College account risk: if it is a managed Google account, the admin may block third-party OAuth or app passwords. Test this first. Fallback: auto-forward college mail to the personal account with a filter.
- Privacy: free LLM tiers may use submitted data for improvement. Send only sender, subject and a short snippet. Never send full bodies.

### Reliability
- Alerts must not depend on one free service. Dual path: ntfy push plus iOS Reminders.
- Pinger keeps n8n awake so schedules fire. Supabase free projects can pause after inactivity, and regular scheduled queries should prevent it (verify).
- Webhook protected by a secret token. Secrets stay out of git.

## 6. Repo layout

```
jarvis/
  README.md
  docs/            PLAN.md, architecture.md, ios-shortcuts.md
  db/migrations/   001_init.sql, ...
  n8n/workflows/   exported workflow JSON (no credentials)
  frontend/        index.html, app.js, sw.js, manifest.webmanifest, icons
  shortcuts/       setup notes and shortcut links
  infra/           render.yaml, .env.example
  .gitignore       .env, credential exports
```

## 7. Build steps

Each milestone ends with a commit and a working demo.

- [ ] **M0: Feasibility spikes (go / no-go).**
  - Deploy n8n on Render with Supabase and the pinger.
  - Connect both Gmail accounts (check college restrictions and token expiry).
  - Shortcut calls a webhook and creates an iOS Reminder.
  - ntfy push reaches the iPhone.
- [ ] **M1: Repo and foundations.** Repo structure, `.env.example`, SQL migrations, webhook auth token, n8n export routine.
- [ ] **M2: Chat brain.** Webhook, LLM intent router returning structured JSON, handlers for tasks, reminders, dates, weather, spaces.
- [ ] **M3: Reminder engine.** Scheduled check every few minutes, ntfy push, recurrence, advance alerts for dates.
- [ ] **M4: Frontend PWA.** Chat plus tabs (Today, Tasks, Reminders), manifest, Home Screen install, hosting.
- [ ] **M5: Voice and Siri.** Mic to Whisper, spoken replies, "Wake up Jarvis" shortcut, "Jarvis reminders" shortcut.
- [ ] **M6: iOS Reminders sync.** Two-way Shortcut sync and the voice "done" shortcut.
- [ ] **M7: Habits, study, ideas.** Tables, handlers, tabs, streaks, weekly summary.
- [ ] **M8: Email intelligence.** Per-account fetch, classification, digest, correction loop.
- [ ] **M9: Morning briefing and calendar.** Daily push combining schedule, tasks, dates, habits, weather, email digest.
- [ ] **M10: Web automation.** Page watching, digests, lookups.
- [ ] **M11: Hardening.** Scheduled database export backup, error alerts, LLM fallback, docs.

## 8. Open questions

1. Is the college account OAuth-friendly? (Settled by M0.)
2. Which spaces beyond personal and college?
3. Preferred morning briefing time?
4. Which habits and study subjects to start with?
