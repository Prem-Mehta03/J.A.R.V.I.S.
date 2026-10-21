import * as L from './logic.js';
import { icon } from './icons.js';
import { attachOrb, setOrbMode, setOrbLevel } from './orb.js';
import { canSpeak, deviceVoices, createSpeaker } from './voice.js';
import { createVoiceMode } from './voicemode.js';
import { createLife } from './lifeviews.js';

const LS = { url: 'jarvis.url', token: 'jarvis.token', cache: 'jarvis.cache', chat: 'jarvis.chat', voice: 'jarvis.voice' };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

const state = {
  view: 'chat', space: 'all', drawer: false, sheet: null, search: '',
  items: [], habits: [], ideas: [], spaces: [], loadedAt: null, online: true, busy: false, waking: false,
  status: '', statusErr: false, chat: [], open: { overdue: true, tomorrow: false },
};
try { state.chat = JSON.parse(store.get(LS.chat) || '[]').slice(-40); } catch (e) { state.chat = []; }
try {
  const c = JSON.parse(store.get(LS.cache) || 'null');
  if (c) { state.items = c.items || []; state.habits = c.habits || []; state.ideas = c.ideas || []; state.spaces = c.spaces || []; state.loadedAt = new Date(c.at); }
} catch (e) { /* ignore */ }

const root = document.getElementById('app');
const ui = {};
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
};

// ---------- server ----------
async function call(path, body, timeoutMs = 100000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(store.get(LS.url) + '/webhook/' + path, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Jarvis-Token': store.get(LS.token) || '' },
      body: JSON.stringify(body),
    });
    if (res.status === 403 || res.status === 401) return { ok: false, error: 'auth', reply: 'The token was not accepted. Check it in Settings.' };
    if (!res.ok) return { ok: false, error: 'http', reply: `The server answered with an error (${res.status}).` };
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'network', reply: e.name === 'AbortError' ? 'That took too long. It may still have gone through, so I am checking your list.' : 'Cannot reach Jarvis. Check your connection.' };
  } finally { clearTimeout(timer); }
}

async function callForm(path, form, timeoutMs = 60000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(store.get(LS.url) + '/webhook/' + path, { method: 'POST', body: form, signal: ctl.signal, headers: { 'X-Jarvis-Token': store.get(LS.token) || '' } });
    if (res.status === 403 || res.status === 401) return { ok: false, error: 'auth', reply: 'The token was not accepted. Check it in Settings.' };
    if (!res.ok) return { ok: false, error: 'http', reply: `The server answered with an error (${res.status}).` };
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'network', reply: e.name === 'AbortError' ? 'Transcribing took too long. Try again.' : 'Cannot reach Jarvis. Check your connection.' };
  } finally { clearTimeout(timer); }
}

const NATURAL_VOICES = [['troy', 'Troy (male)'], ['austin', 'Austin (male)'], ['daniel', 'Daniel (male)'], ['autumn', 'Autumn (female)'], ['diana', 'Diana (female)'], ['hannah', 'Hannah (female)']];
function voicePrefs() {
  let p = {}; try { p = JSON.parse(store.get(LS.voice) || '{}') || {}; } catch (e) { p = {}; }
  return { engine: p.engine === 'device' ? 'device' : 'natural', serverVoice: NATURAL_VOICES.some(([k]) => k === p.serverVoice) ? p.serverVoice : 'troy', deviceVoice: p.deviceVoice || '' };
}
const saveVoicePrefs = (p) => store.set(LS.voice, JSON.stringify(p));

const speaker = createSpeaker({
  fetchSpeech: (text, voice) => call('jarvis-speak', { text, voice }, 35000),
  onLevel: (v) => setOrbLevel(v),
});
const voiceMode = createVoiceMode({
  el, speaker, getPrefs: voicePrefs,
  transcribe: (blob) => {
    const form = new FormData();
    form.append('audio', blob, 'voice.' + (blob.type.includes('webm') ? 'webm' : blob.type.includes('ogg') ? 'ogg' : 'm4a'));
    return callForm('jarvis-transcribe', form);
  },
  ask: (text) => call('jarvis', { text, source: 'voice' }),
  onExit: () => { setOrbMode('idle'); refresh(); },
});

const saveCache = () => store.set(LS.cache, JSON.stringify({ items: state.items, habits: state.habits, ideas: state.ideas, spaces: state.spaces, at: (state.loadedAt || new Date()).toISOString() }));

