# M11: Hardening (backup, alerts, recovery)

Goal: if the free database or n8n is lost you can get everything back, and if something quietly stops working your phone tells you.

## What it does
- **Nightly backup at 3:15 AM** (India time): all your data (tasks, reminders, dates, habits and logs, ideas, links, email rules and corrections, settings) is saved as one JSON file, `backups/jarvis-YYYY-MM-DD.json`, in a **private GitHub repository** of yours. Every day is a commit, so the repository history is the backup history. Left out on purpose: stored email (rebuilt from Gmail) and the Bark key. **The backup refuses to run if the repository is public.**
- **Error alerts:** if any workflow crashes, Bark pushes "Jarvis needs attention" with which workflow and the error. The same problem is reported at most once per 6 hours.
- **Health check every 6 hours** (10 past 0, 6, 12, 18): pushes if a Gmail account cannot be read (for example the sign-in expired), email has not been checked for 4 hours, no backup succeeded for 36 hours, or a reminder was due 90 minutes ago and never fired.
- **LLM fallback:** checked, nothing to add. The chat router and email sorting already try Gemini then Groq; the brief and backup use no model; voice uses Groq with the phone voice as backup.

## Install
1. **GitHub:** create a new **private** repository (for example `jarvis-backup`). Then Settings (your profile) > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate new token: repository access **Only select repositories** = that one repository, permission **Contents: Read and write** (Metadata read is added automatically), expiry as long as allowed (it will need renewing when it ends). Copy the token.
2. **n8n credential:** Credentials > Create > **Header Auth**, name it exactly `GitHub backup token`, Name `Authorization`, Value `Bearer ` followed by the token (with the space).
3. **Supabase SQL editor:** run `db/migrations/010_backup.sql`, then tell it the repository (use your own user name):
   ```sql
   update jarvis.settings set value = '"YOUR-USER/jarvis-backup"' where key = 'backup_repo';
   ```
4. **n8n:** import `n8n/workflows/09-backup-alerts.json`. Set credentials: **GitHub backup token** (on "Check repo", "Existing file", "Save to GitHub"), **Supabase Postgres** (on the database nodes), **Jarvis token** (Webhook). Save and publish.
5. **Connect the error alerts** (one time per workflow): open each of `01 Chat Router`, `02 Reminder Dispatcher`, `03 Items API`, `07 Email`, `08 Brief`, click the three dots, **Settings**, set **Error workflow** to `09 Backup and alerts`, save. Without this step only the 6-hourly health check and backup-failure alerts work.
6. Re-import `07-email.json` (it now records which Gmail account failed, for the health check): deactivate the old one first and re-attach its credentials.
7. **Test the backup:** POST to `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-backup` with the header `X-Jarvis-Token`. The answer is `Backup saved to GitHub (N KB, N rows).` and the file shows up in the repository. A second run the same day replaces that day's file.
8. **Test an alert:** change the repository setting to a wrong name and run the backup call again: you get a push "Backup failed..." and the same alert stays silent for 6 hours. Put the right name back.

## Check
- [ ] The file appears in the repository under `backups/`
- [ ] Failure push arrives on the phone
- [ ] Error workflow set on at least 01, 02, 03, 07, 08
- [ ] Try the restore on a spare Supabase project once (see docs/RECOVERY.md); a backup you never restored is not yet a backup
- [ ] Note the token's expiry date; when it ends the backup fails and you get the push

## Honest limits
- If n8n itself is down or asleep, nothing here can alert you; the keep-alive pinger is the guard for that.
- Your tasks, ideas and email rules sit in a private GitHub repository in plain JSON. Do not make it public (the backup refuses to run if you do, but it cannot stop you).
- Not tested for real: GitHub accepting the file (tested against a fake GitHub that follows the documented contents API), Bark delivering alerts on the device, and the error-workflow link inside n8n (tested with the same data n8n sends, not a real crash).
