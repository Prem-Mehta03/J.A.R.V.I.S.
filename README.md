# Jarvis

A personal assistant for my iPhone: reminders, tasks, important dates, habits, study logs, ideas, and a two-account Gmail digest. Talk or type to it. It runs on free tiers only (no card).

Status: **M0 done (go). M1 in progress.** See [docs/PLAN.md](docs/PLAN.md) for the plan, [docs/M0-checklist.md](docs/M0-checklist.md) for the M0 results, [docs/decisions.md](docs/decisions.md) for why things are the way they are, and [docs/M1-checklist.md](docs/M1-checklist.md) for what to do next.

## Stack

| Layer | Choice |
|---|---|
| Automation / brain | n8n 2.43.8 (self-hosted on Render free, kept awake by cron-job.org) |
| Database | Supabase free Postgres |
| LLM | Gemini free tier, Groq free tier as fallback |
| Push alerts | ntfy (backup channel to be decided, see docs/decisions.md) |
| iPhone | Siri Shortcuts + a small PWA |

## Layout

```
docs/            PLAN.md, M0-checklist.md, M1-checklist.md, api.md, decisions.md
db/migrations/   SQL, applied in order in the Supabase SQL editor
infra/           render.yaml (n8n on Render), .env.example
n8n/workflows/   exported workflow JSON (no credentials, no pinned data)
scripts/         new-token.ps1, export_n8n.py
frontend/        the PWA (from M4)
shortcuts/       Siri Shortcut notes
site/            copy of the two pages Google's OAuth screen links to
```

## Rules

- Secrets never go in git. `.env` is ignored. Credentials live in Render's environment settings and inside n8n credentials, never typed into a node's fields.
- The SQL in `db/migrations/` is the source of truth for the data model. Every migration adds a row to `jarvis.schema_migrations`.
- After changing a workflow in n8n, run `scripts/export_n8n.py` and commit the result. It refuses to write a workflow that contains something that looks like a secret.
- The n8n image version is pinned in `infra/render.yaml`. Upgrade on purpose, one version at a time, and read the deprecation warnings in the logs first.