const life = createLife({ el, state, call, setStatus: (t, e) => setStatus(t, e), renderAll: () => renderAll(), renderSheet: () => renderSheet(), saveCache: () => saveCache(), emptyBox: (a, b) => emptyBox(a, b) });

async function refresh() {
  // Only say "waking up" if the server is really slow (a warm server answers in a few seconds).
  const wake = setTimeout(() => setStatus('Jarvis is waking up. This can take up to a minute.'), WAKE_MS);
  const r = await call('jarvis-items', { action: 'list' });
  clearTimeout(wake);
  if (r.ok) {
    state.items = r.items || []; state.habits = r.habits || []; state.ideas = r.ideas || []; state.spaces = r.spaces || []; state.loadedAt = new Date(); state.online = true;
    saveCache(); setStatus('');
  } else {
    state.online = false;
    setStatus((state.loadedAt ? `Showing the list from ${L.timeAgo(state.loadedAt, new Date())}. ` : '') + r.reply, true);
  }
  renderAll();
}

async function closeItem(item, action) {
  state.sheet = null; renderSheet();
  const r = await call('jarvis-items', { action, id: item.id });
  if (r.ok || r.error === 'not_found') {
    state.items = state.items.filter((i) => i.id !== item.id); saveCache();
    setStatus(action === 'complete' ? 'Marked done.' : 'Cancelled.');
  } else setStatus(r.reply, true);
  renderAll();
}

const WAKE_MS = 25000;
let wakeTimer = 0;
async function ask(text) {
  text = text.trim(); if (!text || state.busy) return;
  speaker.stop();
  ui.input.value = ''; syncSend();
  state.chat.push({ who: 'me', text }); state.busy = true; state.waking = false;
  setOrbMode('thinking'); renderMain();
  wakeTimer = setTimeout(() => { state.waking = true; renderMain(); }, WAKE_MS);
  const r = await call('jarvis', { text, source: 'app' });
  clearTimeout(wakeTimer); state.busy = false; state.waking = false;
  state.chat.push({ who: 'bot', text: r.reply || 'No answer came back.', err: r.ok === false, detail: r.detail || '', at: new Date().toISOString() });
  state.chat = state.chat.slice(-40); store.set(LS.chat, JSON.stringify(state.chat));
  setOrbMode('replying'); setTimeout(() => { if (!state.busy && !speaker.speaking) setOrbMode('idle'); }, 2200);
  renderMain(); syncSend();
  if (r.ok || r.error === 'network') refresh();
}

// Read a chat reply aloud (replay button).
function readAloud(text) {
  speaker.unlock();
  speaker.speak(text, voicePrefs(), { onStart: () => setOrbMode('speaking') }).then(() => { if (!state.busy) setOrbMode('idle'); });
}

function openVoiceMode(opts) {
  if (state.busy) return;
  ui.input.blur(); voiceMode.open(opts && opts.autostart === false ? { autostart: false } : {});
}

function setStatus(text, err = false) { state.status = text; state.statusErr = err; if (ui.status) renderStatus(); }

// ---------- navigation ----------
function go(view) {
  state.view = view; state.drawer = false; state.sheet = null; state.search = '';
  renderAll(); ui.main.scrollTop = view === 'chat' ? ui.main.scrollHeight : 0;
}
const openSheet = (item) => { state.sheet = item; renderSheet(); };
const toggleDrawer = (v) => { state.drawer = v; renderDrawer(); if (v) setTimeout(() => ui.drawer.querySelector('button')?.focus(), 50); else ui.menu.focus(); };
function prefill(text) { go('chat'); ui.input.value = text; ui.input.focus(); syncSend(); }

// ---------- shared bits ----------
const visible = () => L.filterSpace(state.items, state.space);
const SPACE_COLORS = ['#bcc7de', '#ffb84d', '#8fd6a8', '#ff9f80', '#c4a7ff'];
const spaceLabel = (slug) => (state.spaces.find((s) => s.slug === slug) || {}).label || slug;

function filterPill() {
  if (state.space === 'all') return null;
  return el('button', { class: 'filter', onclick: () => { state.space = 'all'; renderAll(); }, 'aria-label': 'Show all spaces' },
    icon('folder', 14), spaceLabel(state.space), el('span', { class: 'x' }, icon('close', 12)));
}

