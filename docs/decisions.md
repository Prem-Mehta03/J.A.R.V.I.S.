# Decisions

Short records of what was chosen and why. Newest at the bottom. Dates are 2026.

## Hosting without a card (Oct 19 to 20)

- **Render free + Supabase free + a cron-job.org pinger.** Oracle's free VM needs a card, and its idle-reclaim rule (CPU, network and memory all under 15% for 7 days) would likely flag a lightly used n8n box. A Raspberry Pi at home was ruled out because it may not work on the BITS Wi-Fi.
- **Everything stateful lives in Supabase.** Render's free filesystem is ephemeral and the service can restart at any time.
- **Costs of this choice:** the service sleeps after 15 minutes without traffic (the pinger prevents that), one free web service uses almost all of the 750 monthly free hours, and nothing else should run on that Render account.

## n8n configuration (Oct 20)

- Image pinned to `n8nio/n8n:2.43.8`. Upgrade on purpose, and read the deprecation warnings in the logs first.
- `N8N_WEBHOOK_URL` replaces the deprecated `WEBHOOK_URL`.
- `N8N_RUNNERS_GRANT_TOKEN_TTL=120`, because the code-node runner timed out starting on the slow free instance.
- The `N8N_RUNNERS_MODE=external` suggestion is ignored: it needs a second service and would use up the free hours.
- Secrets are entered as n8n credentials, never typed into a node's fields, so exported workflows stay clean.

## Push alerts (Oct 20)

- **ntfy is the primary channel.** It worked after the daily reset.
- ntfy.sh answered "too many requests" to n8n on Render, including when an account token was sent. Cause unconfirmed; probably Render's shared outbound address.
- **A backup channel is still needed.** Candidates: a Telegram bot (free, limits are per bot), Google Calendar events (native iPhone alerts, time-based only), or both. Decide in M3.

## Gmail (Oct 20)

- **One Google Cloud project, one OAuth client, both accounts.** The app is set to "In production" so tokens don't expire after about 7 days in Testing mode.
- Google's Branding page required a homepage and privacy policy on an authorized domain. A GitHub Pages site verified in Search Console was accepted. The two pages are copied in `site/`. Keep them online and at the same addresses.
- **Narrowest permission only** ("read, compose and send"). The broader option includes permanently deleting mail and was refused. Workflows must never send or delete mail.
- Re-check both Gmail connections around 2026-10-28 to confirm the tokens survived.
- Only sender, subject and a short snippet go to LLM providers. Never full bodies.

## LLMs (Oct 19 to 20)

- **Gemini primary, Groq fallback.** Both tested in M0 and returned valid JSON. Retry on HTTP 429 and fall back to the other provider.
- **No LangChain.** The reasoning needed is simple: one prompt that returns structured JSON, then n8n routing. n8n's AI Agent nodes can be used later for open-ended features.
- **Jev (TypeSafe AI)** looked suitable for classification but is paid and not free, so it is out. The classifier stays a separate step so a model can be swapped later.
- Gemini spends many thinking tokens on simple classification. Reduce that and force strict JSON when building the real classifier.

## iPhone (Oct 19 to 20)

- Reminders sync through Siri Shortcuts, because n8n has no way to write to iOS Reminders. A time-of-day automation was confirmed to run silently on a locked phone.
- The PWA stores the webhook token on the phone and never in its source.

## Chat router (Oct 20, M2)

- **The model only extracts; code decides.** The LLM returns intent JSON. Code validates every field (dates, lengths, recurrence rules, spaces) and runs fixed, parameterized SQL. The model never writes SQL and never writes the reply.
- **Replies are templates.** Predictable, free, and the same on voice and screen.
- **Times are India time (+05:30), fixed.** No daylight saving in India, so a fixed offset is enough.
- **Gemini first, Groq on any failure or non-JSON answer.** If both fail the reply says so and nothing is written.
- **Past reminders are rejected** (unless recurring) rather than silently saved.
- **"Done with X" with several matches asks which one**; it never closes more than one item.
- **Weather uses Open-Meteo** (no key). Home location lives in `jarvis.settings` (`home_location`, migration 003).

