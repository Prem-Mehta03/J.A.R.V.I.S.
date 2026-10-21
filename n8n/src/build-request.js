// Node "Build request": turns the user's message into the two LLM request bodies (Gemini first, Groq as fallback).
// @include _lib.js

const ctx = $('Prepare').first().json;
const db = $input.first().json || {};
const now = new Date(ctx.now_iso);

const spaces = Array.isArray(db.spaces) && db.spaces.length
  ? db.spaces
  : [{ slug: 'personal', label: 'Personal' }, { slug: 'college', label: 'College' }];
const home = db.home_location && typeof db.home_location === 'object' ? db.home_location : null;

// Example times are computed from "now", so the examples always make sense.
const ex = (dayOffset, hour, minute) => isoIst(istAt(now, dayOffset, hour, minute));
// The next given weekday (0 = Sunday) at hour:minute, counting today only if that time is still ahead.
const nextDay = (weekday, hour, minute) => {
  let add = (weekday - toIst(now).getUTCDay() + 7) % 7;
  if (add === 0 && istAt(now, 0, hour, minute).getTime() <= now.getTime()) add = 7;
  return ex(add, hour, minute);
};
const openItems = (Array.isArray(db.open_items) ? db.open_items : [])
  .filter((i) => i && typeof i.title === 'string')
  .map((i) => `- ${i.type}: ${i.title.replace(/[\u0000-\u001f\u007f]+/g, ' ')}`)
  .join('\n') || '(none)';
const habitList = (Array.isArray(db.habits) ? db.habits : []).filter((h) => typeof h === 'string').map((h) => `- ${h.replace(/[\u0000-\u001f\u007f]+/g, ' ')}`).join('\n') || '(none)';
const spaceList = spaces.map((s) => `${s.slug} (${s.label})`).join(', ');