function whenText(item, now) {
  const t = L.itemTime(item); if (!t) return '';
  return L.fmtDay(t, now) + (item.type === 'task' && L.isEndOfDay(t) ? '' : ', ' + L.fmtTime(t));
}

function card(item, now, { tone = '', iconName } = {}) {
  const t = L.itemTime(item);
  const late = t && t.getTime() < now.getTime() && item.type !== 'date';
  const meta = [];
  if (t) meta.push(el('span', { class: tone === 'late' || late ? 'late' : tone === 'focus' ? 'gold' : '' }, icon('clock', 13), whenText(item, now)));
  if (item.space && item.space !== 'personal') meta.push(el('span', {}, icon('folder', 13), spaceLabel(item.space)));
  const rep = L.repeatText(item.recurrence); if (rep) meta.push(el('span', {}, icon('repeat', 13), rep));
  return el('button', { class: 'card ' + tone, onclick: () => openSheet(item) },
    el('span', { class: 'circle' }, icon(iconName || (item.type === 'reminder' ? 'bell' : 'circle'), 20)),
    el('span', { class: 'body' }, el('span', { class: 't' }, item.title), meta.length ? el('span', { class: 'm' }, meta) : null));
}

function group(title, items, now, tone = '') {
  if (!items.length) return [];
  return [el('h2', { class: 'sec' + (tone === 'late' ? ' late' : '') }, tone === 'late' ? icon('alert', 14) : null, `${title} (${items.length})`),
    el('ul', { class: 'stack' }, items.map((i) => el('li', {}, card(i, now, { tone }))))];
}

function emptyBox(title, hint) { return el('div', { class: 'empty' }, el('b', {}, title), hint); }

// ---------- views ----------
const SUGGESTIONS = [['alarm', 'Remind me tomorrow at 6 pm to call home'], ['list', 'What is on my list today'], ['cloud', "What's the weather"]];

function chatView() {
  const out = [];
  if (!state.chat.length && !state.busy) {
    const orb = el('canvas', { class: 'orb-big', 'aria-hidden': 'true' });
    attachOrb(orb);
    out.push(el('div', { class: 'hero' }, orb, el('div', { class: 'ready' }, el('span', { class: 'dot live' }), 'JARVIS IS READY')),
      el('div', { class: 'suggest' }, el('h2', { class: 'sec' }, 'Try saying'),
        SUGGESTIONS.map(([ic, text]) => el('button', { class: 'sg', onclick: () => prefill(text) },
          el('span', { class: 'l' }, el('span', { class: 'chip-i' }, icon(ic, 18)), `"${text}"`), el('span', { class: 'out' }, icon('out', 18))))));
    return out;
  }
  const msgs = state.chat.map((m) => {
    if (m.who === 'me') return el('div', { class: 'u' }, m.text);
    return el('div', { class: 'b' },
      el('div', { class: 'b-head' }, el('span', { class: 'avatar' + (m.err ? ' err' : '') }), 'Jarvis', m.at ? el('span', { class: 'when' }, L.fmtTime(new Date(m.at))) : null,
        !m.err ? el('button', { class: 'replay', 'aria-label': 'Read aloud', onclick: () => { if (speaker.speaking) { speaker.stop(); setOrbMode('idle'); } else readAloud(m.text); } }, icon('volume', 16)) : null),
      el('div', { class: 'b-text' }, m.text, m.detail ? el('div', { class: 'detail' }, m.detail) : null));
  });
  if (state.busy) msgs.push(el('div', { class: 'b' }, el('div', { class: 'b-head' }, el('span', { class: 'avatar' }), 'Jarvis'),
    el('div', { class: 'b-text' }, state.waking ? 'Jarvis is waking up. This can take up to a minute.' : el('span', { class: 'dots' }, el('i'), el('i'), el('i')))));
  out.push(el('div', { class: 'thread' }, msgs));
  return out;
}

