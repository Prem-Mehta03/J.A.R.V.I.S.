// Node "Reply": turns the plan (and the database rows, or the weather) into the final spoken-style answer.
// Replies are built from templates, not by the language model, so they are predictable and cost nothing.
// @include _lib.js

const helpers = this.helpers;
const plan = $('Plan').first().json.plan;
const now = new Date(plan.ctx.now_iso);
const spaces = plan.ctx.spaces || [];
const labelOf = (slug) => (spaces.find((s) => s.slug === slug) || { label: slug }).label;

const done = (partial) => [{ json: Object.assign({ ok: true, intent: plan.intent, provider: plan.provider }, partial) }];

// ---- small speaking helpers ----
const isEndOfDay = (date) => {
  const d = toIst(date);
  return d.getUTCHours() === 23 && d.getUTCMinutes() === 59;
};
const sameIstDay = (a, b) => startOfIstDay(a).getTime() === startOfIstDay(b).getTime();
const whenInList = (date, allDay) => {
  if (sameIstDay(date, now)) return allDay ? 'today' : `at ${clock12(date)}`;
  return speakWhen(date, now, allDay);
};
const advanceWord = (n) => {
  if (n === 0) return 'on the day';
  if (n === 1) return 'a day before';
  if (n === 7) return 'a week before';
  if (n === 14) return 'two weeks before';
  return `${n} days before`;
};
const rruleSpeak = (rule) => {
  if (!rule) return '';
  const freq = (rule.match(/^FREQ=(\w+)/) || [])[1];
  const by = (rule.match(/BYDAY=([A-Z,]+)/) || [])[1];
  const names = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
  if (freq === 'DAILY') return 'every day';
  if (freq === 'WEEKLY') return by ? 'every ' + by.split(',').map((d) => names[d] || d).join(' and ') : 'every week';
  if (freq === 'MONTHLY') return 'every month';
  if (freq === 'YEARLY') return 'every year';
  return '';
};
const iso = (value) => (value ? isoIst(new Date(value)) : null);
const publicItem = (r) => ({
  id: r.id, type: r.type, title: r.title, space: r.space,
  due_at: iso(r.due_at), remind_at: iso(r.remind_at), recurrence: r.recurrence || null,
  advance_days: Array.isArray(r.advance_days) ? r.advance_days : [],
});
const itemSentence = (r) => {
  if (r.type === 'reminder' && r.remind_at) return `${r.title} ${whenInList(new Date(r.remind_at), false)}`;
  if (r.type === 'date' && r.due_at) return `${r.title} ${whenInList(new Date(r.due_at), true)}`;
  if (r.due_at) {
    const due = new Date(r.due_at);
    return `${r.title}, due ${isEndOfDay(due) ? whenInList(due, true) : whenInList(due, false)}`;
  }
  return r.title;
};

// ---- weather ----
const WEATHER_WORDS = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'foggy', 48: 'foggy',
  51: 'drizzling', 53: 'drizzling', 55: 'drizzling', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'rainy', 63: 'rainy', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'snowy', 73: 'snowy', 75: 'heavy snow', 77: 'snowy', 80: 'rain showers', 81: 'rain showers', 82: 'heavy rain showers',
  85: 'snow showers', 86: 'snow showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail',
};
async function weatherReply() {
  const place = plan.data.place;
  const home = plan.ctx.home_location;
  let loc = null;
  try {
    if (place) {
      const g = await helpers.httpRequest({
        method: 'GET',
        url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
        json: true,
        timeout: 15000,
      });
      const r = g && g.results && g.results[0];
      if (!r) return done({ reply: `I couldn't find a place called ${place}.` });
      loc = { name: r.name, lat: Number(r.latitude), lon: Number(r.longitude) };
    } else if (home && Number.isFinite(Number(home.lat)) && Number.isFinite(Number(home.lon))) {
      loc = { name: home.name || 'your area', lat: Number(home.lat), lon: Number(home.lon) };
    } else {
      return done({ reply: "I don't have a home location yet. Tell me a place, like: weather in Panaji." });
    }
    if (!(Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180)) throw new Error('bad coordinates');

    const f = await helpers.httpRequest({
      method: 'GET',
      url: 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${loc.lat}&longitude=${loc.lon}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m'
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code'
        + '&timezone=Asia%2FKolkata&forecast_days=2',
      json: true,
      timeout: 15000,
    });
    const tomorrow = plan.data.scope === 'tomorrow';
    const i = tomorrow ? 1 : 0;
    const daily = f.daily || {};
    const hi = Math.round(daily.temperature_2m_max[i]);
    const lo = Math.round(daily.temperature_2m_min[i]);
    const rain = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
    const rainText = Number.isFinite(rain) ? `, with a ${Math.round(rain)} percent chance of rain` : '';
    const words = (code) => WEATHER_WORDS[code] || 'mixed';
    let reply;
    const info = { place: loc.name, high_c: hi, low_c: lo, rain_chance: Number.isFinite(rain) ? Math.round(rain) : null };
    if (tomorrow) {
      info.condition = words(daily.weather_code[1]);
      reply = `Tomorrow in ${loc.name} it will be ${info.condition}, with a high of ${hi} and a low of ${lo}${rainText}.`;
    } else {
      const c = f.current;
      info.condition = words(c.weather_code);
      info.temperature_c = Math.round(c.temperature_2m);
      info.feels_like_c = Math.round(c.apparent_temperature);
      reply = `In ${loc.name} it's ${info.temperature_c} degrees and ${info.condition}, feeling like ${info.feels_like_c}. Today's high is ${hi} and the low is ${lo}${rainText}.`;
    }
    return done({ reply, weather: info });
  } catch (e) {
    return done({ ok: false, reply: "I couldn't get the weather right now.", error: 'weather_error' });
  }
}

