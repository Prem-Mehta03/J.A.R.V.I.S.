import * as L from './logic.js';

const LS = { url: 'jarvis.url', token: 'jarvis.token', cache: 'jarvis.cache', chat: 'jarvis.chat' };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

const state = {
  tab: 'today', space: 'all', items: [], spaces: [], loadedAt: null, busy: false,
  status: '', statusErr: false, chat: [], sheet: null,
};
try { state.chat = JSON.parse(store.get(LS.chat) || '[]').slice(-40); } catch (e) { state.chat = []; }
try {
  const c = JSON.parse(store.get(LS.cache) || 'null');
  if (c) { state.items = c.items || []; state.spaces = c.spaces || []; state.loadedAt = new Date(c.at); }
} catch (e) { /* ignore */ }

const root = document.getElementById('app');
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
async function call(path, body, timeoutMs = 75000) {
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
    return { ok: false, error: 'network', reply: e.name === 'AbortError' ? 'Jarvis is taking too long. Try again in a minute.' : 'Cannot reach Jarvis. Check your connection.' };
  } finally { clearTimeout(timer); }
}

async function refresh() {
  state.busy = true; setStatus('Jarvis is waking up. This can take up to a minute.', false, true);
  const r = await call('jarvis-items', { action: 'list' });
  state.busy = false;
  if (r.ok) {
    state.items = r.items || []; state.spaces = r.spaces || []; state.loadedAt = new Date();
    store.set(LS.cache, JSON.stringify({ items: state.items, spaces: state.spaces, at: state.loadedAt.toISOString() }));
    setStatus('');
  } else {
    setStatus((state.loadedAt ? `Showing the list from ${L.timeAgo(state.loadedAt, new Date())}. ` : '') + r.reply, true, true);
  }
  render();
}

async function closeItem(item, action) {
  state.sheet = null; render();
  const r = await call('jarvis-items', { action, id: item.id });
  if (r.ok || r.error === 'not_found') {
    state.items = state.items.filter((i) => i.id !== item.id);
    store.set(LS.cache, JSON.stringify({ items: state.items, spaces: state.spaces, at: (state.loadedAt || new Date()).toISOString() }));
    setStatus(action === 'complete' ? 'Marked done.' : 'Cancelled.');
  } else setStatus(r.reply, true);
  render();
}

async function ask(text) {
  text = text.trim(); if (!text || state.busy) return;
  state.chat.push({ who: 'me', text }); state.busy = true; render();
  const r = await call('jarvis', { text, source: 'app' });
  state.busy = false;
  state.chat.push({ who: 'bot', text: r.reply || 'No answer came back.', err: r.ok === false });
  state.chat = state.chat.slice(-40); store.set(LS.chat, JSON.stringify(state.chat));
  render();
  if (r.ok) refresh();
}

function setStatus(text, err = false, silentRender = false) {
  state.status = text; state.statusErr = err;
  if (!silentRender) render();
}

// ---------- views ----------
const ago = () => (state.loadedAt ? ' · ' + L.timeAgo(state.loadedAt, new Date()) : '');

function itemButton(item, now, opts = {}) {
  const t = L.itemTime(item);
  const bits = [];
  if (opts.showWhen && t) bits.push(L.fmtDay(t, now) + (item.type === 'task' && L.isEndOfDay(t) ? '' : ', ' + L.fmtTime(t)));
  if (item.space && item.space !== 'personal') bits.push(item.space);
  const rep = L.repeatText(item.recurrence); if (rep) bits.push(rep);
  return el('button', { class: 'entry', onclick: () => { state.sheet = item; render(); } },
    el('div', { class: 'title' }, item.title),
    bits.length ? el('div', { class: 'meta' }, bits.join(' · ')) : null);
}

function chipsRow() {
  const slugs = [{ slug: 'all', label: 'All' }, ...state.spaces];
  if (state.spaces.length < 2) return null;
  return el('div', { class: 'chips', role: 'group', 'aria-label': 'Space' },
    slugs.map((s) => el('button', { class: 'chip', 'aria-pressed': String(state.space === s.slug), onclick: () => { state.space = s.slug; render(); } }, s.label || s.slug)));
}

function emptyBox(title, hint) { return el('div', { class: 'empty' }, el('strong', {}, title), hint); }