function todayView(now) {
  const g = L.groupToday(visible(), now);
  const d = L.longDate(now);
  const out = [el('h1', { class: 'h1' }, `${d.weekday}, ${d.day}`), el('p', { class: 'sub' }, L.summarizeToday(g)), filterPill()];
  const nowRow = () => el('li', { class: 'tl-now' }, el('span', { class: 'tl-time' }, L.fmtTime(now)), el('span', { class: 'tl-dot' }),
    el('span', { class: 'line' }, el('i'), el('span', { class: 'pill-now' }, 'NOW')));
  const rows = [];
  g.rail.forEach((e, idx) => {
    if (idx === g.nowIndex) rows.push(nowRow());
    const next = idx === g.nowIndex && !e.allDay && !e.past;
    rows.push(el('li', { class: 'tl-row' + (e.past ? ' past' : '') + (next ? ' next' : '') },
      el('span', { class: 'tl-time' }, e.label), el('span', { class: 'tl-dot' }),
      card(e.item, now, { tone: next ? 'focus' : '', iconName: e.item.type === 'date' ? 'calendar' : e.item.type === 'task' ? 'circle' : 'bell' })));
  });
  if (g.nowIndex >= g.rail.length) rows.push(nowRow());
  out.push(el('h2', { class: 'sec' }, 'Today'), el('ol', { class: 'tl' }, rows));
  if (!g.rail.length) out.push(emptyBox('Nothing scheduled today', 'Ask Jarvis to remind you of something.'));
  const acc = (key, name, items, late, hint) => {
    if (!items.length) return null;
    const open = state.open[key];
    const body = el('div', { class: 'inner', hidden: !open }, items.map((i) => card(i, now, { tone: late ? 'late' : '' })));
    return el('section', { class: 'acc' }, el('button', { 'aria-expanded': String(open), onclick: () => { state.open[key] = !state.open[key]; renderMain(); } },
      el('span', { class: 'name' + (late ? ' late' : '') }, name, late ? el('span', { class: 'num' }, items.length) : el('small', {}, `${items.length} scheduled`)),
      icon(open ? 'down' : 'right', 20)), body);
  };
  out.push(acc('overdue', 'Overdue', g.overdue, true), acc('tomorrow', 'Tomorrow', g.tomorrow, false));
  return out;
}

function tasksView(now) {
  const g = L.groupTasks(visible(), now);
  const n = g.overdue.length + g.today.length + g.upcoming.length + g.none.length;
  const out = [el('h1', { class: 'h1' }, 'Tasks'), el('p', { class: 'sub' }, n ? `${n} open${g.overdue.length ? `, ${g.overdue.length} overdue` : ''}` : 'All clear'), filterPill(),
    ...group('Overdue', g.overdue, now, 'late'), ...group('Today', g.today, now), ...group('Upcoming', g.upcoming, now), ...group('No date', g.none, now)];
  if (!n) out.push(emptyBox('No open tasks', 'Say "add a task to ..." in Chat.'));
  return out;
}

function remindersView(now) {
  const g = L.groupReminders(visible(), now);
  const n = g.earlier.length + g.today.length + g.tomorrow.length + g.later.length;
  const out = [el('h1', { class: 'h1' }, 'Reminders'), el('p', { class: 'sub' }, n ? `${n} coming up` : 'Nothing coming up'), filterPill(),
    ...group('Waiting to fire', g.earlier, now, 'late'), ...group('Today', g.today, now), ...group('Tomorrow', g.tomorrow, now), ...group('Later', g.later, now)];
  if (!n) out.push(emptyBox('No reminders', 'Say "remind me at 6 pm to ..." in Chat.'));
  return out;
}

function datesView(now) {
  const all = L.listDates(visible(), now);
  const list = el('ul', { class: 'stack' });
  const fill = () => {
    const shown = L.searchTitle(all, state.search);
    list.replaceChildren(...shown.map(({ item, days }) => el('li', {}, el('button', { class: 'drow', onclick: () => openSheet(item) },
      el('span', { class: 'badge' + (days <= 7 ? ' soon' : days > 30 ? ' far' : '') }, el('b', {}, days === 0 ? 'Today' : String(days)), days === 0 ? null : el('small', {}, days === 1 ? 'day' : 'days')),
      el('span', { class: 'body' }, el('span', { class: 't' }, item.title), el('div', { class: 'm' }, L.fmtShortDate(L.itemTime(item), now)),
        el('div', { class: 'm2' }, [item.space && item.space !== 'personal' ? spaceLabel(item.space) : '', L.repeatText(item.recurrence)].filter(Boolean).join(' · '))),
      icon('right', 20)))));
    if (!shown.length) list.replaceChildren(el('li', {}, emptyBox(all.length ? 'No dates found' : 'No important dates', all.length ? 'Try a different search.' : 'Ask Jarvis to track a birthday, deadline or event.')));
  };
  fill();
  const input = el('input', { type: 'search', placeholder: 'Search dates', 'aria-label': 'Search dates', value: state.search, autocomplete: 'off',
    oninput: (e) => { state.search = e.target.value; fill(); } });
  return [el('h1', { class: 'h1' }, 'Dates'), el('p', { class: 'sub' }, all.length ? `${all.length} coming up` : 'Nothing coming up'), filterPill(),
    el('div', { class: 'search' }, icon('search', 20), input), list];
}

