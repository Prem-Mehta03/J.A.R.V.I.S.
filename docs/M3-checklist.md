# M3: Reminder engine

Goal: reminders and important dates actually alert you.

- A new workflow, **02 Reminder Dispatcher**, runs every minute and sends push alerts through ntfy.
- Date alerts go out at 9 AM: a week before, a day before and on the day (or whatever you asked for).
- Repeating reminders move on to their next time after they fire.
- **Backup:** every reminder and important date also gets a Google Calendar event with its own alert, so Google notifies you even if ntfy or Render is down. You may get two alerts for a reminder. That is the price of a real backup.

## 1. Database (Supabase SQL editor)

1. Run `db/migrations/004_alerts.sql`.
2. Save your ntfy topic (the secret part of your ntfy address; replace the text):

```sql
update jarvis.settings set value = '"your-topic-here"'::jsonb where key = 'ntfy_topic';
```

Keep the double quotes inside the single quotes. The topic is stored in the database, not in the workflow, so the exported workflow holds no secret.

## 2. Google Calendar permission

1. Google Cloud Console, the same project as Gmail: **APIs & Services, Library**, search **Google Calendar API**, **Enable**.
2. **Google Auth Platform, Data Access**: add the scope `.../auth/calendar.events` if it is listed. It is the narrowest one that can create and delete events.
3. n8n, **Credentials, Create credential, Google Calendar OAuth2 API**. Use the same Client ID and Client Secret as your Gmail credential. Click **Sign in with Google** and choose the account whose calendar your iPhone shows (your personal Gmail).
4. Google will say the app isn't verified. Choose **Advanced, then Go to (app name)**. This is expected: it is your own app.
5. Name the credential exactly **Google Calendar**.

If the n8n credential has a **Custom Scopes** switch, turn it on and set only `https://www.googleapis.com/auth/calendar.events`. If it doesn't, look at the permission list Google shows and tell me what it asks for. Like Gmail, it must never be broader than it needs to be.

On the iPhone, make sure that Google account's calendar is switched on: **Settings, Calendar, Accounts, Gmail (or Google)**, with **Calendars** on. Alerts then arrive through the normal Calendar app. The Google Calendar app works too, if its notifications are on.

## 3. Replace the router and add the dispatcher

1. n8n: open **01 Chat Router** and **deactivate** it (two workflows cannot share a webhook path).
2. Import `n8n/workflows/01-chat-router.json`. Choose the same credentials as before, and **Google Calendar** on the two calendar nodes (**Create calendar event**, **Delete calendar event**). **Save event id** uses your Supabase credential. **Activate** it.
3. Delete the old router once the new one works.
4. Import `n8n/workflows/02-reminder-dispatcher.json`. Choose your Supabase credential on all the database nodes. **Activate** it.

## 4. Test

1. Ask: `remind me in 3 minutes to test Jarvis` (use the PowerShell test from M2). Within about a minute after that time you should get an ntfy push titled **Reminder**.
2. Check Google Calendar: an event "Test Jarvis" with a popup should be there, and the phone's Calendar alert fires at the same time.
3. Say `my friend's birthday is on <a date a week from today>`. A push "In 7 days: ..." should arrive at the next 9 AM India time, and the all-day event shows in Calendar.
4. Cancel the test reminder with `cancel the test jarvis reminder`: the calendar event should disappear.
5. In Supabase, `select title, remind_at, last_notified_at, calendar_event_id from jarvis.items order by created_at desc;` should show the reminder as notified and the event id filled in.

## 5. Things to know

- **Only a reminder that is on time gets a push.** If the service was asleep, alerts up to a day late still go out. Older repeating reminders are moved to their next time without an alert.
- **A fired reminder stays open** until you mark it done or cancel it. (M6 adds a "done" shortcut.)
- **A failed push is retried every 5 minutes.** If ntfy is rate limited, the Calendar copy still fires.
- **To switch the Calendar copies off:** `update jarvis.settings set value = 'false'::jsonb where key = 'calendar_backup';`. Copies already made stay until the item is closed.
- The dispatcher doesn't keep its successful runs in n8n's history, on purpose (one run a minute would fill the database). Failures are kept.
- Render still sleeps when nothing visits it, so keep the cron-job.org ping running.

## 6. Not tested by me

I tested the code with 14 unit tests plus a local n8n run against a mock ntfy and a mock Google Calendar: due reminders and date alerts sent once, a repeating reminder moved on, a stale one skipped, a failed push retried, a missing topic handled, calendar events created and deleted. I haven't called the real Google Calendar, so **step 4.2 is the first real check** of the event format, especially the all-day alert times (for "a week before" the popup should show at 9 AM on that day).

## Done when

- [ ] A reminder pushes on time through ntfy
- [ ] The same reminder appears in Google Calendar and its alert fires
- [ ] A date alert arrives at 9 AM
- [ ] Cancelling removes the calendar event

Results / notes:
