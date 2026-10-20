// Node "Plan": checks what the language model said and decides what to do. The model's output is never trusted:
// every field is validated, and the database is only ever reached through the fixed SQL below with bound parameters.
// @include _lib.js

const ctx = $('Prepare').first().json;
const input = $input.first().json || {};
const now = new Date(ctx.now_iso);

let build = {};
try { build = $('Build request').first().json; } catch (e) { /* not reached when the request was invalid */ }

const spaces = Array.isArray(build.spaces) && build.spaces.length
  ? build.spaces
  : [{ slug: 'personal', label: 'Personal' }, { slug: 'college', label: 'College' }];
const slugs = spaces.map((s) => s.slug);

function finish(plan) {
  return [{
    json: {
      plan: Object.assign(
        { ok: true, intent: 'clarify', action: 'reply', sql: null, params: [], say: null, error: null, provider: null, data: {} },
        plan,
        { ctx: { now_iso: ctx.now_iso, source: ctx.source, home_location: build.home_location || null, calendar_backup: build.calendar_backup !== false, spaces } },
      ),
    },
  }];
}
const ask = (say, extra) => finish(Object.assign({ intent: 'clarify', action: 'reply', say }, extra));

// ---- 1. Read the model's answer ----
if (ctx.invalid) {
  return ask(
    ctx.invalid === 'text_too_long' ? 'That message is too long for me. Could you shorten it?' : "I didn't catch anything. Could you say that again?",
    { ok: false, error: ctx.invalid },
  );
}

let provider = null;
let text = null;
const g = input.candidates && input.candidates[0] && input.candidates[0].content;
if (g && Array.isArray(g.parts)) {
  provider = 'gemini';
  text = g.parts.map((p) => p.text || '').join('');
} else if (input.choices && input.choices[0] && input.choices[0].message) {
  provider = 'groq';
  text = input.choices[0].message.content;
}
if (!text) {
  return ask("I couldn't reach my language models just now. Please try again in a minute.", { ok: false, error: 'llm_unavailable' });
}
const L = parseLlmJson(text);
if (!L || typeof L.intent !== 'string') {
  return ask("Sorry, I didn't understand that. Could you say it another way?", { ok: false, error: 'bad_llm_output', provider });
}

// ---- 2. Validation helpers ----
const cleanText = (value, max) => {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
};
const cleanTitle = (value) => {
  const t = cleanText(value, 200).replace(/[.!]+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
};
const pickSpace = (llmSpace) => {
  if (ctx.space_hint && slugs.includes(ctx.space_hint)) return ctx.space_hint;
  if (typeof llmSpace === 'string' && slugs.includes(llmSpace)) return llmSpace;
  return slugs.includes('personal') ? 'personal' : slugs[0];
};
const validRrule = (value) => (
  typeof value === 'string' && /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,+-]+)*$/.test(value.trim()) ? value.trim() : ''
);
const validType = (value) => (['reminder', 'task', 'date', 'any'].includes(value) ? value : 'any');
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');
const sourceName = { app: 'chat', voice: 'voice', shortcut: 'shortcut' }[ctx.source] || 'chat';

const INSERT_SQL = `insert into jarvis.items (type, title, space, due_at, remind_at, recurrence, advance_days, source)
values ($1, $2, $3, nullif($4, '')::timestamptz, nullif($5, '')::timestamptz, nullif($6, ''), $7::int[], $8)
returning id, type, title, space, due_at, remind_at, recurrence, advance_days`;

const LIST_SQL = `select id, type, title, space, due_at, remind_at, recurrence, advance_days
from jarvis.items
where status = 'open'
  and ($1 = 'any' or type = $1)
  and ($2 = '' or space = $2)
  and ($5 = 'all' or (coalesce(remind_at, due_at) >= $3::timestamptz and coalesce(remind_at, due_at) < $4::timestamptz))
order by coalesce(remind_at, due_at) nulls last, created_at
limit 20`;

const CLOSE_SQL = `with matches as (
  select id, type, title from jarvis.items
  where status = 'open' and ($1 = 'any' or type = $1) and title ilike '%' || $2 || '%'
),
updated as (
  update jarvis.items set status = $3
  where id in (select id from matches) and (select count(*) from matches) = 1
  returning id, type, title, space, calendar_event_id
)
select (select count(*) from matches) as match_count,
       (select json_agg(json_build_object('id', m.id, 'title', m.title, 'type', m.type)) from (select * from matches limit 5) m) as candidates,
       (select row_to_json(u) from updated u) as updated`;

const SPACE_SQL = `insert into jarvis.spaces (slug, label) values ($1, $2)
on conflict (slug) do nothing
returning slug, label`;