## Reminder engine (Oct 20, M3)

- **One alert per reminder.** ntfy is the main channel. **Google Calendar is the backup, used only when the ntfy push fails**: Jarvis then creates a Calendar event that rings the phone about two minutes later. If Calendar takes it, the reminder counts as delivered and is not pushed again, so there is never a double alert. If both fail, it is tried again in 5 minutes.
- Considered and rejected: a Calendar copy of every reminder (works even when n8n is asleep, but alerts twice and can arrive too late for reminders set a few minutes ahead). No Telegram, by choice.
- **The backup only works while n8n is awake**, so the cron-job.org ping stays important.
- **Calendar permission:** `calendar.events` only. It is a sensitive scope, but an unverified app is fine for one user (the unverified warning, and a cap of 100 new users that never matters). Re-check the token around 2026-10-28 together with Gmail.
- **A dispatcher workflow runs every minute** and never stores its successful runs, to keep the database small. If the service was asleep, alerts up to a day late are still sent; older repeating reminders are moved on silently.
- **Date alerts go out at 9 AM India time**: a week before, a day before (or whatever was asked) and on the day. An alert whose time was already past when the date was created is skipped.
- **Reminders are claimed up to a minute early.** The dispatcher runs once a minute and a push takes a few seconds, so claiming exactly on time made alerts arrive about a minute late. Now a push arrives between 0 and 60 seconds before the set time and never after it (apart from a few seconds of delivery). Date alerts at 9 AM are not affected.
- **A failed push is retried every 5 minutes**, not every minute, so a rate-limited ntfy is not hammered.
- **A reminder that has fired stays open** until marked done or cancelled (M6 adds the "done" shortcut).
- **The ntfy topic lives in `jarvis.settings`**, not in the workflow, so exported workflows contain no secret.

## Bark replaces ntfy (Oct 20, M3.1)

- **Why:** ntfy.sh kept answering "too many requests" to n8n on Render, including with an account token. Render's free servers share addresses with other people, so the limit was being used up by others. A push service we can't rely on is no use for reminders.
- **Bark** is a free iPhone app that sends through Apple's push system. A push is one HTTP request to `https://api.day.app/push` with the device key in the body. It was tested by hand from Render and worked. Pushbullet was considered and dropped (no longer in the App Store); Slack is the fallback if Bark ever fails.
- **Levels:** reminders and "today" date alerts use Bark's `timeSensitive` level (shows through Focus modes); advance date alerts use `active`. All pushes are grouped under "Jarvis" in the app.
- **The device key is a secret.** It lives in `jarvis.settings` (`bark_key`), never in a workflow file or git. The export script now refuses any workflow with `api.day.app/<key>` in it.
- **Unchanged:** the Google Calendar backup when a push fails, one alert per reminder, retries every 5 minutes, and `last_push_error` in the settings table.
- **Risks to watch:** `api.day.app` is a public server run by Bark's author, with no stated limits or uptime promise. If it ever fails, the Calendar backup covers reminders, and Bark can be self-hosted or replaced.
- ntfy settings (`ntfy_topic`) are removed by migration 005.

## The app (M4)

