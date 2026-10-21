# M6: iOS Reminders sync and the "done" shortcut

Goal: your Jarvis reminders and tasks also appear in the iPhone Reminders app (in a list called **Jarvis**), ticking one off there marks it done in Jarvis, and "Hey Siri, Jarvis done" closes things by voice.

How it works: n8n cannot write to iOS Reminders, so a Shortcut on the phone does it. Each run it tells Jarvis which reminders it can see in the list; Jarvis answers with what to add and what to close. Each iPhone reminder carries `jarvis:<id>` in its Notes, which is how the two sides recognise each other. Push alerts (Bark) still fire on time whether or not a sync has run.

What syncs: open reminders and tasks that do not repeat. Repeating reminders and important dates stay in Jarvis only (they still alert as before), because ticking off one repeat on the phone would otherwise close the whole series.

## 1. Update the repo

Extract the zip over the repo, then commit (commands came with the zip).

## 2. n8n (2 minutes)

1. Import `n8n/workflows/06-sync.json`.
2. **Webhook**: credential **Jarvis token**. **Run SQL**: credential **Supabase Postgres**. Save, then **Active**.
3. No database change is needed.

Quick check (PowerShell, use your token):

```powershell
$h = @{ "X-Jarvis-Token" = "<your token>" }
Invoke-RestMethod -Method Post -Uri https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-sync -Headers $h -ContentType "application/json" -Body '{"done":[],"known":[]}'
```

Expected: `ok: True` and your open reminders under `add`, with `reply` like "Synced. 3 new."

## 3. Shortcut: "Jarvis Sync"

In the Reminders app, make a list named **Jarvis** if you do not have one (you made it in M0).

1. New Shortcut, name it **Jarvis Sync**.
2. **Find Reminders** where **List** is **Jarvis** and **Is Completed** is **Yes**. (Tap Add Filter for each condition. Optionally add **Completion Date** is in the last **7 days** to keep it short.)
3. **Get Details of Reminders**: Get **Notes**. Then **Combine Text** with **New Lines**. Then **Set Variable** `Done`.
4. **Find Reminders** where **List** is **Jarvis** and **Is Completed** is **No**. Then **Get Details of Reminders**: **Notes**, **Combine Text** with **New Lines**, **Set Variable** `Known`.
5. **Get Contents of URL**:
   - URL: `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-sync`
   - Method **POST**, header `X-Jarvis-Token` = your token
   - Request Body **JSON**: `done` (Text) = variable **Done**, `known` (Text) = variable **Known**
6. **Get Dictionary from Input** (input: **Contents of URL**), then **Set Variable** `Result`.
7. **Get Dictionary Value** `add` from **Result**, then **Repeat with Each**. Inside the loop:
   - **Get Dictionary Value** `title` from **Repeat Item**, again for `note` and `due`
   - **Get Dates from Input** with the `due` value
   - **Add New Reminder**: Title = `title`, List = **Jarvis**, Notes = `note`, Due Date = the date. End Repeat.
8. **Get Dictionary Value** `add_plain` from **Result**, **Repeat with Each**: **Add New Reminder** with Title and Notes only (no date).
9. Optional, closing things on the phone that you finished in the app or by chat: **Get Dictionary Value** `close_ids` from **Result**, **Repeat with Each**: **Find Reminders** where **List** is **Jarvis** and **Notes** contains the Repeat Item, then an action that marks them completed. Search the action list for "reminder": newer iOS has an edit or mark-complete action for Reminders. If your iPhone has none, leave this step out. Nothing breaks: the old copy simply stays in the list until you tick it.
10. **Get Dictionary Value** `reply` from **Result**, then **Show Notification** (not Speak, so it is quiet when automated).

Run it once by hand with the Shortcuts play button. Your open reminders should appear in the Jarvis list. Run it again: nothing new should be added.

## 4. Run it by itself

Shortcuts, Automation, New Automation, **Time of Day**, for example 8:00 AM, 1:00 PM and 8:00 PM (one automation each), **Run Immediately**, action **Run Shortcut** Jarvis Sync. M0 showed time-of-day automations run on a locked phone. Also say "Hey Siri, Jarvis Sync" any time you want it now.

Ticking a reminder off on the phone reaches Jarvis at the next sync (iOS has no "reminder completed" trigger), so the Reminders tab in the app can lag by a few hours. For instant closing use the voice shortcut below.

## 5. Shortcut: "Jarvis done"

1. New Shortcut, name it **Jarvis done**.
2. **Dictate Text** (Stop Listening: After Pause, English).
3. **Text**: `I finished ` followed by the **Dictated Text** variable.
4. **Get Contents of URL**: URL `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis`, POST, header `X-Jarvis-Token`, JSON body `text` = the Text from step 3, `source` = `shortcut`.
5. **Get Dictionary from Input** (input: **Contents of URL**), **Get Dictionary Value** `reply`, **Speak Text**.
6. Try: "Hey Siri, Jarvis done", then say "call home reminder". If several match, Jarvis asks which one; say it again with more of the name.

## Things to know

- **Possible double alert.** A reminder with a due time can also ring from the Reminders app itself, on top of the Bark push. If you get two alerts, open the Shortcut and, in the Add New Reminder with a date, leave out the due date (use `add_plain` style), or turn the alert off for that reminder in Reminders. Tell me which you prefer once you have seen it.
- If you delete an open reminder in the iPhone list, the next sync adds it back (it is still open in Jarvis). Tick it off or cancel it in Jarvis instead.
- Do not edit the Notes of the synced reminders; they carry the link. Notes you type yourself on other reminders are ignored.
- A sync handles up to 200 completed and 200 open reminders. Keep the "last 7 days" filter on the completed list.

## Not tested by me

The server side: a real database run with new, done, closed-in-the-app, repeating and unknown ids, plus bad input and a wrong token. **Not tested:** all of the Shortcuts, because I cannot run Shortcuts from here. In particular the exact action names on your iOS version (especially marking a reminder complete), whether a date from `due` goes into Add New Reminder cleanly, and the double-alert question.

## Done when

- Your open reminders and tasks appear in the Jarvis list, and a second run adds nothing.
- Ticking one off on the phone, then running Jarvis Sync, makes it disappear from the app's lists.
- "Hey Siri, Jarvis done" closes an item by voice.