const create = (type, title, whenDate, extra) => {
  const e = extra || {};
  const space = pickSpace(L.space);
  const dueIso = (type === 'task' || type === 'date') && whenDate ? whenDate.toISOString() : '';
  const remindIso = type === 'reminder' ? whenDate.toISOString() : '';
  const advance = type === 'date' ? `{${(e.advance || [7, 1]).join(',')}}` : '{}';
  return finish({
    intent: `${type}.create`,
    action: 'sql',
    sql: INSERT_SQL,
    params: [type, title, space, dueIso, remindIso, e.recurrence || '', advance, sourceName],
    provider,
    data: { type, title, space, when_iso: whenDate ? whenDate.toISOString() : null, recurrence: e.recurrence || '', advance_days: type === 'date' ? (e.advance || [7, 1]) : [] },
  });
};

// ---- 3. Decide ----
switch (L.intent) {
  case 'reminder.create': {
    const title = cleanTitle(L.title);
    if (!title) return ask('What should I remind you about?', { provider });
    const when = parseWhen(L.when);
    if (!when) return ask(`When should I remind you to ${lowerFirst(title)}?`, { provider });
    const recurrence = validRrule(L.recurrence);
    if (when.getTime() < now.getTime() - 30000 && !recurrence) {
      return ask(`That time has already passed. When should I remind you to ${lowerFirst(title)}?`, { provider });
    }
    return create('reminder', title, when, { recurrence });
  }

  case 'task.create': {
    const title = cleanTitle(L.title);
    if (!title) return ask('What is the task?', { provider });
    const when = L.when ? parseWhen(L.when) : null;
    return create('task', title, when, {});
  }

  case 'date.create': {
    const title = cleanTitle(L.title);
    if (!title) return ask('What date should I remember?', { provider });
    let when = parseWhen(L.when);
    if (!when) return ask(`What is the date for ${lowerFirst(title)}?`, { provider });
    const recurrence = validRrule(L.recurrence);
    when = startOfIstDay(when);
    if (when.getTime() < startOfIstDay(now).getTime()) {
      if (recurrence === 'FREQ=YEARLY') {
        // Roll a past birthday or anniversary forward to its next occurrence.
        const d = toIst(when);
        let year = toIst(now).getUTCFullYear();
        let next = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MIN * 60000);
        if (next.getTime() < startOfIstDay(now).getTime()) {
          year += 1;
          next = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MIN * 60000);
        }
        when = next;
      } else {
        return ask('That date has already passed. Did you mean a different date?', { provider });
      }
    }
    let advance = Array.isArray(L.advance_days)
      ? L.advance_days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 365).slice(0, 5)
      : [];
    if (!advance.length) advance = [7, 1];
    return create('date', title, when, { recurrence, advance });
  }

  case 'item.list': {
    const type = validType(L.type);
    const scope = ['today', 'upcoming', 'overdue', 'all'].includes(L.scope) ? L.scope : 'upcoming';
    const space = ctx.space_hint && slugs.includes(ctx.space_hint) ? ctx.space_hint
      : (typeof L.space === 'string' && slugs.includes(L.space) ? L.space : '');
    const dayStart = startOfIstDay(now);
    let from = dayStart;
    let to = addDays(dayStart, 1);
    if (scope === 'upcoming') to = addDays(dayStart, 8);
    if (scope === 'overdue') { from = new Date(0); to = now; }
    return finish({
      intent: 'item.list',
      action: 'sql',
      sql: LIST_SQL,
      params: [type, space, from.toISOString(), to.toISOString(), scope],
      provider,
      data: { type, scope, space },
    });
  }

  case 'item.complete':
  case 'item.cancel': {
    const closing = L.intent === 'item.complete' ? 'done' : 'cancelled';
    const query = cleanText(L.query || L.title, 100);
    if (!query) return ask(closing === 'done' ? 'Which item did you finish?' : 'Which item should I cancel?', { provider });
    const type = validType(L.type);
    return finish({
      intent: L.intent,
      action: 'sql',
      sql: CLOSE_SQL,
      params: [type, escapeLike(query), closing],
      provider,
      data: { type, query, closing },
    });
  }

  case 'space.create': {
    const label = cleanText(L.space_label || L.title, 40).replace(/[^A-Za-z0-9 &-]/g, '').trim();
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    if (!slug) return ask('What should the new space be called?', { provider });
    return finish({ intent: 'space.create', action: 'sql', sql: SPACE_SQL, params: [slug, label], provider, data: { slug, label } });
  }

  case 'weather': {
    const place = cleanText(L.place, 80);
    return finish({
      intent: 'weather',
      action: 'weather',
      provider,
      data: { place, scope: L.scope === 'tomorrow' ? 'tomorrow' : 'today' },
    });
  }

  case 'chat': {
    const say = cleanText(L.reply, 500);
    return finish({ intent: 'chat', action: 'reply', say: say || "I'm not sure how to answer that.", provider });
  }

  case 'unsupported': {
    const say = cleanText(L.reply, 200);
    return finish({ intent: 'unsupported', action: 'reply', say: say || "I can't do that yet.", provider });
  }

  case 'clarify': {
    const say = cleanText(L.reply, 200);
    return finish({ intent: 'clarify', action: 'reply', say: say || 'Could you tell me a bit more?', provider });
  }

  default:
    return ask("Sorry, I didn't understand that. Could you say it another way?", { ok: false, error: 'unknown_intent', provider });
}
