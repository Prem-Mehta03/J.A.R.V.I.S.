# M12: Several commands in one message

Say or type more than one thing: "remind me tomorrow at 6 to call mom, add a task to buy milk and I finished the lab report". Jarvis does each, in order (up to 5), and answers in one reply.

## Install
Re-import `n8n/workflows/01-chat-router.json` (deactivate the old one, import, re-attach credentials Jarvis token, Gemini key, Groq key, Supabase Postgres, publish). Nothing else changes: no database change, no app change.

## Check
- [ ] "Remind me tomorrow at 6 pm to call mom and I finished <an open task>" does both
- [ ] A single command still answers as before
- [ ] If one part cannot be done (no matching item), the reply says so and the other part still happens
- [ ] Voice and the Siri shortcut read the combined reply

## Notes
- It depends on the model splitting the message well. If a message is split wrongly, say it as separate sentences or send it twice.
- Commands cannot depend on each other. At most 5 per message.
- Tested with a fake model that follows the same format, not with real Gemini. The real splitting is the part to watch.
