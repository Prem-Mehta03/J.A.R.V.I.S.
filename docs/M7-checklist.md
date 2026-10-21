# M7: Habits and Ideas

Goal: track daily habits with streaks and a calendar of the days you did them, and keep a simple list of ideas you can add by voice and edit in the app.

Study logging was left out on purpose (see the end).

## 1. Update the repo

Extract the zip over the repo, then commit (commands came with the zip).

## 2. Supabase (1 minute)

1. Supabase, SQL Editor, paste `db/migrations/006_habits_ideas.sql`, Run. It only adds an optional weekly target to habits and an index. Safe to run twice.

## 3. n8n (3 minutes)

Two workflows changed. For each, open the old one, then menu, Import from file, pick the new JSON, reconnect credentials, Save, make it **Active**, and deactivate the old copy.

1. `n8n/workflows/01-chat-router.json` (habit and idea commands in chat). Credentials: Jarvis token, Gemini key, Groq key, Supabase Postgres.
2. `n8n/workflows/03-items-api.json` (what the app uses). Credentials: Jarvis token, Supabase Postgres.

## 4. The app

Copy `frontend/` into your GitHub Pages folder again and push. Close the app fully and open it twice.

Menu now has **Habits** and **Ideas**.

### Habits

- Add a habit with the box at the top ("Meditate"), or in Chat say "start a habit of meditating".
- The circle on the left checks it in for today. The flame on the right is the streak. The row of dots is the last seven days (today is the ringed one).
- Tap the habit for its page: streak, best streak, total, this week, and a month calendar. Gold days are days you did it. Tap any past day to mark or unmark it (to fix a day you forgot). Use the arrows for earlier months. Future days are locked.
- The streak does not drop to zero the moment midnight passes: it counts from yesterday until the day is over.
- "Archive habit" removes it from the list. Its history is kept in the database.

By chat or voice: "I meditated", "did my workout yesterday", "done meditating", "how are my habits". The reply tells you the streak. The assistant sees your habit names, so "gym done" finds "Gym workout".

### Ideas

- Write in the box on the Ideas page. Several lines are fine. Tap an idea to edit it or delete it (delete asks you to tap twice).
- In Chat: "idea: a budget app that reads bank texts". Chat messages can be up to 1000 characters.

## 5. Shortcut: "Jarvis idea" (Siri, long and multi-line)

This sends your words straight to the app's ideas list, without the assistant rewording them.

1. New Shortcut, name it **Jarvis idea**.
2. **Dictate Text**. Tap its **Stop Listening** option and set it to **On Tap** so a pause does not cut you off. Language: English.
3. **Get Contents of URL**:
   - URL: `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis-items`
   - Method **POST**, header `X-Jarvis-Token` = your token
   - Request Body **JSON**: `action` (Text) = `idea_create`, `text` (Text) = the **Dictated Text** variable, `source` (Text) = `shortcut`
4. **Speak Text**: `Saved your idea.`
5. Say "Hey Siri, Jarvis idea", then speak. Tap the screen when finished.

About lines: Siri dictation gives one block of text. Saying "new line" or "new paragraph" while dictating usually inserts a break, but this depends on iOS. The server keeps line breaks exactly as sent (up to 4000 characters), and in the app you can add or fix lines by editing.

Optional, for longer notes typed on the phone: make a second shortcut with **Receive** input from the Share Sheet (Text), and use that input as `text` in step 3. Then any note can be shared into Jarvis ideas.

## Not tested by me

Tested in desktop Chromium against a local n8n and a real Postgres database: adding habits, checking in today, filling in a past day, streak and best streak numbers, the month calendar, ideas add, edit and delete with line breaks, and the habit and idea commands' database statements. **Not tested:** the real language model understanding habit and idea sentences (the prompt has examples and the code backs it up, but check a few phrases), the app on a real iPhone, and the Shortcut.

## Try these

- "start a habit of meditating every day"
- "I meditated" (streak reply), "did gym yesterday"
- "how are my habits"
- "idea: build an app that sorts my bank texts"
- "what ideas do I have"
- "done meditating" (checks in the habit, not a reminder)

## Study: what I suggest instead

A separate study tracker would only repeat tasks, reminders and dates in the College space, so it is dropped. Useful pieces that fit existing parts:

1. **Weekly goal on a habit.** For example "Study" with a target of 5 days a week. The database already stores the target (set it by saying "start a habit of studying, 5 days a week") and the habit page shows "3 of 5 this week". Tell me if you want the app to let you edit the target.
2. **Exam countdown.** Important dates already count down in the Dates tab; the M9 morning brief will show the next exam.
3. **Sunday summary (can go into M9).** One push on Sunday evening: habits kept (days done against target), college tasks closed, ideas added.
4. **Minutes per session** only if you want to know how long you study. That needs a small log (subject and minutes). I would add it later if you find you miss it.