function todayView(now) {
  const items = L.filterSpace(state.items, state.space);
  const g = L.groupToday(items, now);
  const d = L.longDate(now);
  const v = [el('div', { class: 'head' }, el('h1', {}, `${d.weekday}, ${d.day}`), el('p', {}, L.summarizeToday(g)))];
  v.push(chipsRow());
  if (g.overdue.length) {
    v.push(el('h2', { class: 'sec alarm' }, 'Overdue'), el('ul', { class: 'list' }, g.overdue.map((i) => el('li', {}, itemButton(i, now, { showWhen: true })))));
  }
  const rows = [];
  const nowRow = () => el('li', { class: 'now' }, el('span', { class: 't' }, L.fmtTime(now)), el('span', { class: 'line' }));
  g.rail.forEach((e, idx) => {
    if (idx === g.nowIndex) rows.push(nowRow());
    rows.push(el('li', { class: 'row' + (e.past ? ' past' : '') }, el('span', { class: 't' }, e.label), el('div', { class: 'body' }, itemButton(e.item, now))));
  });
  if (g.nowIndex >= g.rail.length) rows.push(nowRow());
  v.push(el('h2', { class: 'sec' }, 'Today'), el('ol', { class: 'rail' }, rows));
  if (!g.rail.length) v.push(emptyBox('Nothing scheduled today', 'Ask Jarvis to remind you of something.'));
  if (g.tomorrow.length) v.push(el('h2', { class: 'sec' }, 'Tomorrow'), el('ul', { class: 'list' }, g.tomorrow.map((i) => el('li', {}, itemButton(i, now, { showWhen: true })))));
  return v;
}

function groupedList(title, arr, now, late = false) {
  if (!arr.length) return [];
  return [el('h2', { class: 'sec' + (late ? ' alarm' : '') }, title), el('ul', { class: 'list' }, arr.map((i) => el('li', {}, itemButton(i, now, { showWhen: true }))))];
}

function tasksView(now) {
  const g = L.groupTasks(L.filterSpace(state.items, state.space), now);
  const v = [el('div', { class: 'head' }, el('h1', {}, 'Tasks')), chipsRow(),
    ...groupedList('Overdue', g.overdue, now, true), ...groupedList('Today', g.today, now),
    ...groupedList('Upcoming', g.upcoming, now), ...groupedList('No date', g.none, now)];
  if (!(g.overdue.length + g.today.length + g.upcoming.length + g.none.length)) v.push(emptyBox('No open tasks', 'Say "add a task to ..." in Ask.'));
  return v;
}

function remindersView(now) {
  const g = L.groupReminders(L.filterSpace(state.items, state.space), now);
  const v = [el('div', { class: 'head' }, el('h1', {}, 'Reminders')), chipsRow(),
    ...groupedList('Waiting to fire', g.earlier, now, true), ...groupedList('Today', g.today, now),
    ...groupedList('Tomorrow', g.tomorrow, now), ...groupedList('Later', g.later, now)];
  if (!(g.earlier.length + g.today.length + g.tomorrow.length + g.later.length)) v.push(emptyBox('No reminders', 'Say "remind me at 6 pm to ..." in Ask.'));
  return v;
}

function datesView(now) {
  const list = L.listDates(L.filterSpace(state.items, state.space), now);
  const v = [el('div', { class: 'head' }, el('h1', {}, 'Dates')), chipsRow()];
  if (!list.length) v.push(emptyBox('No important dates', 'Say "my mom\'s birthday is March 3rd" in Ask.'));
  else v.push(el('ul', { class: 'list' }, list.map(({ item, days }) => el('li', {},
    el('button', { class: 'entry', onclick: () => { state.sheet = item; render(); } },
      el('div', { class: 'date-row' },
        el('div', { class: 'num' + (days === 0 ? ' today' : '') }, days === 0 ? 'Today' : String(days), days === 0 ? null : el('small', {}, days === 1 ? 'day' : 'days')),
        el('div', {}, el('div', { class: 'title' }, item.title), el('div', { class: 'meta' }, L.fmtShortDate(L.itemTime(item), now) + (L.repeatText(item.recurrence) ? ' · ' + L.repeatText(item.recurrence) : '')))))))));
  return v;
}

const SUGGESTIONS = ['remind me tomorrow at 6 pm to call home', 'add a task to finish the lab report by Friday', 'what is on my list today', "what's the weather"];

function askView() {
  const msgs = state.chat.map((m) => el('div', { class: 'msg ' + m.who + (m.err ? ' err' : '') }, m.text));
  if (state.busy) msgs.push(el('div', { class: 'msg bot' }, 'Thinking…'));
  const v = [el('div', { class: 'head' }, el('h1', {}, 'Ask Jarvis')), el('div', { class: 'chat' }, msgs)];
  if (!state.chat.length) v.push(el('div', { class: 'suggest' }, SUGGESTIONS.map((s) => el('button', { class: 'chip', onclick: () => ask(s) }, s))));
  return v;
}

