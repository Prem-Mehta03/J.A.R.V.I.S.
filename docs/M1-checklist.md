# M1: what to do

M1 is mostly files, but four things need you. About 20 minutes.

## 1. Add the update to your local repo

In PowerShell, from your local clone (the folder that contains `.git`):

```powershell
cd C:\path\to\your\jarvis
Expand-Archive -Path "$HOME\Downloads\jarvis-m1-update.zip" -DestinationPath . -Force
git status
git diff --stat
```

The zip holds only the files that changed or are new, so it will not touch your git history. If you edited `README.md` yourself, run `git diff README.md` and keep what you want.

Then commit and push:

```powershell
git add -A
git commit -m "M1: foundations (API contract, migration log, export script, M0 results)"
git push
```

Pass: `git status` is clean after the push and nothing under `.env` or credentials appears in it.

## 2. Run migration 002

In the Supabase SQL editor, run `db/migrations/002_migration_log_and_settings.sql`, then:

```sql
select * from jarvis.schema_migrations;
select * from jarvis.settings;
```

Pass: two rows in `schema_migrations` (001 and 002) and two in `settings` (timezone, morning_briefing_time).

## 3. Rename the webhook credential (optional) and keep the token

Your M0 token still works. If you like, rename the Header Auth credential in n8n to **Jarvis token** so it matches `docs/api.md`. Only generate a new token if the old one has leaked: `.\scripts\new-token.ps1 | Set-Clipboard`, then update n8n and each Shortcut.

## 4. Export your M0 workflows

1. In n8n, create an API key under Settings, n8n API. (Menu names change; look for "API".)
2. Before exporting the ntfy test workflow, replace the hard-coded `Authorization: Bearer tk_...` header with a Header Auth credential. The topic in the URL is also secret-like; see the note in `scripts/README.md`.
3. In the same PowerShell window:

```powershell
$env:N8N_URL = "https://<your-service>.onrender.com"
$env:N8N_API_KEY = "<the key>"
python scripts\export_n8n.py --dry-run
python scripts\export_n8n.py
```

4. Open the files in `n8n/workflows/` and check for anything private before committing.

Pass: the Ping, Gemini/Groq and Gmail test workflows are in `n8n/workflows/`, the script reported no skipped workflows (or you skipped the ntfy one on purpose), and the files contain no tokens, topic names or email text.

When all four pass, tell me and we start M2, the chat router.
