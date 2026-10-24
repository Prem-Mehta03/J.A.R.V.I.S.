// The Brief screen: today at a glance, built by the server (weather, calendar, reminders, tasks, habits, college work, email),
// plus the old reminders that rang before today and were never closed.
import * as L from './logic.js';
import { icon } from './icons.js';

// "brief me", "morning brief", "what's my day" typed or spoken in chat go to the brief instead of the chat brain.
export const BRIEF_RE = /^(?:hey |ok |okay )?(?:jarvis[, ]+)?(?:brief me|give me (?:my |the )?(?:morning |daily )?brief(?:ing)?|(?:my |the )?(?:morning |daily )?brief(?:ing)?(?: please)?|what(?:'s|s| is) my day(?: like)?|start my day)[.?! ]*$/i;

export function createBrief({ el, call, setStatus, renderAll, emptyBox, speak, stop, go }) {
  const brief = { data: null, loading: false, tried: false, closing: false, reading: false };

  async function load(showError) {
    if (brief.loading) return;
    brief.loading = true; brief.tried = true; renderAll();
    const r = await call('jarvis-brief', {}, 60000);
    brief.loading = false;
    if (r && r.ok !== false && r.spoken) brief.data = r;
    else if (showError) setStatus((r && r.reply) || 'Could not build the brief.', true);
    renderAll();
  }

  // Read aloud turns into Stop while the brief is being spoken. Leaving the screen stops it too.
  function toggleReading() {
    if (!brief.data) return;
    if (brief.reading) { brief.reading = false; stop(); renderAll(); return; }
    brief.reading = true; renderAll();
    Promise.resolve(speak(brief.data.spoken)).catch(() => {}).then(() => { if (brief.reading) { brief.reading = false; renderAll(); } });
  }
  function stopReading() { if (brief.reading) { brief.reading = false; stop(); } }

  async function closeAll() {
    if (brief.closing) return;
    brief.closing = true; renderAll();
    const r = await call('jarvis-items', { action: 'close_stale' });
    brief.closing = false;
    setStatus(r.reply || (r.ok ? 'Closed.' : 'Could not close them.'), !r.ok);
    await load(false);
  }

  const dueTag = (t) => (t.overdue ? 'overdue' : 'today');
  const section = (title, node, tone = '') => [el('h2', { class: 'sec' + (tone === 'late' ? ' late' : '') }, title), node];
  const rows = (items) => el('ul', { class: 'stack' }, items);
  const plain = (title, meta, lead) => el('li', {}, el('div', { class: 'drow brow' }, lead || null, el('span', { class: 'body' }, el('span', { class: 't' }, title), meta ? el('div', { class: 'm' }, meta) : null)));

  function briefView(now) {
    if (!brief.data && !brief.loading && !brief.tried) load(true);
    const b = brief.data;
    const out = [el('h1', { class: 'h1' }, b ? b.greeting : 'Brief'),
      el('p', { class: 'sub' }, b ? b.date_text : brief.loading ? 'Building your brief' : 'Could not load')];
    out.push(el('div', { class: 'briefbtns' },
      el('button', { class: 'act primary', type: 'button', disabled: !b, onclick: toggleReading }, icon(brief.reading ? 'close' : 'volume', 18), brief.reading ? 'Stop' : 'Read aloud'),
      el('button', { class: 'act neutral', type: 'button', disabled: brief.loading, onclick: () => load(true) }, icon('refresh', 18), brief.loading ? 'Working…' : 'Refresh')));
    if (!b) return out;

    if (b.weather) {
      const w = b.weather;
      out.push(el('div', { class: 'wx' }, icon('cloud', 28),
        el('div', {}, el('b', {}, `${w.temp_c}°, ${w.condition}`), el('div', { class: 'm' }, `${w.place}. High ${w.high_c}°, low ${w.low_c}°${w.rain_chance ? `, ${w.rain_chance}% rain` : ''}`))));
    }

    out.push(...section('Today', b.schedule.length
      ? rows(b.schedule.map((s) => plain(s.text, s.kind === 'event' ? 'Calendar' : s.kind === 'date' ? 'Important date' : 'Reminder', el('span', { class: 'tm' }, s.time || 'All day'))))
      : emptyBox('Nothing scheduled', 'Reminders, dates and calendar events for today show up here.')));
    if (b.calendar_ok === false) out.push(el('p', { class: 'note' }, 'Google Calendar could not be read just now, so events are missing.'));

    if (b.tasks_due.length) out.push(...section(`Tasks due (${b.tasks_due.length})`, rows(b.tasks_due.map((t) => plain(t.title, t.overdue ? 'Overdue' : 'Due today')))));
    if (b.dates_soon.length) out.push(...section('Coming up', rows(b.dates_soon.map((d) => plain(d.title, d.when)))));
    if (b.habits.length) out.push(...section('Habits to check in', rows(b.habits.map((h) => plain(h.title, h.streak ? `${h.streak} day streak` : 'No streak yet')))));

    const c = b.college;
    out.push(...section('College work', el('div', {},
      c.total
        ? el('div', {}, el('div', { class: 'pills' }, [['Overdue', c.overdue], ['Today', c.today], ['Upcoming', c.upcoming], ['No date', c.none]].filter(([, n]) => n).map(([l, n]) => el('span', {}, `${l} ${n}`))),
          rows(c.top.map((t) => plain(t.title, t.due_at ? L.fmtShortDate(new Date(t.due_at), now) : 'No due date'))))
        : emptyBox('No open college work', 'Add homework from the Study tab.'),
      el('button', { class: 'act neutral addexam', type: 'button', onclick: () => go('study') }, icon('book', 18), 'Open Study'))));

    if (b.email && b.email.synced) {
      const lines = ['personal', 'college'].map((a) => {
        const m = b.email[a];
        return plain(`${a === 'personal' ? 'Personal' : 'College'}: ${m.important ? `${m.important} important` : 'nothing important'}`,
          [m.normal ? `${m.normal} other` : '', m.promo ? `${m.promo} ads` : ''].filter(Boolean).join(', ') + (m.top.length ? (m.normal || m.promo ? '. ' : '') + m.top.map((t) => `${t.from}: ${t.subject}`).join('; ') : ''));
      });
      out.push(...section('Email, last 24 hours', el('div', {}, rows(lines), el('button', { class: 'act neutral addexam', type: 'button', onclick: () => go('email') }, icon('mail', 18), 'Open Email'))));
    }

    if (b.stale.length) {
      out.push(...section(`Still open from before today (${b.stale.length})`, el('div', {},
        rows(b.stale.map((s) => plain(s.title, `Rang ${s.when}`))),
        el('button', { class: 'act primary addexam', type: 'button', disabled: brief.closing, onclick: closeAll }, icon('check', 18), brief.closing ? 'Closing…' : `Close all ${b.stale.length}`),
        el('p', { class: 'note' }, 'To keep one, tell Jarvis in chat: "close them but keep" and its name.')), 'late'));
    }
    out.push(el('p', { class: 'note' }, `Built ${L.timeAgo(new Date(b.generated_at), now)}.`));
    return out;
  }

  return { briefView, stopReading, badge: () => (brief.data ? brief.data.stale.length : 0), invalidate: () => { brief.tried = false; brief.data = null; } };
}