function sheetView(now) {
  const item = state.sheet; const t = L.itemTime(item);
  const when = t ? L.fmtDay(t, now) + (item.type === 'date' || (item.type === 'task' && L.isEndOfDay(t)) ? '' : ', ' + L.fmtTime(t)) : 'No date';
  const doneLabel = item.type === 'date' ? 'Remove' : 'Mark done';
  return el('div', { class: 'scrim', onclick: (e) => { if (e.target === e.currentTarget) { state.sheet = null; render(); } } },
    el('div', { class: 'sheet', role: 'dialog', 'aria-label': item.title },
      el('h2', {}, item.title), el('p', { class: 'meta' }, when + (item.space ? ' · ' + item.space : '')),
      el('button', { class: 'btn', onclick: () => closeItem(item, 'complete') }, doneLabel),
      item.type === 'date' ? null : el('button', { class: 'btn quiet', onclick: () => closeItem(item, 'cancel') }, 'Cancel it'),
      el('button', { class: 'btn quiet', onclick: () => { state.sheet = null; render(); } }, 'Close')));
}

function setupView(error = '') {
  const url = el('input', { id: 'su-url', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', placeholder: 'your-server.onrender.com', value: store.get(LS.url) || '' });
  const tok = el('input', { id: 'su-token', type: 'password', autocomplete: 'off', placeholder: 'Jarvis token', value: store.get(LS.token) || '' });
  const err = el('div', { class: 'err' }, error);
  const form = el('form', { class: 'setup', onsubmit: (e) => {
    e.preventDefault();
    const p = L.parseServerUrl(url.value);
    if (!p.ok) { err.textContent = p.error; return; }
    if (!tok.value.trim()) { err.textContent = 'Enter your Jarvis token.'; return; }
    store.set(LS.url, p.url); store.set(LS.token, tok.value.trim());
    boot();
  } },
    el('h1', {}, 'Connect Jarvis'),
    el('p', {}, 'Enter the address of your server and your token. They stay on this device.'),
    el('label', { for: 'su-url' }, 'Server address', url), el('label', { for: 'su-token' }, 'Token', tok), err,
    el('button', { class: 'btn', type: 'submit' }, 'Connect'));
  root.replaceChildren(form);
}

const TABS = [['today', 'Today'], ['ask', 'Ask'], ['tasks', 'Tasks'], ['reminders', 'Reminders'], ['dates', 'Dates']];

function render() {
  const now = new Date();
  const views = { today: () => todayView(now), ask: askView, tasks: () => tasksView(now), reminders: () => remindersView(now), dates: () => datesView(now) };
  const view = el('div', { class: 'view', id: 'view' }, views[state.tab]());
  if (state.tab === 'dates') view.append(el('p', { class: 'meta' }, el('button', { class: 'chip', onclick: () => { store.del(LS.token); setupView(); } }, 'Change server or token')));
  const parts = [view];
  if (state.status) parts.push(el('div', { class: 'status' + (state.statusErr ? ' err' : ''), role: 'status' }, state.status));
  if (state.tab === 'ask') {
    const input = el('input', { id: 'ask-input', type: 'text', enterkeyhint: 'send', autocomplete: 'off', placeholder: 'Ask or tell Jarvis', 'aria-label': 'Message' });
    parts.push(el('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); const t = input.value; input.value = ''; ask(t); } }, input, el('button', { class: 'btn', type: 'submit', disabled: state.busy }, 'Send')));
  }
  parts.push(el('nav', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) =>
    el('button', { role: 'tab', 'aria-selected': String(state.tab === id), onclick: () => { state.tab = id; render(); } }, label))));
  if (state.sheet) parts.push(sheetView(now));
  const prev = document.getElementById('view'); const top = prev ? prev.scrollTop : 0;
  const keep = state.tab === 'ask' && document.activeElement && document.activeElement.id === 'ask-input';
  root.replaceChildren(...parts);
  const nv = document.getElementById('view'); if (nv) nv.scrollTop = state.tab === 'ask' ? nv.scrollHeight : top;
  if (keep) document.getElementById('ask-input').focus();
}

function boot() {
  if (!store.get(LS.url) || !store.get(LS.token)) { setupView(); return; }
  render(); refresh();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && store.get(LS.url) && !state.busy) refresh(); });
setInterval(() => { if (!document.hidden && store.get(LS.url) && !state.sheet && state.tab !== 'ask') render(); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
