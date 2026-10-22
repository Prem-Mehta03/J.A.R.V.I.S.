# Recovery: getting Jarvis back after something is lost

## Where everything lives
| Thing | Lives in | Backed up by |
|---|---|---|
| Your data | Supabase Postgres, schema `jarvis` | Nightly file in your private GitHub backup repository (`backups/jarvis-DATE.json`) |
| Workflows | n8n on Render, and `n8n/workflows/*.json` in git | git (rebuild with `python scripts/build_workflows.py`) |
| Credentials | n8n's own store | Not backed up. Re-enter. `N8N_ENCRYPTION_KEY` (in Render) is needed to read an n8n database; keep a copy |
| App | GitHub Pages (`frontend/`) | git |
| Secrets (Jarvis token, Bark key, API keys) | your password manager | you |

## A. Database lost or paused for good
1. New Supabase project (free). SQL editor: run `db/migrations/001` to `010` in order.
2. In the GitHub backup repository open the newest file under `backups/`, click **Raw** and copy everything (or download it and open it in a text editor).
3. In the SQL editor run (paste the JSON between the two `$backup$` marks):
   ```sql
   select jarvis.import_all($backup$ PASTE HERE $backup$::jsonb);
   ```
   The answer lists how many rows went into each table. `not_restored` should be empty. Running it twice is safe.
4. Point n8n at the new database: in Render change the three `DB_POSTGRESDB_*` values (host, user, password) and update the **Supabase Postgres** credential in n8n.
5. Enter the Bark key again (it is not in the backup): tell Jarvis in the app settings or run `insert into jarvis.settings (key, value) values ('bark_key', '"YOUR_KEY"') on conflict (key) do update set value = excluded.value;`.
6. Stored email refills by itself within 15 minutes.

## B. n8n lost (Render service deleted)
1. Create the Render service from `infra/render.yaml`, fill the secret values (see `docs/M0-checklist.md`). Use a new `N8N_ENCRYPTION_KEY` if the old one is gone; credentials must then be entered again.
2. Add the credentials: Jarvis token, Gemini key, Groq key, Supabase Postgres, Google Calendar, Gmail personal, Gmail college, GitHub backup token.
3. Import `n8n/workflows/01` to `09` (deactivate old ones first), attach credentials, publish.
4. Set **Error workflow** to `09 Backup and alerts` on 01, 02, 03, 07, 08.
5. Render env settings that matter on the free 512 MB plan: `NODE_OPTIONS=--max-old-space-size=350`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=24`.
6. If the address changed, update it in the app (Settings), every Siri Shortcut, and the keep-alive pinger.

## C. GitHub token expired or leaked
Make a new fine-grained token (Contents: read and write, that repository only) and update the `GitHub backup token` credential. A leaked token only reaches the backup repository, but delete it on GitHub right away.

## D. Token leaked
Generate a new Jarvis token (`scripts/new-token.ps1`), update the **Jarvis token** credential, then the app and each Shortcut.

## E. Google sign-in expired
Health alerts say "Gmail (...) cannot be read". In n8n open the credential and press reconnect. Same for Google Calendar.
