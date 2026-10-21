# M7: Habits and Ideas

Goal: track daily habits with streaks and a calendar of the days you did them, and keep a simple list of ideas you can add by voice and edit in the app.

Also in this milestone: the Study tab (exam calendar with evening-before and two-hours-before alerts, college work, and saved links). Section 6.

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

Study tab: tested in desktop Chromium with a real database (alerts created and cancelled with the exam, links added, opened and deleted, adding exams with and without a time, college work with and without a due date, the calendar marks, the next-exam line); the push text with an exam time is covered by unit tests, not by a real Bark push.

Tested in desktop Chromium against a local n8n and a real Postgres database: adding habits, checking in today, filling in a past day, streak and best streak numbers, the month calendar, ideas add, edit and delete with line breaks, and the habit and idea commands' database statements. **Not tested:** the real language model understanding habit and idea sentences (the prompt has examples and the code backs it up, but check a few phrases), the app on a real iPhone, and the Shortcut.

## Try these

- "start a habit of meditating every day"
- "I meditated" (streak reply), "did gym yesterday"
- "how are my habits"
- "idea: build an app that sorts my bank texts"
- "what ideas do I have"
- "done meditating" (checks in the habit, not a reminder)

## 6. Study tab: exams and college work

Menu, **Study**. Four parts on one page:

1. **Exam calendar.** A month calendar with exam days in gold (tap one to open it), and under it the upcoming exams with the days left. "Add exam" takes a name, a date and an optional time. Jarvis then sets two pushes: **7 PM the evening before** ("Exam tomorrow: DSA midsem, 9:30 AM") and **2 hours before the start** ("DSA midsem starts in 2 hours"). With no time given you only get the evening one. An exam is an important date in the College space, so it also shows in the Dates tab, and you can add one in chat: "my DSA midsem is on 25 October at 9:30 am". Closing an exam cancels its pending pushes.
2. **College work.** A task list for College only (name, optional due date), grouped Overdue, Today, Upcoming, No date. Tap the circle to mark one done. These are ordinary tasks filed under College, so they sync to the iPhone list and "done X" closes them.
3. **Important links.** The **Important links** button at the top opens a list of saved websites: tap one to open it in a new tab, add one with an optional name (the address can be typed as www.site.com), tap the bin twice to delete. It is a plain list, not attached to a course or homework.
4. **Menu count.** The number next to Study is open exams plus open college work.

Notes: an alert whose moment has already passed when you add the exam is skipped (for example an exam tomorrow morning added at 8 PM tonight gets only the two-hours-before push). Exams added before this update keep their old 9 AM day-before alert.

### Shortcut: "Jarvis study" (add college work by voice)

1. New Shortcut, name it **Jarvis study**.
2. **Dictate Text** (Stop Listening: After Pause, English).
3. **Text**: `Add a task to ` followed by the **Dictated Text** variable.
4. **Get Contents of URL**: URL `https://jarvis-n8n-rd61.onrender.com/webhook/jarvis`, POST, header `X-Jarvis-Token`, JSON body: `text` = the Text from step 3, `space` = `college`, `source` = `shortcut`.
5. **Get Dictionary from Input** (input: Contents of URL), **Get Dictionary Value** `reply`, **Speak Text**.
6. Say "Hey Siri, Jarvis study", then for example "finish the lab report by Friday". It is filed under College with that due date.

Exams by voice: "Hey Siri, Jarvis" then "my DSA midsem is on 25 October at 9:30 am".

## About the old study-tracker idea

A separate study-hours tracker is still not built (it would repeat tasks and dates). A weekly target on a habit ("start a habit of studying, 5 days a week") and a Sunday summary in M9 cover the rest.