// ---- main ----
if (plan.action === 'reply') {
  const out = { ok: plan.ok, reply: plan.say };
  if (plan.error) out.error = plan.error;
  if (plan.intent === 'clarify') out.needs_clarification = true;
  return done(out);
}

if (plan.action === 'weather') {
  return await weatherReply();
}

// plan.action === 'sql': the database node ran just before this one.
// A query that returns nothing still passes through as one empty item, so empty rows are filtered out here.
const rows = $input.all().map((i) => i.json).filter((r) => r && Object.keys(r).length > 0);
const emptyIsOk = plan.intent === 'item.list' || plan.intent === 'space.create';
const errored = rows.length > 0 && rows[0].error !== undefined && rows[0].id === undefined && rows[0].match_count === undefined;
if (errored || (rows.length === 0 && !emptyIsOk)) {
  return done({ ok: false, reply: "I couldn't reach my database just now. Please try again in a minute.", error: 'db_error' });
}

switch (plan.intent) {
  case 'reminder.create': {
    const r = rows[0];
    const rule = rruleSpeak(r.recurrence);
    const spaceNote = r.space !== 'personal' ? ` Filed under ${labelOf(r.space)}.` : '';
    return done({
      reply: `Okay, I'll remind you ${speakWhen(new Date(r.remind_at), now, false)} to ${lowerFirst(r.title)}${rule ? `, repeating ${rule}` : ''}.${spaceNote}`,
      item: publicItem(r),
    });
  }

  case 'task.create': {
    const r = rows[0];
    let due = '';
    if (r.due_at) {
      const d = new Date(r.due_at);
      due = `, due ${speakWhen(d, now, isEndOfDay(d))}`;
    }
    const spaceNote = r.space !== 'personal' ? ` Filed under ${labelOf(r.space)}.` : '';
    return done({ reply: `Added "${r.title}" to your tasks${due}.${spaceNote}`, item: publicItem(r) });
  }

  case 'date.create': {
    const r = rows[0];
    const rule = rruleSpeak(r.recurrence);
    const advance = (Array.isArray(r.advance_days) ? r.advance_days : []).map(advanceWord).join(' and ');
    const spaceNote = r.space !== 'personal' ? ` Filed under ${labelOf(r.space)}.` : '';
    return done({
      reply: `Saved ${r.title} ${speakWhen(new Date(r.due_at), now, true)}${rule ? `, repeating ${rule}` : ''}.${advance ? ` I'll remind you ${advance}.` : ''}${spaceNote}`,
      item: publicItem(r),
    });
  }

  case 'item.list': {
    const { type, scope } = plan.data;
    const nouns = { reminder: ['reminder', 'reminders'], task: ['task', 'tasks'], date: ['important date', 'important dates'], any: ['item', 'items'] }[type];
    const phrase = { today: 'today', upcoming: 'coming up this week', overdue: 'overdue', all: 'open' }[scope];
    const items = rows.map(publicItem);
    if (rows.length === 0) {
      const none = scope === 'all' ? `You have no open ${nouns[1]}.`
        : scope === 'overdue' ? `You have no overdue ${nouns[1]}.`
          : `You have no ${nouns[1]} ${phrase}.`;
      return done({ reply: none, items });
    }
    const n = rows.length;
    const head = scope === 'all' ? `You have ${n} open ${n === 1 ? nouns[0] : nouns[1]}.` : `You have ${n} ${n === 1 ? nouns[0] : nouns[1]} ${phrase}.`;
    const spoken = rows.slice(0, 5).map(itemSentence);
    const more = n > 5 ? ` And ${n - 5} more.` : '';
    return done({ reply: `${head} ${spoken.join('. ')}.${more}`, items });
  }

  case 'item.complete':
  case 'item.cancel': {
    const r = rows[0];
    const count = Number(r.match_count);
    const query = plan.data.query;
    if (count === 0) return done({ reply: `I couldn't find an open item matching "${query}".` });
    if (count === 1 && r.updated) {
      const u = r.updated;
      return done({
        reply: plan.data.closing === 'done' ? `Done. I marked "${u.title}" as complete.` : `Okay, I cancelled "${u.title}".`,
        item: { id: u.id, type: u.type, title: u.title, space: u.space, status: plan.data.closing },
      });
    }
    const titles = (Array.isArray(r.candidates) ? r.candidates : []).map((c) => c.title);
    return done({ reply: `I found ${count} matches: ${titles.join(', ')}. Which one do you mean?`, needs_clarification: true, candidates: r.candidates || [] });
  }

  case 'space.create': {
    const r = rows[0] || {};
    if (r.slug) return done({ reply: `Created the ${r.label} space.`, space: { slug: r.slug, label: r.label } });
    return done({ reply: `You already have a space called ${plan.data.label}.` });
  }

  default:
    return done({ ok: false, reply: "Sorry, something went wrong on my side.", error: 'unhandled_intent' });
}
