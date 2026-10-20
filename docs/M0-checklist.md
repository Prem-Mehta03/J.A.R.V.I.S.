# M0: Feasibility checklist

Goal: prove the risky pieces work before building anything. Do the steps in order. Each ends with a pass/fail check. Menu names in these services change, so follow the intent, not the exact wording.

## 1. Accounts

- [x] GitHub (for the repo)
- [x] Supabase
- [x] Render (sign up with GitHub; no card needed for a free web service)
- [x] cron-job.org
- [x] ntfy app from the App Store (free)
- [x] Google AI Studio (Gemini key) and console.groq.com (Groq key)

## 2. Database (Supabase)

1. Create a project. Save the database password somewhere safe.
2. Open the SQL editor and run `db/migrations/001_init.sql`.
3. Find the **Session pooler** connection details (host, port 5432, user like `postgres.<project-ref>`). Use these rather than the direct connection, which may be IPv6-only and fail from Render.

Pass: the tables appear under the `jarvis` schema, and the `spaces` table has two rows.

## 3. n8n on Render, plus the pinger

1. Push this repo to GitHub.
2. In Render: New, then Blueprint, pick the repo, and point it at `infra/render.yaml`.
3. Fill in the secret values it asks for (`N8N_HOST`, `N8N_WEBHOOK_URL`, and the four `DB_POSTGRESDB_*` values). `N8N_ENCRYPTION_KEY` is generated for you. Copy it somewhere safe, because losing it makes stored credentials unreadable.
4. First start takes a few minutes. Open the service URL and create the n8n owner account.
5. In cron-job.org, add a job that sends a GET to `https://<your-service>.onrender.com/healthz` every 10 minutes.

Pass: n8n loads, then still responds instantly after 30+ minutes with no one using it, and the Supabase `n8n` schema now has tables.

## 4. Webhook test

1. In n8n, create a workflow: **Webhook** node (POST, path `jarvis-ping`, header authentication with a long random token), then **Respond to Webhook** returning `{"reply": "pong"}`.
2. Activate it and call the production URL with `curl`, with and without the token.

Pass: returns pong with the token and is rejected without it.

## 5. Siri Shortcut round trip

1. Build a shortcut: **Get Contents of URL** (POST, JSON body, token in a header), read the `reply` value, **Add New Reminder** to a new list named "Jarvis", and **Speak Text**.
2. Run it by tapping and by voice ("Hey Siri, <shortcut name>").
3. Create a second shortcut with an **Open URL** action pointing at any web page, and add that page to the Home Screen first. Note whether it opens the Home Screen app or Safari.

Pass: the reminder appears in the Jarvis list and the reply is spoken.

## 6. Background automation

1. In Shortcuts, create a Time of Day automation that runs the shortcut from step 5 a few minutes from now, with **Run Immediately** (no confirmation prompt).
2. Lock the phone and wait.

Pass: it runs without you touching the phone. If it only shows a prompt, note it; M6 sync will then depend on manual runs.

## 7. Push alerts (ntfy)

1. In the ntfy app, subscribe to a long random topic name. Treat the name like a password.
2. In n8n, add an **HTTP Request** node that POSTs a message to `https://ntfy.sh/<topic>`.
3. Run it with the app closed and the phone locked.

Pass: the notification arrives within a few seconds.

## 8. Gmail, personal account

1. In Google Cloud Console, create a project, enable the Gmail API, and configure the OAuth consent screen (External).
2. Set the publishing status to **In production**. In Testing, refresh tokens can expire after about 7 days, and the connection would break weekly. An unverified app is fine for your own use, and you will see a warning screen once.
3. Create an OAuth client (Web application) using the redirect URL that n8n shows in its Gmail credential, then connect it in n8n.
4. In a workflow, use a Gmail node to fetch the last 5 messages (sender, subject, snippet only).

Pass: the 5 messages come back. Re-check after 8 days to confirm the connection survived.

Fallback if OAuth is a hassle: IMAP with an app password (needs 2-step verification enabled).

## 9. Gmail, college account

Repeat step 8 with the college account. Record exactly what happens.

If the college admin blocks third-party apps or app passwords, that is their policy. Do not work around it. Options: check the college's IT rules on forwarding and use a filter to forward only what you need to your personal account, or leave college mail out of Jarvis.

Pass: either the messages come back, or you have a clear answer on what is blocked.

## 10. LLM keys

1. Add Gemini and Groq credentials in n8n.
2. Send the same small prompt to each: classify "50% off sale, ends tonight" as important, normal, or promo, and return JSON only.

Pass: both return valid JSON. Note the response time of each.

## Results and go / no-go

| Check | Result | Notes |
|---|---|---|
| Supabase schema created | | |
| n8n stays awake with the pinger | | |
| Webhook auth works | | |
| Shortcut creates a Reminder and speaks | | |
| Time-of-day automation runs locked | | |
| Open URL opens app or Safari | | |
| ntfy push on locked phone | | |
| Personal Gmail connected | | |
| College Gmail connected | | |
| Gemini and Groq both return JSON | | |

Decisions:
- Pinger fails or n8n sleeps anyway: consider running n8n on the laptop with a tunnel, or Oracle's free VM.
- Automations need a prompt every time: iOS Reminders sync becomes manual, and ntfy is the primary alert.
- College Gmail blocked: drop it from v3, or use the forwarding option if the college allows it.
- Everything passes: move to M1 and M2.