# M4: The app (PWA)

Goal: an app on your Home Screen with Today, Ask (chat), Tasks, Reminders and Dates. Tap an item to mark it done or cancel it.

## 1. Update the repo

Extract the zip over the repo, then commit (commands came with the zip).

## 2. n8n (about 3 minutes)

1. **Import** `n8n/workflows/03-items-api.json`. Open **Webhook**: credential **Jarvis token**. Open **Run SQL**: your Supabase Postgres credential. Save, then **Active**.
2. **Router CORS.** Re-import `01-chat-router.json` (delete the old one first, pick the same credentials again, Active) **or** open the existing router's **Webhook** node, Options, Add option, **Allowed Origins (CORS)** = `*`. Make sure only one router is active.

Quick check (PowerShell):

```powershell
$h = @{ "X-Jarvis-Token" = "<your token>"; "Content-Type" = "application/json" }
Invoke-RestMethod -Method Post -Uri "https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-items" -Headers $h -Body '{"action":"list"}'
```

You should see `ok: True` and your items.

## 3. Host the app

1. In your `<username>.github.io` repo, create a folder `jarvis` and copy the contents of `frontend/` into it (keep the `icons` folder). Commit and push.
2. After a minute it is live at `https://<username>.github.io/jarvis/`.

## 4. Install on iPhone

1. Open that address in **Safari**, Share, **Add to Home Screen**.
2. Open Jarvis **from the Home Screen** (not Safari) and enter the server address (`jarvis-n8n-rd61.onrender.com`) and your token. Do it here, because the installed app does not share Safari's saved data.
3. Today should show your items. First load after idle can take up to a minute while Render wakes.

## 5. Test

- Ask tab: "remind me in 10 minutes to stretch". Then Reminders tab shows it.
- Tap an item, **Mark done**: it disappears and stays gone after reopening.
- Turn on airplane mode, reopen: last list shows with a "Showing the list from ..." note.
- Wrong token: you get "The token was not accepted."
- Dark mode follows the phone setting.

## Not tested by me

Everything ran in desktop Chromium at iPhone size against a local n8n with mock AI services and a real Postgres. Not tried on a real iPhone: Home Screen install, status bar look, keyboard behavior, and GitHub Pages hosting. Also the real Render CORS (same setting, but check Ask works from the hosted page).

## Done when

- [ ] Today, Tasks, Reminders, Dates show real data
- [ ] Ask works from the installed app
- [ ] Mark done works
- [ ] Opens with the old list when offline
