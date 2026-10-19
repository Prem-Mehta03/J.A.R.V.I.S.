# Jarvis

A personal assistant for my iPhone: reminders, tasks, important dates, habits, study logs, ideas, and a two-account Gmail digest. Talk or type to it. It runs on free tiers only (no card).

Status: **M0, feasibility spikes.** See [docs/PLAN.md](docs/PLAN.md) for the full plan and [docs/M0-checklist.md](docs/M0-checklist.md) for what to do next.

## Stack

| Layer | Choice |
|---|---|
| Automation / brain | n8n (self-hosted on Render free) |
| Database | Supabase free Postgres |
| LLM | Gemini free tier, Groq free tier as fallback |
| Push alerts | ntfy |
| iPhone | Siri Shortcuts + a small PWA |

## Layout

```
docs/            PLAN.md, M0-checklist.md
db/migrations/   SQL, applied in order in the Supabase SQL editor
infra/           render.yaml (n8n on Render), .env.example
n8n/workflows/   exported workflow JSON (credentials are never exported)
frontend/        the PWA (from M4)
shortcuts/       Siri Shortcut notes
```

## Rules

- Secrets never go in git. `.env` is ignored. Credentials live in Render's environment settings and inside n8n.
- The SQL in `db/migrations/` is the source of truth for the data model.
- After changing a workflow in n8n, export it to `n8n/workflows/` and commit.
- Pin the n8n image version in `infra/render.yaml` once M0 works.