// ---------- render ----------
const VIEWS = { chat: chatView, today: todayView, tasks: tasksView, reminders: remindersView, dates: datesView, habits: life.habitsView, ideas: life.ideasView };

function renderMain() {
  const now = new Date();
  ui.main.replaceChildren(...VIEWS[state.view](now).filter(Boolean));
  if (state.view === 'chat') ui.main.scrollTop = ui.main.scrollHeight;
  ui.fab.hidden = state.view !== 'dates';
  ui.composer.hidden = state.view !== 'chat';
}

function renderStatus() { ui.status.textContent = state.status; ui.status.className = 'status' + (state.statusErr ? ' err' : ''); ui.status.hidden = !state.status; }

function renderDrawer() {
  const now = new Date();
  const open = state.drawer;
  ui.drawer.classList.toggle('open', open); ui.scrim.classList.toggle('open', open);
  ui.drawer.inert = !open; ui.drawer.setAttribute('aria-hidden', String(!open));
  const todayN = (() => { const g = L.groupToday(state.items, now); return g.rail.length + g.overdue.length; })();
  const cnt = (type) => state.items.filter((i) => i.type === type).length;
  const nav = [['chat', 'chat', 'Chat', null], ['today', 'sun', 'Today', todayN], ['tasks', 'check', 'Tasks', cnt('task')], ['reminders', 'bell', 'Reminders', cnt('reminder')], ['dates', 'calendar', 'Dates', L.listDates(state.items, now).length], ['habits', 'flame', 'Habits', state.habits.filter((h) => !L.streakInfo(h.dates, L.dateStr(now)).doneToday).length], ['ideas', 'bulb', 'Ideas', state.ideas.length]];
  const spaces = [{ slug: 'all', label: 'All spaces' }, ...state.spaces];
  ui.drawer.replaceChildren(
    el('div', { class: 'd-head' },
      el('div', { class: 'd-brand' }, el('img', { src: 'icons/icon-192.png', alt: '' }), el('div', {}, el('b', {}, 'Jarvis'), el('small', {}, 'Personal AI'))),
      el('button', { class: 'icon-btn', 'aria-label': 'Close menu', onclick: () => toggleDrawer(false) }, icon('left', 22))),
    el('div', { class: 'd-status' }, el('span', { class: 'dot' + (state.online ? ' live' : '') }), state.online ? 'Connected' : 'Offline, showing saved list'),
    el('nav', { class: 'nav', 'aria-label': 'Main' }, nav.map(([id, ic, label, n]) =>
      el('button', { 'aria-current': state.view === id ? 'page' : null, onclick: () => go(id) },
        el('span', { class: 'l' }, icon(ic, 20), label), n ? el('span', { class: 'count' + (id === 'reminders' ? ' warm' : '') }, n) : null))),
    el('div', { class: 'hr' }),
    el('div', { class: 'spaces' }, el('h2', { class: 'sec' }, 'Spaces'),
      spaces.map((s, i) => el('button', { 'aria-pressed': String(state.space === s.slug), onclick: () => { state.space = s.slug; state.drawer = false; if (state.view === 'chat') state.view = 'today'; renderAll(); } },
        el('span', { class: 'l' }, el('span', { class: 'sdot', style: null, 'data-c': String(i % SPACE_COLORS.length) }), s.label || s.slug))),
      el('button', { class: 'add-space', onclick: () => prefill('Create a space called ') }, el('span', { class: 'l' }, icon('plus', 18), 'Add space'))),
    el('div', { class: 'd-foot' }, el('button', { onclick: () => { state.drawer = false; setupView('', true); } }, icon('sliders', 20), 'Settings')));
  ui.drawer.querySelectorAll('.sdot').forEach((d) => { d.style.background = SPACE_COLORS[Number(d.dataset.c)]; });
}

