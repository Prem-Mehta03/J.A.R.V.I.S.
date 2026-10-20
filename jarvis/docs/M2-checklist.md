# M2: Chat brain

Goal: `POST /webhook/jarvis` with `{"text": "..."}` creates reminders, tasks and dates, lists and closes them, answers weather, and creates spaces. Spoken-style reply every time.

Nothing here sends alerts yet. Reminders are stored, and M3 makes them fire.

## 1. Database (Supabase SQL editor)

1. Run `db/migrations/003_home_location.sql`.
2. Set your home location (change the name and numbers):

```sql
update jarvis.settings
set value = '{"name": "Goa", "lat": 15.39, "lon": 73.88}'::jsonb
where key = 'home_location';
```

## 2. Import the workflow

1. n8n, Workflows, Import from file: `n8n/workflows/01-chat-router.json`.
2. Open each node that shows a red credential warning and pick:
   - **Webhook**: Jarvis token
   - **Gemini**: Gemini key (the Header Auth credential from M0, name `x-goog-api-key`)
   - **Groq**: Groq key
   - **Load context** and **Run SQL**: a Postgres credential for Supabase (same host, user, password as n8n's database; database `postgres`; port 5432; turn **SSL** on and allow unauthorized certificates if the connection test complains).
3. Save, then switch the workflow to **Active**.

## 3. Test (PowerShell)

```powershell
$h = @{ "X-Jarvis-Token" = "<your token>"; "Content-Type" = "application/json" }
function Ask($t) { Invoke-RestMethod -Method Post -Uri "https://jarvis-n8n-rd61.onrender.com/webhook/jarvis" -Headers $h -Body (@{ text = $t; source = "app" } | ConvertTo-Json) }

Ask "remind me tomorrow at 6 pm to call home"
Ask "add a task to finish the physics lab report by Friday"
Ask "my mom's birthday is on March 3rd"
Ask "what is on my list today"
Ask "what are my tasks"
Ask "done with the physics lab report"
Ask "cancel the call home reminder"
Ask "create a space called Hackathon"
Ask "what's the weather"
Ask "weather in Mumbai tomorrow"
Ask "remind me to do something"       # should ask for a time
```

Check in Supabase: `select type, title, space, status, due_at, remind_at from jarvis.items order by created_at desc;`

## 4. Things to watch

- **Gemini 400 error.** The request sets `thinkingConfig.thinkingLevel`. If Gemini rejects it, the router silently falls back to Groq, so replies still work but you would see Gemini failing in the executions list. Fix: open the **Build request** node and delete the `thinkingConfig` line.
- **Fallback test.** Temporarily rename the Gemini credential's header value to something wrong, ask something, and confirm the reply still comes back (from Groq). The response has a `provider` field. Put the key back.
- **Wrong token** returns 403 from n8n before anything runs.
- **First call after idle** can take about a minute while Render wakes.
- Free LLM limits: if both providers return 429 the reply is "I can't think right now" and nothing is written.

## 5. Not tested by me

I tested the logic with 25 unit tests and ran the workflow on a local n8n against a mock LLM, mock weather and a real Postgres. I have not called the real Gemini, Groq or Open-Meteo, so section 4 is the first real check of the exact request fields.

## Done when

- [ ] Every phrase in section 3 gets a sensible reply
- [ ] Rows appear in `jarvis.items` with the right type, time and space
- [ ] Groq fallback works
- [ ] `docs/M2-checklist.md` results noted below

Results / notes:
