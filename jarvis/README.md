# Jarvis

A personal assistant for my iPhone: reminders, tasks, important dates, habits, study logs, ideas, and a two-account Gmail digest. Talk or type to it. It runs on free tiers only (no card).

Status: **M0, M1 and M2 done. M3 (reminder engine) built, being tested on the real services.** See [docs/PLAN.md](docs/PLAN.md) for the plan, [docs/decisions.md](docs/decisions.md) for why things are the way they are, and [docs/M3-checklist.md](docs/M3-checklist.md) for what to do next. Earlier results: [M0](docs/M0-checklist.md), [M1](docs/M1-checklist.md), [M2](docs/M2-checklist.md).

## Stack

| Layer | Choice |
|---|---|
| Automation / brain | n8n 2.43.8 (self-hosted on Render free, kept awake by cron-job.org): chat router and reminder dispatcher |
| Database | Supabase free Postgres |
| LLM | Gemini free tier, Groq free tier as fallback |
| Push alerts | ntfy, with a Google Calendar event as the backup when a push fails |
| iPhone | Siri Shortcuts + a small PWA |

## Layout

```
docs/            PLAN.md, M0 to M3 checklists, api.md, decisions.md
db/migrations/   SQL, applied in order in the Supabase SQL editor
infra/           render.yaml (n8n on Render), .env.example
n8n/workflows/   workflow JSON (01 chat router, 02 reminder dispatcher; no credentials, no pinned data)
n8n/src/         the JavaScript inside each Code node, as plain files
n8n/tests/       unit tests: node --test n8n/tests/router.test.mjs n8n/tests/m3.test.mjs
scripts/         new-token.ps1, export_n8n.py, build_workflows.py
frontend/        the PWA (from M4)
shortcuts/       Siri Shortcut notes
site/            copy of the two pages Google's OAuth screen links to
```

## Rules

- Secrets never go in git. `.env` is ignored. Credentials live in Render's environment settings and inside n8n credentials, never typed into a node's fields.
- The SQL in `db/migrations/` is the source of truth for the data model. Every migration adds a row to `jarvis.schema_migrations`.
- The workflow JSON for 01 and 02 is generated: edit `n8n/src/` and run `python scripts/build_workflows.py`, then run the tests. Do not edit the JSON by hand.
- After changing a workflow in n8n, run `scripts/export_n8n.py` and commit the result. It refuses to write a workflow that contains something that looks like a secret.
- The n8n image version is pinned in `infra/render.yaml`. Upgrade on purpose, one version at a time, and read the deprecation warnings in the logs first.
