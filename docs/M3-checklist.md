# M3: Reminder engine

Goal: reminders and important dates actually alert you, once.

- A new workflow, **02 Reminder Dispatcher**, runs every minute and sends push alerts through ntfy. It starts up to a minute early on purpose, so the push lands on time instead of a minute late.
- Date alerts go out at 9 AM: a week before, a day before and on the day (or whatever you asked for).
- Repeating reminders move on to their next time after they fire.
- **Backup:** if the ntfy push fails, Jarvis creates a Google Calendar event that rings your phone about two minutes later. In normal use you get one ntfy alert and no Calendar event.

The chat router (workflow 01) is unchanged since M2, so you do not touch it.

## Already done on your side (skip these)

- M0 to M2 complete; the chat router is active and working.
- Google Calendar permission chosen: only "View and edit events on all of your calendars".

If you have not yet created the **Google Calendar** credential in n8n, do step 3 below. Everything else here starts after those.

## 1. Update the repo

In PowerShell, from the folder that contains your `jarvis` folder:

```powershell
Expand-Archive -Path "$HOME\Downloads\jarvis-m3-update.zip" -DestinationPath . -Force
cd jarvis
git add -A; git commit -m "M3: reminder engine"
```

## 2. Database (Supabase SQL editor)

1. Run `db/migrations/004_alerts.sql`.
2. Save your ntfy topic (the secret part of your ntfy address; replace the text):

```sql
update jarvis.settings set value = '"your-topic-here"'::jsonb where key = 'ntfy_topic';
```

Keep the double quotes inside the single quotes. The topic is stored in the database, not in the workflow, so the exported workflow holds no secret.

## 3. Google Calendar credential in n8n (only if not done yet)

1. Google Cloud Console, the same project as Gmail: **APIs & Services, Library**, search **Google Calendar API**, **Enable**. In **Google Auth Platform, Data Access**, add the scope `.../auth/calendar.events` if it is listed.
2. n8n, **Credentials, Create credential, Google Calendar OAuth2 API**. Use the same Client ID and Client Secret as your Gmail credential. Click **Sign in with Google** and choose the account whose calendar your iPhone shows (your personal Gmail).
3. Google will say the app isn't verified. Choose **Advanced, then Go to (app name)**. Tick only **View and edit events on all of your calendars**.
4. Name the credential exactly **Google Calendar**.

On the iPhone, make sure that Google account's calendar is switched on: **Settings, Calendar, Accounts, Gmail (or Google)**, with **Calendars** on, and that Calendar notifications are allowed.

## 4. Add the dispatcher

1. In your Supabase credential, set **Maximum Number of Connections** to 3 or 4 (the default allows far more than the free pooler likes). Optional but safer.
2. Import `n8n/workflows/02-reminder-dispatcher.json`.
3. Open each of the database nodes (**Claim due alerts**, **Record outcome**, **Find stale repeats**, **Save stale**) and choose your Supabase credential. On **Backup event**, choose **Google Calendar**.
4. **Save**, then **Activate**.

If you imported an earlier version of this workflow, deactivate and delete it first.

## 5. Test

1. Ask: `remind me in 3 minutes to test Jarvis` (use the PowerShell test from M2). The push titled **Reminder** should arrive within a minute before that time, and there should be no Calendar event.
2. Say `my friend's birthday is on <a date a week from today>`. A push "In 7 days: ..." should arrive at the next 9 AM India time.
3. **Test the backup.** In n8n open the **ntfy** node and temporarily change its URL host to `https://ntfy.invalid/{{ $json.topic }}`. Create another reminder for 3 minutes ahead. Expect: no ntfy push, but a Google Calendar event about two minutes after the attempt, and the Calendar alert on your phone. Then **undo your change** in the ntfy node.
4. In Supabase: `select title, remind_at, last_notified_at from jarvis.items order by created_at desc;` should show the reminders as notified.

## 6. If an alert doesn't come through

The reason the last push failed is saved. Run this in Supabase:

```sql
select value from jarvis.settings where key = 'last_push_error';
```

- `no ntfy_topic is set in jarvis.settings`: run the topic `update` from step 2.
- `429 - ...too many requests`: ntfy rate limited the shared Render address. The Calendar backup covers it, and it clears after the daily reset.
- Anything else: send it to me.

## 7. Things to know

- **Timing:** a push arrives between 0 and 60 seconds before the set time, and not after it (apart from a few seconds of delivery).
- **Late alerts:** if the service was asleep, alerts up to a day late still go out. Older repeating reminders are moved to their next time without an alert.
- **A fired reminder stays open** until you mark it done or cancel it. (M6 adds a "done" shortcut.)
- **A failed push** goes to Calendar straight away. If Calendar fails too, it is retried every 5 minutes.
- **The backup only works while n8n is awake.** Keep the cron-job.org ping running.
- The dispatcher doesn't keep its successful runs in n8n's history, on purpose (one run a minute would fill the database). Failures are kept.
- Re-check the Calendar and Gmail connections around 2026-10-28.

## 8. Not tested by me

I tested the code with unit tests and a local n8n run against a mock ntfy and a mock Google Calendar: due reminders and date alerts sent once, early claiming without duplicates, a repeating reminder moved on, a stale one skipped, a failed push replaced by one Calendar event, both channels failing and then recovering, a missing topic handled. I haven't called the real Google Calendar, so **step 5.3 is the first real check** of the event format.

## Done when

- [ ] A reminder pushes on time through ntfy, with no Calendar event
- [ ] A date alert arrives at 9 AM
- [ ] With ntfy broken on purpose, a Calendar event appears and alerts once
- [ ] ntfy node restored afterwards

Results / notes:
