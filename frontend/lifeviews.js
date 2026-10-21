// The Habits and Ideas screens and their sheets. Kept apart from app.js; everything it needs from the app is passed in.
import * as L from './logic.js';
import { icon } from './icons.js';

export function createLife({ el, state, call, setStatus, renderAll, renderSheet, saveCache, emptyBox }) {
  const today = () => L.dateStr(new Date());
  const habitById = (id) => state.habits.find((h) => h.id === id);
  const ideaById = (id) => state.ideas.find((i) => i.id === id);
  const closeSheet = () => { state.sheet = null; renderSheet(); };

  // ---------- habits ----------
  async function setDay(habit, date, done) {
    const before = habit.dates;
    habit.dates = L.withDay(habit.dates, date, done); // show it at once, undo if the server says no
    renderAll();
    const r = await call('jarvis-items', { action: 'habit_log', id: habit.id, date, done });
    if (!r.ok) { habit.dates = before; setStatus(r.reply || 'Could not save that check-in.', true); } else saveCache();
    renderAll();
  }

  async function addHabit(input) {
    const title = input.value.trim(); if (!title) return;
    input.disabled = true;
    const r = await call('jarvis-items', { action: 'habit_create', title });
    input.disabled = false;
    if (!r.ok) { setStatus(r.reply || 'Could not add the habit.', true); return; }
    input.value = '';
    if (!habitById(r.habit.id)) state.habits.push({ id: r.habit.id, title: r.habit.title, space: 'personal', target_per_week: null, dates: [] });
    setStatus(r.habit.existing ? 'You already track that.' : 'Habit added.'); saveCache(); renderAll();
  }

  async function archiveHabit(habit) {
    closeSheet();
    const r = await call('jarvis-items', { action: 'habit_archive', id: habit.id });
    if (r.ok || r.error === 'not_found') { state.habits = state.habits.filter((h) => h.id !== habit.id); saveCache(); setStatus('Habit archived.'); } else setStatus(r.reply, true);
    renderAll();
  }

  function habitsView() {
    const t = today();
    const list = el('ul', { class: 'stack' });
    const doneCount = state.habits.filter((h) => L.streakInfo(h.dates, t).doneToday).length;
    for (const h of state.habits) {
      const info = L.streakInfo(h.dates, t);
      list.append(el('li', {}, el('div', { class: 'hcard' + (info.doneToday ? ' done' : '') },
        el('button', { class: 'hcheck', 'aria-label': info.doneToday ? `Undo ${h.title} for today` : `Mark ${h.title} done today`, 'aria-pressed': String(info.doneToday),
          onclick: () => setDay(h, t, !info.doneToday) }, icon(info.doneToday ? 'check' : 'circle', 28)),
        el('button', { class: 'hbody', onclick: () => { state.sheet = { kind: 'habit', id: h.id, ...(() => { const [y, m] = t.split('-').map(Number); return { y, m: m - 1 }; })() }; renderSheet(); } },
          el('span', { class: 't' }, h.title),
          el('span', { class: 'strip', 'aria-hidden': 'true' }, L.lastDays(h.dates, t).map((d) => el('i', { class: (d.done ? 'on' : '') + (d.today ? ' now' : ''), title: d.date }))),
          h.target_per_week ? el('span', { class: 'm2' }, `${L.weekCount(h.dates, t)} of ${h.target_per_week} this week`) : null),
        el('span', { class: 'flame' + (info.current ? ' lit' : ''), 'aria-label': `${info.current} day streak` }, icon('flame', 20), el('b', {}, String(info.current))))));
    }
    if (!state.habits.length) list.append(el('li', {}, emptyBox('No habits yet', 'Add one below, or say "start a habit of meditating" in Chat.')));
    const input = el('input', { type: 'text', placeholder: 'New habit, for example Meditate', 'aria-label': 'New habit', maxlength: '60', autocomplete: 'off', enterkeyhint: 'done' });
    const add = el('form', { class: 'addbox', onsubmit: (e) => { e.preventDefault(); addHabit(input); } }, input, el('button', { class: 'addbtn', type: 'submit' }, icon('plus', 18), 'Add'));
    return [el('h1', { class: 'h1' }, 'Habits'),
      el('p', { class: 'sub' }, state.habits.length ? `${doneCount} of ${state.habits.length} done today` : 'Nothing tracked yet'), add, list];
  }

  function habitSheet(s) {
    const h = habitById(s.id);
    if (!h) { closeSheet(); return null; }
    const t = today();
    const info = L.streakInfo(h.dates, t);
    const done = new Set(h.dates);
    const grid = L.monthGrid(s.y, s.m);
    const nowMonth = { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 };
    const atNow = s.y === nowMonth.y && s.m === nowMonth.m;
    const go = (d) => { const n = L.shiftMonth(s, d); state.sheet = { ...s, ...n }; renderSheet(); };
    const stat = (n, label) => el('div', { class: 'stat' }, el('b', {}, String(n)), el('small', {}, label));
    return el('div', { class: 'sheet habit-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': h.title },
      el('div', { class: 'grab' }),
      el('div', { class: 'sh-top' }, el('div', {}, el('div', { class: 'kick' }, 'Habit'), el('h2', {}, h.title)),
        el('button', { class: 'sh-x', 'aria-label': 'Close', onclick: closeSheet }, icon('close', 18))),
      el('div', { class: 'stats' }, stat(info.current, 'Streak'), stat(info.best, 'Best'), stat(info.total, 'Total'),
        stat(h.target_per_week ? `${L.weekCount(h.dates, t)}/${h.target_per_week}` : L.weekCount(h.dates, t), 'This week')),
      el('div', { class: 'cal-head' },
        el('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => go(-1) }, icon('left', 20)),
        el('b', {}, grid.label),
        el('button', { class: 'icon-btn', 'aria-label': 'Next month', disabled: atNow, onclick: () => go(1) }, icon('right', 20))),
      el('div', { class: 'cal', role: 'grid' },
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => el('span', { class: 'dow' }, d)),
        grid.cells.map((c) => {
          if (!c) return el('span', { class: 'cell blank' });
          const future = c.date > t;
          return el('button', { class: 'cell' + (done.has(c.date) ? ' on' : '') + (c.date === t ? ' now' : ''), disabled: future, 'aria-pressed': String(done.has(c.date)),
            'aria-label': `${c.date}${done.has(c.date) ? ', done' : ''}`, onclick: () => setDay(h, c.date, !done.has(c.date)) }, String(c.day));
        })),
      el('p', { class: 'hint' }, 'Tap a day to mark or unmark it.'),
      el('button', { class: 'act danger', onclick: () => archiveHabit(h) }, icon('trash', 20), 'Archive habit'));
  }

  // ---------- ideas ----------
  async function saveIdea(text, id) {
    const body = text.trim(); if (!body) return false;
    const r = await call('jarvis-items', id ? { action: 'idea_update', id, text: body } : { action: 'idea_create', text: body });
    if (!r.ok) { setStatus(r.reply || 'Could not save the idea.', true); return false; }
    const idea = { id: r.idea.id, title: r.idea.title, body: r.idea.body || body, created_at: r.idea.created_at, updated_at: r.idea.updated_at };
    state.ideas = [idea, ...state.ideas.filter((i) => i.id !== idea.id)];
    saveCache(); setStatus(id ? 'Idea updated.' : 'Idea saved.'); renderAll();
    return true;
  }

  async function deleteIdea(idea) {
    closeSheet();
    const r = await call('jarvis-items', { action: 'idea_delete', id: idea.id });
    if (r.ok || r.error === 'not_found') { state.ideas = state.ideas.filter((i) => i.id !== idea.id); saveCache(); setStatus('Idea deleted.'); } else setStatus(r.reply, true);
    renderAll();
  }

  function ideasView() {
    const now = new Date();
    const box = el('textarea', { rows: '3', placeholder: 'Write an idea. Several lines are fine.', 'aria-label': 'New idea', maxlength: '4000' });
    const save = el('button', { class: 'addbtn', type: 'submit' }, icon('plus', 18), 'Save idea');
    const form = el('form', { class: 'ideabox', onsubmit: async (e) => { e.preventDefault(); save.disabled = true; if (await saveIdea(box.value)) box.value = ''; save.disabled = false; } }, box, save);
    const list = el('ul', { class: 'stack' });
    const fill = () => {
      const q = state.search.trim().toLowerCase();
      const shown = q ? state.ideas.filter((i) => i.body.toLowerCase().includes(q)) : state.ideas;
      list.replaceChildren(...shown.map((i) => {
        const p = L.ideaParts(i.body);
        return el('li', {}, el('button', { class: 'idea', onclick: () => { state.sheet = { kind: 'idea', id: i.id }; renderSheet(); } },
          el('span', { class: 't' }, p.first), p.more ? el('span', { class: 'more' }, p.more) : null,
          el('span', { class: 'm2' }, L.fmtShortDate(new Date(i.created_at), now))));
      }));
      if (!shown.length) list.replaceChildren(el('li', {}, emptyBox(state.ideas.length ? 'No ideas found' : 'No ideas yet', state.ideas.length ? 'Try a different search.' : 'Write one above, or say "idea:" and your thought in Chat.')));
    };
    fill();
    const search = state.ideas.length > 4 ? el('div', { class: 'search' }, icon('search', 20),
      el('input', { type: 'search', placeholder: 'Search ideas', 'aria-label': 'Search ideas', value: state.search, autocomplete: 'off', oninput: (e) => { state.search = e.target.value; fill(); } })) : null;
    return [el('h1', { class: 'h1' }, 'Ideas'), el('p', { class: 'sub' }, state.ideas.length ? `${state.ideas.length} saved` : 'Nothing saved yet'), form, search, list];
  }

  function ideaSheet(s) {
    const idea = ideaById(s.id);
    if (!idea) { closeSheet(); return null; }
    const box = el('textarea', { rows: '8', 'aria-label': 'Idea', maxlength: '4000' }); box.value = idea.body;
    let armed = false;
    const del = el('button', { class: 'act danger', type: 'button', onclick: () => { if (!armed) { armed = true; del.replaceChildren(icon('trash', 20), 'Tap again to delete'); setTimeout(() => { if (del.isConnected) { armed = false; del.replaceChildren(icon('trash', 20), 'Delete idea'); } }, 4000); } else deleteIdea(idea); } }, icon('trash', 20), 'Delete idea');
    const save = el('button', { class: 'act primary', type: 'submit' }, icon('check', 20), 'Save changes');
    return el('form', { class: 'sheet idea-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Edit idea', onsubmit: async (e) => { e.preventDefault(); save.disabled = true; if (await saveIdea(box.value, idea.id)) closeSheet(); else save.disabled = false; } },
      el('div', { class: 'grab' }),
      el('div', { class: 'sh-top' }, el('div', {}, el('div', { class: 'kick' }, 'Idea'), el('h2', {}, `Saved ${L.fmtShortDate(new Date(idea.created_at), new Date())}`)),
        el('button', { class: 'sh-x', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, icon('close', 18))),
      box, save, del);
  }

  return { habitsView, ideasView, sheetFor: (s) => (s.kind === 'habit' ? habitSheet(s) : s.kind === 'idea' ? ideaSheet(s) : null) };
}