function renderSheet() {
  const item = state.sheet;
  ui.sheet.hidden = !item;
  if (!item) { ui.sheet.replaceChildren(); return; }
  if (item.kind) {
    const node = life.sheetFor(item);
    if (node) { ui.sheet.replaceChildren(node); ui.sheet.onclick = (e) => { if (e.target === ui.sheet) { state.sheet = null; renderSheet(); } }; }
    return;
  }
  const now = new Date(); const t = L.itemTime(item);
  const when = t ? L.fmtDay(t, now) + (item.type === 'date' || (item.type === 'task' && L.isEndOfDay(t)) ? '' : ', ' + L.fmtTime(t)) : 'No date';
  const kind = { reminder: 'Reminder', task: 'Task', date: 'Important date' }[item.type] || 'Item';
  const close = () => { state.sheet = null; renderSheet(); };
  ui.sheet.replaceChildren(el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': item.title },
    el('div', { class: 'grab' }),
    el('div', { class: 'sh-top' }, el('div', {}, el('div', { class: 'kick' }, kind), el('h2', {}, item.title),
      el('div', { class: 'pills' }, el('span', {}, icon('clock', 13), when), item.space ? el('span', {}, icon('folder', 13), spaceLabel(item.space)) : null)),
      el('button', { class: 'sh-x', 'aria-label': 'Close', onclick: close }, icon('close', 18))),
    el('button', { class: 'act primary', onclick: () => closeItem(item, 'complete') }, icon('check', 20), item.type === 'date' ? 'Remove' : 'Mark done'),
    item.type === 'date' ? null : el('button', { class: 'act danger', onclick: () => closeItem(item, 'cancel') }, icon('trash', 20), 'Cancel it'),
    el('button', { class: 'act neutral', onclick: close }, 'Close')));
  ui.sheet.onclick = (e) => { if (e.target === ui.sheet) close(); };
}

function renderAll() { renderMain(); renderDrawer(); renderSheet(); renderStatus(); }

function syncSend() { ui.send.classList.toggle('ready', ui.input.value.trim().length > 0); ui.send.disabled = state.busy; }