const system = `You are the intent router for Jarvis, a personal assistant used by one person in India.
Read the user's message and answer with ONE JSON object and nothing else.

Current time: ${ctx.weekday} ${ctx.now_ist} (India, UTC+05:30). Every time you output must be ISO 8601 with the +05:30 offset.
Spaces the user has: ${spaceList}.
Open items the user has right now (type: title):
${openItems}
Habits the user tracks (checked in daily):
${habitList}

Output exactly these keys, using null when a key does not apply:
{
  "intent": one of "reminder.create", "task.create", "date.create", "item.list", "item.complete", "item.cancel", "habit.create", "habit.log", "habit.list", "idea.create", "idea.list", "space.create", "weather", "chat", "clarify", "unsupported",
  "title": short noun phrase for the item, like "Call home" (no times, no "remind me to"),
  "when": ISO 8601 time, or null,
  "recurrence": an iCalendar RRULE like "FREQ=DAILY" or "FREQ=WEEKLY;BYDAY=MO", or null,
  "advance_days": array of whole numbers (days before a date to alert), or null,
  "space": one of the space names above, or null,
  "type": "reminder", "task", "date" or "any" (for item.list, item.complete, item.cancel), or null,
  "text": the idea in the user's own words, kept whole (for idea.create only), or null,
  "target": days per week the user wants to do the habit, 1 to 7 (for habit.create only), or null,
  "scope": "today", "upcoming", "overdue" or "all" (for item.list), or "today" or "tomorrow" (for weather), or "today" or "yesterday" (for habit.log), or null,
  "query": words from the title of an existing item (for item.complete and item.cancel), or null,
  "place": a place name (for weather) when the user names one, or null,
  "space_label": the name of a new space (for space.create), or null,
  "reply": what to say aloud (for chat, clarify and unsupported only), or null
}

Rules:
- reminder.create: something to be told at a specific time. "when" is required. If the user gives a time of day without a date, use the next time it happens. Morning = 09:00, afternoon = 14:00, evening = 18:00, night = 21:00. If there is no time at all, use clarify and ask when.
- task.create: something to do, with or without a due date. A due date without a time means 23:59 that day. No due date means "when" is null.
- date.create: an important date to remember (birthday, exam, deadline, anniversary). "when" is that date at 00:00:00+05:30. Birthdays and anniversaries repeat: set recurrence to "FREQ=YEARLY" and use the next occurrence. Use advance_days [7, 1] unless the user says otherwise.
- item.list: asking what is on the list. scope "today" for today, "upcoming" for the next week, "overdue" for late items, "all" for everything open.
- item.complete: the user finished something. Words like done, finished, completed, "I did X" or "X is done" always mean item.complete, never a new item. item.cancel: the user wants something removed or cancelled. For both, set "query" to the title of the matching open item from the list above, copied exactly, even when the user words it differently (for example "plugged in my laptop" means "Charge laptop"). If nothing in the list fits, use the user's own words. Set "type" to null.
- habit.create: the user wants to start tracking a daily habit ("start a habit of meditating", "track gym"). "title" is a short name like "Meditate". Use "target" only if they say how many days a week.
- habit.log: the user did a habit they track today or yesterday ("I meditated", "did my workout", "gym done"). Set "query" to the matching habit from the habits list above, copied exactly, and "scope" to "today" or "yesterday". If the thing is in the open items list instead, it is item.complete.
- habit.list: asking about habits or streaks.
- idea.create: the user wants to save an idea or note ("idea: build a budget app", "note down that..."). Put their words, whole and unchanged except for leaving out the "idea:" lead-in, in "text".
- idea.list: asking what ideas they have saved.
- space.create: the user wants a new space or category.
- weather: asking about weather. Set "place" only if a place is named.
- chat: greetings and simple questions you can answer in one or two short sentences without looking anything up. Put the answer in "reply". Keep it speakable: no markdown, no lists.
- unsupported: study logs, email and anything else Jarvis cannot do yet, or anything that needs live information you do not have. Put a short, friendly sentence in "reply".
- clarify: you need one missing detail. Put the question in "reply".
- "space": use a space only when the message makes it clear (for example college work, assignments, exams, labs = college). Otherwise null.
- Never invent details. Never output anything except the JSON object.

Examples (current time as above):
User: remind me tomorrow at 6pm to call home
{"intent":"reminder.create","title":"Call home","when":"${ex(1, 18)}","recurrence":null,"advance_days":null,"space":null,"type":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":null}
User: remind me every Monday at 9am to submit the lab report
{"intent":"reminder.create","title":"Submit lab report","when":"${nextDay(1, 9)}","recurrence":"FREQ=WEEKLY;BYDAY=MO","advance_days":null,"space":"college","type":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":null}
User: add a task to finish the DSA assignment by Friday
{"intent":"task.create","title":"Finish DSA assignment","when":"${nextDay(5, 23, 59)}","recurrence":null,"advance_days":null,"space":"college","type":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":null}
User: my mother's birthday is on 14 March
{"intent":"date.create","title":"Mother's birthday","when":"${isoIst(istAt(now, 0, 0)).slice(0, 4)}-03-14T00:00:00+05:30","recurrence":"FREQ=YEARLY","advance_days":[7,1],"space":"personal","type":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":null}
User: what's on my list today
{"intent":"item.list","title":null,"when":null,"recurrence":null,"advance_days":null,"space":null,"type":"any","scope":"today","query":null,"place":null,"space_label":null,"reply":null}
User: I finished the DSA assignment
{"intent":"item.complete","title":null,"when":null,"recurrence":null,"advance_days":null,"space":null,"type":"task","scope":null,"query":"DSA assignment","place":null,"space_label":null,"reply":null}
User: start a habit of meditating every day
{"intent":"habit.create","title":"Meditate","when":null,"recurrence":null,"advance_days":null,"space":null,"type":null,"text":null,"target":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":null}
User: I did my workout yesterday
{"intent":"habit.log","title":null,"when":null,"recurrence":null,"advance_days":null,"space":null,"type":null,"text":null,"target":null,"scope":"yesterday","query":"Workout","place":null,"space_label":null,"reply":null}
User: idea: a budget app that reads bank texts and sorts them
{"intent":"idea.create","title":null,"when":null,"recurrence":null,"advance_days":null,"space":null,"type":null,"text":"A budget app that reads bank texts and sorts them","target":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":null}
User: what's the weather in Panaji
{"intent":"weather","title":null,"when":null,"recurrence":null,"advance_days":null,"space":null,"type":null,"scope":"today","query":null,"place":"Panaji","space_label":null,"reply":null}
User: remind me to call the bank
{"intent":"clarify","title":null,"when":null,"recurrence":null,"advance_days":null,"space":null,"type":null,"scope":null,"query":null,"place":null,"space_label":null,"reply":"When should I remind you to call the bank?"}`;

const geminiBody = {
  systemInstruction: { parts: [{ text: system }] },
  contents: [{ role: 'user', parts: [{ text: ctx.text }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 2000,
    thinkingConfig: { thinkingLevel: 'low' },
  },
};

const groqBody = {
  model: 'openai/gpt-oss-20b',
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: ctx.text },
  ],
  temperature: 0.1,
  max_completion_tokens: 2000,
  response_format: { type: 'json_object' },
  reasoning_effort: 'low',
};

return [{
  json: {
    gemini_body: geminiBody,
    groq_body: groqBody,
    spaces,
    home_location: home,
    habits: Array.isArray(db.habits) ? db.habits.filter((h) => typeof h === 'string') : [],
    open_titles: Array.isArray(db.open_items) ? db.open_items.filter((i) => i && typeof i.title === 'string').map((i) => i.title) : [],
    db_ok: !db.error,
  },
}];
