# M9: Morning briefing and calendar

## Install
1. Supabase SQL editor: run `db/migrations/009_brief.sql`.
2. n8n: import `n8n/workflows/08-brief.json`; set credentials Jarvis token, Supabase Postgres, Google Calendar. Re-import `01-chat-router.json` and `03-items-api.json` (re-attach credentials). Publish 08.
3. Make sure `home_location` is set (for weather), e.g. tell Jarvis your city in the app settings/chat as before.
4. Copy the whole `frontend/` folder to GitHub Pages (includes `briefview.js`, new `sw.js`). Reopen the app twice.

## Use
- Brief tab, or chat/voice "brief me". Push arrives at 7:00 AM; change with "send my brief at 8".
- "college work summary", "close them", "close them but keep hostel fees". Brief screen has "Close all N".

## Siri shortcut "Jarvis brief"
Get contents of URL: POST `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-brief`, header `X-Jarvis-Token`, long timeout; Get dictionary value `spoken`; Speak.
Optional: Shortcuts > Automation > Alarm > "Is stopped" (or Sleep focus turns off) > Run "Jarvis brief".

## Check
- [ ] Brief tab shows weather, today's calendar events, dates, college work, email, leftovers
- [ ] Push at the set time (test: "send my brief at HH:MM" a few minutes ahead, within 4 h window)
- [ ] n8n memory OK on Render with three always-on schedules (02, 07, 08)

## Not tested for real
iPhone Shortcuts automation, Bark on device, real Google Calendar read, Gemini on the new phrases, Render memory with 08 active. Google Calendar tokens (test mode) expire around 2026-10-28; reconnect then.