- **Plain files, no build step.** HTML, CSS and ES modules; nothing to install, nothing to break. `logic.js` holds all date grouping so it can be unit-tested with Node (`node --test frontend/tests/logic.test.mjs`).
- **Hosting:** GitHub Pages, in a `jarvis/` folder of the existing `<username>.github.io` repo. The source is public and holds no secrets; the server address and token are typed on the phone once.
- **Token in localStorage.** Acceptable for one user on his own phone. On iPhone, Safari and the Home Screen app have separate storage, so set up inside the installed app.
- **Own endpoint for lists** (`jarvis-items`) instead of asking the chat router: no language model, instant, deterministic.
- **Offline:** the shell is cached by a service worker and the last list is kept, so the app opens with data even while Render is asleep.
- **Strict CSP** (no inline script or style) and text-only rendering (`textContent`), so a stored title can never run as code.
- **Redesign (Stitch, "Warm Luminescence").** Dark only, amber accent, chat first, navigation in a left drawer (no bottom tab bar, as asked). Not taken from the mockups because they were invented data: the "Jarvis Plus" card, user name, version badges, "Pay Now", the memory photo and AI insight banners. The mic button is a placeholder until M5.
- **The orb** is a canvas particle animation (`orb.js`), no image. Modes: idle, listening (while typing, until real voice exists), thinking (waiting for the reply), replying.

## Voice (M5)

- **Speech to text on Groq Whisper** (free, uses the Groq key already in n8n) rather than the browser's speech recognition, which is unreliable in installed iPhone web apps. The app records, the server transcribes, then the text goes through the normal chat path, so voice and typing behave identically.
- **Voice mode is a separate full-screen page** (like Gemini Live): orb in the centre, listen, think, speak, listen again. It shows no reply text and saves nothing in the chat, and only voice requests are spoken (typing never makes it talk). Each chat reply still has a small speaker icon to read it aloud.
- **Natural voice via Groq Orpheus** (`jarvis-speak`, free, about 100 pieces a day) replaced the browser's robotic voice as the default; the phone's own voice is the automatic fallback and a Settings choice. iOS does not expose Siri voices to web pages, so Siri's "American voice 3" cannot be matched exactly. The orb's speaking animation is driven by the loudness of the audio itself.
- **"Waking up" message only after 25 seconds**: a warm server answers in a few seconds, so the message appears only when the server is really cold.
- **Hands-free is a Shortcut, not the app.** iPhone web apps cannot listen in the background, and the app cannot be started by voice reliably. The "Jarvis" Shortcut (dictate, call the server, speak) works with the screen locked.
- **Recording stops by itself** after about 1.4 seconds of quiet, or you tap the button.

## iOS Reminders sync (M6)

- **One stateless endpoint, `jarvis-sync`.** The Shortcut reports which Jarvis ids it sees as ticked off and as still open; the server returns what to add and what to close. No "synced" flag is stored (`ios_reminder_ref` is not used), so a half-failed run is repaired by the next run, and nothing is added twice because the open ones are reported as `known`.
- **Only non-repeating reminders and tasks sync.** Ticking off one occurrence on the phone would close the whole repeating series in Jarvis. Dates stay in Jarvis. They still alert through Bark.
- **Done on the phone reaches Jarvis at the next sync.** iOS has no "reminder completed" trigger, so a few time-of-day automations plus "Hey Siri, Jarvis Sync" do it. The voice "done" shortcut reuses the chat route (`item.complete`), so there is no separate done endpoint.
- **The id link lives in the reminder's Notes** (`jarvis:<id>`). The server reads only id-shaped text from them, so stray notes cannot break the SQL or the sync.
- **Open question:** whether a due time on the phone copy also rings on its own (a second alert beside Bark). Decide after seeing it on the device.

## Closing items by words and voice (Oct 21)

