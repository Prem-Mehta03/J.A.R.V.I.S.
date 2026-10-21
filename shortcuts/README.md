# Siri Shortcuts

Built during M0, M5 and M6. Notes and exported links go here.

| Shortcut | Does | Milestone | State |
|---|---|---|---|
| Jarvis Ping | POSTs to `/webhook/jarvis-ping` with the token header, reads `reply`, speaks it, adds it as a reminder in the "Jarvis" list | M0 | Works |
| Wake up Jarvis | Opens the Jarvis web app | M5 | Not built yet |
| Jarvis reminders | Fetches pending reminders from n8n and speaks them | M5 | Not built yet |
| Jarvis Sync | Adds new Jarvis reminders to the "Jarvis" Reminders list and reports completed ones back (see docs/M6-checklist.md) | M6 | Steps written, not built yet |
| Jarvis done | "Jarvis, done with X": marks X complete in Jarvis (uses the chat route) | M6 | Steps written, not built yet |

## What M0 showed

- A Time of Day automation running Jarvis Ping ran by itself on a locked phone and spoke the reply. So scheduled background sync (M6) is possible.
- No banner appeared when it ran. "Notify When Run" is optional, so this is not a problem.
- Not recorded in M0: whether an Open URL shortcut opens the Home Screen app or a Safari tab. Test this at the start of M5.

## Rules

- The shared secret token is typed into each shortcut by hand. Never commit it, and never share a screenshot that shows it.
- Every Shortcut should set a long timeout. If the free Render service is asleep, the first call can take about a minute.