// ---------- screens ----------
function setupView(error = '', canCancel = false) {
  const url = el('input', { id: 'su-url', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', placeholder: 'your-server.onrender.com', value: store.get(LS.url) || '' });
  const tok = el('input', { id: 'su-token', type: 'password', autocomplete: 'off', placeholder: 'Jarvis token', value: store.get(LS.token) || '' });
  const err = el('div', { class: 'err' }, error);
  const vp = voicePrefs();
  const opt = (v, t, sel) => el('option', { value: v, selected: sel }, t);
  const engine = el('select', { id: 'su-engine' }, opt('natural', 'Natural voice (needs internet)', vp.engine === 'natural'), opt('device', 'Phone voice', vp.engine === 'device'));
  const natural = el('select', { id: 'su-natural' }, NATURAL_VOICES.map(([k, t]) => opt(k, t, k === vp.serverVoice)));
  const devs = deviceVoices();
  const device = el('select', { id: 'su-device' }, opt('', 'Best available', !vp.deviceVoice), devs.map((v) => opt(v.name, `${v.name} (${v.lang})`, v.name === vp.deviceVoice)));
  const current = () => ({ engine: engine.value, serverVoice: natural.value, deviceVoice: device.value });
  const testNote = el('div', { class: 'hint' });
  const test = el('button', { class: 'btn quiet', type: 'button', onclick: async () => {
    speaker.unlock(); testNote.textContent = 'Playing...';
    const r = await speaker.speak('Good evening. I am Jarvis, and this is how I sound.', current());
    testNote.textContent = r.engine === 'natural' ? 'Natural voice works.' : engine.value === 'natural' ? `Natural voice is unavailable (${speaker.lastError || 'no reason given'}). Played the phone voice instead.` : '';
  } }, 'Play a sample');
  const voiceBox = canCancel ? el('div', { class: 'voice-box' }, el('h2', { class: 'sec' }, 'Voice'),
    el('label', { for: 'su-engine' }, 'Spoken replies', engine), el('label', { for: 'su-natural' }, 'Natural voice', natural),
    canSpeak ? el('label', { for: 'su-device' }, 'Phone voice', device) : null, test, testNote) : null;
  root.replaceChildren(el('form', { class: 'setup', onsubmit: (e) => {
    e.preventDefault();
    const p = L.parseServerUrl(url.value);
    if (!p.ok) { err.textContent = p.error; return; }
    if (!tok.value.trim()) { err.textContent = 'Enter your Jarvis token.'; return; }
    store.set(LS.url, p.url); store.set(LS.token, tok.value.trim());
    if (canCancel) saveVoicePrefs(current());
    boot();
  } },
    el('img', { src: 'icons/icon-192.png', alt: '' }),
    el('h1', {}, canCancel ? 'Settings' : 'Connect Jarvis'),
    el('p', {}, 'Your server address and token stay on this device.'),
    el('label', { for: 'su-url' }, 'Server address', url), el('label', { for: 'su-token' }, 'Token', tok), err, voiceBox,
    el('button', { class: 'btn', type: 'submit' }, canCancel ? 'Save' : 'Connect'),
    canCancel ? el('button', { class: 'btn quiet', type: 'button', onclick: () => boot() }, 'Back') : null));
}

function mountShell() {
  ui.menu = el('button', { class: 'icon-btn', 'aria-label': 'Open menu', onclick: () => toggleDrawer(true) }, icon('menu', 24));
  const mini = el('canvas', { class: 'orb-mini', 'aria-hidden': 'true' }); attachOrb(mini, { count: 110, rings: false });
  ui.main = el('main', { class: 'main' });
  ui.status = el('div', { class: 'status', role: 'status' });
  ui.input = el('input', { id: 'ask-input', type: 'text', enterkeyhint: 'send', autocomplete: 'off', placeholder: 'Ask or tell Jarvis...', 'aria-label': 'Message' });
  ui.send = el('button', { class: 'send', type: 'submit', 'aria-label': 'Send' }, icon('send', 22));
  ui.mic = el('button', { class: 'mic', type: 'button', 'aria-label': 'Talk to Jarvis', onclick: openVoiceMode }, icon('mic', 20));
  ui.composer = el('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); ask(ui.input.value); } }, el('div', { class: 'field' }, ui.input, ui.mic), ui.send);
  ui.fab = el('button', { class: 'fab', onclick: () => prefill('My ... is on ') }, icon('plus', 22), 'Add date');
  ui.scrim = el('div', { class: 'scrim', onclick: () => toggleDrawer(false) });
  ui.drawer = el('aside', { class: 'drawer', 'aria-label': 'Menu' });
  ui.sheet = el('div', { class: 'sheet-wrap', hidden: true });
  let calm = 0;
  ui.input.addEventListener('input', () => {
    syncSend();
    if (state.busy) return;
    setOrbMode('listening'); clearTimeout(calm); calm = setTimeout(() => { if (!state.busy) setOrbMode('idle'); }, 1600);
  });
  ui.input.addEventListener('blur', () => { clearTimeout(calm); if (!state.busy) setOrbMode('idle'); });
  root.replaceChildren(el('header', { class: 'top' }, ui.menu, el('div', { class: 'brand' }, 'Jarvis', mini), el('span', { class: 'icon-btn', 'aria-hidden': 'true' })),
    ui.main, ui.status, ui.composer, ui.fab, ui.scrim, ui.drawer, ui.sheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (state.sheet) { state.sheet = null; renderSheet(); } else if (state.drawer) toggleDrawer(false); } });
  syncSend(); renderAll();
}

function boot() {
  if (!store.get(LS.url) || !store.get(LS.token)) { setupView(); return; }
  state.view = 'chat'; setOrbMode('idle'); mountShell(); refresh();
  if (new URLSearchParams(location.search).get('voice') === '1') { history.replaceState(null, '', location.pathname); setTimeout(() => openVoiceMode({ autostart: false }), 300); } // no tap yet, so wait for one (iPhone only plays sound after a touch)
}

// Keep the composer above the iPhone keyboard.
if (window.visualViewport) {
  const fit = () => { root.style.setProperty('--vvh', window.visualViewport.height + 'px'); window.scrollTo(0, 0); };
  window.visualViewport.addEventListener('resize', fit); fit();
}
document.addEventListener('visibilitychange', () => { if (document.hidden && voiceMode.active) voiceMode.close(); if (!document.hidden && ui.main && store.get(LS.url) && !state.busy) refresh(); });
setInterval(() => { if (ui.main && !document.hidden && !state.sheet && !state.drawer && state.view !== 'chat' && state.view !== 'dates') renderMain(); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
