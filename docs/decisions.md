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
