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
        { ctx: { now_iso: ctx.now_iso, source: ctx.source, home_location: build.home_location || null, spaces } },
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
let L = parseLlmJson(text);

const STOP_WORDS = new Set(['the', 'a', 'an', 'my', 'to', 'with', 'for', 'of', 'on', 'in', 'and', 'it', 'that', 'this', 'is', 'up', 'off', 'i']);
const stem = (word) => {
  let w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 3 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  if (w.length > 3 && /([^aeiou0-9])\1$/.test(w) && !/(ll|ss|ff|zz)$/.test(w)) w = w.slice(0, -1);
  return w;
};
const stemsOf = (query) => {
  const words = query.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const kept = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  return [...new Set((kept.length ? kept : words).map(stem).filter(Boolean))];
};

if (!L || typeof L.intent !== 'string') {
  return ask("Sorry, I didn't understand that. Could you say it another way?", { ok: false, error: 'bad_llm_output', provider });
}

// "Done, charge laptop" / "I finished X" is always a request to close something, whatever the model decided.
// If the words fit a habit the user tracks (and no open item), it is a habit check-in instead.
const DONE_LEAD = /^\s*(?:(?:i|i've|i have|ive)\s+)?(?:done|finished|completed)\b[\s,:.-]*(?:with\s+)?(\S.*)$/i;
const doneMatch = DONE_LEAD.exec(ctx.text || '');
if (doneMatch && ['reminder.create', 'task.create', 'date.create', 'chat', 'clarify', 'unsupported', 'item.complete'].includes(L.intent)) {
  const q = doneMatch[1];
  const fits = (titles) => titles.some((t) => stemsOf(q).every((st) => String(t).toLowerCase().includes(st)));
  L = fits(build.habits || []) && !fits(build.open_titles || [])
    ? { intent: 'habit.log', query: q, scope: 'today' }
    : { intent: 'item.complete', query: q };
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
where status = 'open' and parent_id is null
  and ($1 = 'any' or type = $1)
  and ($2 = '' or space = $2)
  and ($5 = 'all' or (coalesce(remind_at, due_at) >= $3::timestamptz and coalesce(remind_at, due_at) < $4::timestamptz))
order by coalesce(remind_at, due_at) nulls last, created_at
limit 20`;

// Matches by word stems, so "charging laptop" finds "Charge laptop". All stems must appear in the title.
// $1 type or 'any', $2 stems as a text array literal, $3 new status, $4 the words as said (an exact title wins).
const CLOSE_SQL = `with cand as (
  select id, type, title from jarvis.items
  where status = 'open' and parent_id is null and type in ('reminder', 'task', 'date') and ($1 = 'any' or type = $1)
    and not exists (select 1 from unnest($2::text[]) s where lower(title) not like '%' || s || '%')
),
matches as (
  select * from cand
  where lower(title) = lower($4) or not exists (select 1 from cand where lower(title) = lower($4))
),
updated as (
  update jarvis.items set status = $3
  where id in (select id from matches) and (select count(*) from matches) = 1
  returning id, type, title, space
),
kids as (
  update jarvis.items set status = 'cancelled'
  where parent_id in (select id from updated) and status = 'open'
  returning id
)
select (select count(*) from matches) as match_count,
       (select json_agg(json_build_object('id', m.id, 'title', m.title, 'type', m.type)) from (select * from matches limit 5) m) as candidates,
       (select row_to_json(u) from updated u) as updated`;


const HABIT_SQL = `with ex as (select id, title from jarvis.items where type = 'habit' and status = 'active' and lower(title) = lower($1) limit 1),
ins as (insert into jarvis.items (type, title, status, target_per_week, source)
        select 'habit', $1, 'active', $2::int, $3 where not exists (select 1 from ex) returning id, title)
select id, title, false as existing from ins union all select id, title, true from ex`;

const HABIT_LOG_SQL = `with cand as (
  select id, title from jarvis.items
  where type = 'habit' and status = 'active'
    and not exists (select 1 from unnest($1::text[]) s where lower(title) not like '%' || s || '%')
),
matches as (
  select * from cand where lower(title) = lower($3) or not exists (select 1 from cand where lower(title) = lower($3))
),
up as (
  insert into jarvis.habit_logs (habit_id, log_date, done)
  select id, $2::date, true from matches where (select count(*) from matches) = 1
  on conflict (habit_id, log_date) do update set done = true returning habit_id
)
select (select count(*) from matches) as match_count,
       (select json_agg(json_build_object('id', m.id, 'title', m.title)) from (select * from matches limit 5) m) as candidates,
       (select row_to_json(m) from matches m where (select count(*) from matches) = 1) as habit,
       (select coalesce(json_agg(to_char(l.log_date, 'YYYY-MM-DD')), '[]'::json) from jarvis.habit_logs l
        where l.habit_id in (select id from matches) and l.done and (select count(*) from matches) = 1) as dates`;

const HABIT_LIST_SQL = `select i.id, i.title, i.target_per_week,
  (select coalesce(json_agg(to_char(l.log_date, 'YYYY-MM-DD')), '[]'::json) from jarvis.habit_logs l
   where l.habit_id = i.id and l.done and l.log_date >= (now() at time zone 'Asia/Kolkata')::date - 400) as dates
from jarvis.items i where i.type = 'habit' and i.status = 'active' order by i.created_at limit 20`;

const IDEA_SQL = `insert into jarvis.items (type, title, body, status, source) values ('idea', $1, $2, 'new', $3) returning id, title`;
const IDEA_LIST_SQL = `select (select count(*) from jarvis.items where type = 'idea') as total,
  (select coalesce(json_agg(t), '[]'::json) from (select title from jarvis.items where type = 'idea' order by created_at desc limit 3) t) as latest`;

const EMAIL_DIGEST_SQL = `select
  (select coalesce(json_agg(t), '[]'::json) from (
     select account, label, count(*)::int as n from jarvis.email_messages
     where received_at > now() - interval '24 hours' and ($1 = '' or account = $1) group by account, label) t) as counts,
  (select coalesce(json_agg(i), '[]'::json) from (
     select account, coalesce(nullif(sender_name, ''), sender_email) as sender, left(subject, 80) as subject from jarvis.email_messages
     where received_at > now() - interval '24 hours' and label = 'important' and ($1 = '' or account = $1) order by received_at desc limit 12) i) as important,
  (select value #>> '{}' from jarvis.settings where key = 'email_synced_at') as synced_at`;

// Finds recent mail by words in the sender or subject. Only when they all point at one sender is anything changed.
// $1 stems (text array literal), $2 label, $3 account or ''.
const EMAIL_FIND_SQL = `with cand as (
  select id, gmail_id, account, sender_email, sender_name, subject, label, received_at from jarvis.email_messages
  where received_at > now() - interval '14 days' and ($3 = '' or account = $3)
    and not exists (select 1 from unnest($1::text[]) s where lower(sender_name || ' ' || sender_email || ' ' || subject) not like '%' || s || '%')
),
senders as (select account, sender_email, max(sender_name) as sender_name from cand group by account, sender_email),
m as (select * from cand where (select count(*) from senders) = 1 order by received_at desc limit 1),
rule as (
  insert into jarvis.email_rules (account, match_type, match_value, label, source) select account, 'sender', sender_email, $2, 'user' from m
  on conflict (account, match_type, match_value) do update set label = excluded.label, source = 'user' returning id
),
fb as (
  insert into jarvis.email_feedback (message_id, account, sender, subject, llm_label, user_label) select gmail_id, account, sender_email, subject, label, $2 from m returning id
),
upd as (
  update jarvis.email_messages set label = $2, label_source = 'user'
  where (account, sender_email) in (select account, sender_email from m) and received_at > now() - interval '30 days' returning id
)
select (select count(*) from senders)::int as sender_count,
       (select coalesce(json_agg(coalesce(nullif(s.sender_name, ''), s.sender_email)), '[]'::json) from (select * from senders limit 4) s) as candidates,
       (select count(*) from upd)::int as changed,
       (select coalesce(nullif(sender_name, ''), sender_email) from m) as sender`;

// A sender address or a whole domain named outright becomes a rule. $1 sender or '@domain', $2 label, $3 account or '' (both).
const EMAIL_RULE_SQL = `with accts as (select unnest(case when $3 = '' then array['personal', 'college'] else array[$3] end) as account),
r as (
  insert into jarvis.email_rules (account, match_type, match_value, label, source)
  select account, case when $1 like '@%' then 'domain' else 'sender' end, ltrim($1, '@'), $2, 'user' from accts
  on conflict (account, match_type, match_value) do update set label = excluded.label, source = 'user' returning id
),
u as (
  update jarvis.email_messages set label = $2, label_source = 'user'
  where (sender_email = $1 or '@' || split_part(sender_email, '@', 2) = $1) and received_at > now() - interval '30 days' and ($3 = '' or account = $3) returning id
)
select (select count(*) from r)::int as rules, (select count(*) from u)::int as changed`;

const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'proton.me', 'protonmail.com', 'rediffmail.com'];
const mailLabel = (v) => {
  const t = String(v || '').toLowerCase().trim();
  if (['important', 'urgent'].includes(t)) return 'important';
  if (['normal', 'regular', 'ordinary'].includes(t)) return 'normal';
  if (['promo', 'promotion', 'promotions', 'ad', 'ads', 'advert', 'advertisement', 'spam'].includes(t)) return 'promo';
  return '';
};

const SPACE_SQL = `insert into jarvis.spaces (slug, label) values ($1, $2)
on conflict (slug) do nothing
returning slug, label`;

const create = (type, title, whenDate, extra) => {
  const e = extra || {};
  const space = e.space && slugs.includes(e.space) && !ctx.space_hint ? e.space : pickSpace(L.space);
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
    // An exam or event with a clock time keeps it (the alert text says "at 9:30 AM"); other dates are all-day.
    const hasClock = toIst(when).getUTCHours() + toIst(when).getUTCMinutes() > 0;
    if (!hasClock) when = startOfIstDay(when);
    if (startOfIstDay(when).getTime() < startOfIstDay(now).getTime()) {
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
    const isExam = /\b(exam|test|quiz|mid-?sem|compre|viva|assessment)\b/i.test(title);
    if (!advance.length) advance = isExam ? [1] : [7, 1];
    if (isExam && !recurrence) {
      const al = examAlerts(title, when, now);
      const space = !ctx.space_hint && L.space && slugs.includes(L.space) ? L.space : (ctx.space_hint && slugs.includes(ctx.space_hint) ? ctx.space_hint : 'college');
      return finish({
        intent: 'date.create',
        action: 'sql',
        sql: EXAM_CREATE_SQL,
        params: [title, space, when.toISOString(), sourceName, al.a1, al.t1, al.a2, al.t2],
        provider,
        data: { type: 'date', title, space, when_iso: when.toISOString(), recurrence: '', advance_days: [], exam: true },
      });
    }
    return create('date', title, when, { recurrence, advance, space: isExam && !L.space ? 'college' : undefined });
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
    const stems = stemsOf(query);
    if (!query || !stems.length) return ask(closing === 'done' ? 'Which item did you finish?' : 'Which item should I cancel?', { provider });
    return finish({
      intent: L.intent,
      action: 'sql',
      sql: CLOSE_SQL,
      params: ['any', '{' + stems.join(',') + '}', closing, query],
      provider,
      data: { type: 'any', query, closing },
    });
  }

  case 'habit.create': {
    const title = cleanTitle(L.title).slice(0, 60);
    if (!title) return ask('What should the habit be called?', { provider });
    const target = Number.isInteger(L.target) && L.target >= 1 && L.target <= 7 ? L.target : null;
    return finish({ intent: 'habit.create', action: 'sql', sql: HABIT_SQL, params: [title, target, sourceName], provider, data: { title } });
  }

  case 'habit.log': {
    const query = cleanText(L.query || L.title, 100);
    const stems = stemsOf(query);
    if (!query || !stems.length) return ask('Which habit did you do?', { provider });
    const day = L.scope === 'yesterday' ? istDateStr(addDays(now, -1)) : istDateStr(now);
    return finish({
      intent: 'habit.log', action: 'sql', sql: HABIT_LOG_SQL,
      params: ['{' + stems.join(',') + '}', day, query], provider,
      data: { query, day, today: istDateStr(now), yesterday: L.scope === 'yesterday' },
    });
  }

  case 'habit.list':
    return finish({ intent: 'habit.list', action: 'sql', sql: HABIT_LIST_SQL, params: [], provider, data: { today: istDateStr(now) } });

  case 'idea.create': {
    const idea = cleanText(L.text || L.title, 1000);
    if (!idea) return ask('What is the idea?', { provider });
    return finish({ intent: 'idea.create', action: 'sql', sql: IDEA_SQL, params: [idea.slice(0, 80), idea, sourceName], provider, data: {} });
  }

  case 'idea.list':
    return finish({ intent: 'idea.list', action: 'sql', sql: IDEA_LIST_SQL, params: [], provider, data: {} });

  case 'email.digest': {
    const account = ['personal', 'college'].includes(L.account) ? L.account : '';
    return finish({ intent: 'email.digest', action: 'sql', sql: EMAIL_DIGEST_SQL, params: [account], provider, data: { account } });
  }

  case 'email.correct': {
    const label = mailLabel(L.label);
    if (!label) return ask('Should that mail be important, normal, or an ad?', { provider });
    const query = cleanText(L.query || L.title, 100);
    if (!query) return ask('Which sender do you mean?', { provider });
    const account = ['personal', 'college'].includes(L.account) ? L.account : '';
    const addr = query.toLowerCase().replace(/\s+/g, '');
    const isAddress = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(addr);
    const isDomain = /^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(addr) && !isAddress;
    if (isAddress || isDomain) {
      const sender = isAddress ? addr : '@' + addr.replace(/^@/, '');
      if (isDomain && FREE_MAIL.includes(sender.slice(1))) return ask(`I won't file every ${sender.slice(1)} address the same way. Tell me the sender's name or full address.`, { provider });
      return finish({ intent: 'email.correct', action: 'sql', sql: EMAIL_RULE_SQL, params: [sender, label, account], provider, data: { mode: 'rule', sender, label } });
    }
    const stems = stemsOf(query);
    if (!stems.length) return ask('Which sender do you mean?', { provider });
    return finish({ intent: 'email.correct', action: 'sql', sql: EMAIL_FIND_SQL, params: ['{' + stems.join(',') + '}', label, account], provider, data: { mode: 'find', query, label } });
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