- **"Done X", "finished X", "completed X" always close, never create.** Code checks the start of the message, because the model once turned "Done, charge laptop" into a new task. It only overrides when the model picked a create, chat, clarify or unsupported intent.
- **Matching uses word stems**, not exact text: "charging", "charged" and "charge" all reduce to the same stem, and every stem must appear in the title. Closing looks at reminders, tasks and dates together (the model's type guess is ignored, since it was a source of misses). An exact title wins over partial matches; several partial matches make Jarvis ask which one.
- **Different words with the same meaning** ("plug in my laptop" for "Charge laptop") are handled by the model: the router prompt now lists the open items (up to 60) and tells it to copy the closest title as the query.

## Habits and ideas (M7)

- **Habit streaks are computed, not stored.** The server sends each habit's done days (last 400) and the app and the chat replies calculate current streak, best streak and totals from them, so a past day can be fixed and everything follows. The current streak counts from yesterday while today is open.
- **Past days can be fixed from the calendar** (up to 400 days back, never in the future). Check-in and undo are separate actions (`habit_log` with `done` true or false), idempotent per habit and day.
- **Habits are archived, not deleted**, so history stays. Ideas are really deleted (the app asks for a second tap).
- **Ideas are one text field.** The title is the first line, the body is everything, up to 4000 characters, line breaks kept. The "Jarvis idea" Shortcut posts the dictated text straight to `jarvis-items`, so the language model never rewords it. In chat the model keeps the user's words (limit 1000 characters).
- **"Done X" checks the habit list first only if X fits a habit and no open reminder or task.** Otherwise it closes the reminder or task as before.
- **Study logging dropped.** It would duplicate tasks, reminders and dates in the College space. A weekly target on habits (`target_per_week`) covers "study 5 days a week"; a Sunday summary goes to M9.

## Study tab (M7)

- **Exam alerts are linked reminders.** An exam is an important date in the College space with `advance_days` empty; its alerts (7 PM the evening before, 2 hours before the start) are ordinary reminders whose `parent_id` is the exam (migration 007), so the existing reminder engine rings them with no new code. Closing the exam cancels them; the list call closes ones that already rang; they are hidden from the lists. Alerts already in the past are not created. College work is a task in the College space. The Study tab is a view over those plus two forms, so everything also shows in Dates and Tasks, syncs to iOS Reminders, and can be closed by chat.
- **Dates may carry a clock time.** Alert text then says "at 9:30 AM". Dates without a time are all-day, as before. The alert times did not change (9 AM, the day before and the day of).
- **Chat exams:** a date whose title says exam, test, quiz, midsem, compre or viva defaults to the College space and the two linked alerts (other dates stay 7 days and 1 day). Repeating exams are treated as plain dates.
- **Important links** live in their own small table (`jarvis.links`: title, url) and one sheet in the Study tab. Addresses are checked with a regular expression (http or https, a host with a dot); the n8n Code sandbox has no `URL` class.
- **The Siri shortcut uses the chat route with `space: college`**, so spoken due dates ("by Friday") are understood.


## Email (M8)

- **Digest only, no email pushes** (your choice). Important mail is shown in the Email tab, read out on request, and goes into the M9 morning brief.
- **Existing tables reused.** `email_rules` (match_type sender or domain, match_value) and `email_feedback` come from 001_init.sql; only `email_messages` is new (migration 008). A first draft of 008 recreated the other two with different columns and would have been silently skipped on the real database; caught by running against the real schema.
- **Order of sorting:** your rules, then Gmail's Promotions tab, then the model. Corrections create a sender rule, relabel that sender's mail of the last 30 days, and are shown to the model as examples (last 15).
- **What leaves the workflow:** only sender, subject and 120 characters of snippet go to Gemini or Groq; the stored row has sender, subject and a 160 character snippet. The Gmail node returns the raw message, and the Collect node drops everything else immediately. Email text is treated as untrusted in the prompt, and the output is limited to three labels by code.
- **Unlabelled mail is not stored**, so a failed model call is simply retried at the next check. Mail older than 30 days is deleted from `email_messages`.
- **One workflow, two triggers:** a 15 minute schedule and the `jarvis-email-refresh` webhook (the app's Refresh button) share the same nodes.
- **Chat corrections** only change anything when the words point at one sender; otherwise Jarvis asks. A whole free-mail domain cannot be made a rule.
- **M9 change:** no Sunday summary; instead a college work summary of all open tasks in the Study tab.
