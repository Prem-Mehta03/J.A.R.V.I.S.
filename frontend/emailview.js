// The Email screen: the digest of both Gmail accounts, a sheet to correct one mail, and the rules that corrections create.
import * as L from './logic.js';
import { icon } from './icons.js';

export function createEmail({ el, state, call, setStatus, renderAll, renderSheet, emptyBox }) {
  const mail = { emails: [], rules: [], synced: null, loaded: false, tried: false, loading: false, account: 'personal', adsOpen: false };
  const closeSheet = () => { state.sheet = null; renderSheet(); };
  const WORDS = { important: 'Important', normal: 'Normal', promo: 'Ad' };

  async function load(showError) {
    if (mail.loading) return;
    mail.loading = true; mail.tried = true;
    const r = await call('jarvis-items', { action: 'email_list' });
    mail.loading = false;
    if (r.ok) { mail.emails = r.emails || []; mail.rules = r.rules || []; mail.synced = r.synced_at ? new Date(r.synced_at) : null; mail.loaded = true; }
    else if (showError) setStatus(r.reply || 'Could not load mail.', true);
    renderAll();
  }

  async function refresh() {
    if (mail.loading) return;
    mail.loading = true; renderAll();
    setStatus('Checking both inboxes. This can take a minute.');
    const r = await call('jarvis-email-refresh', {});
    mail.loading = false;
    setStatus(r.reply || (r.ok ? 'Checked mail.' : 'Could not check mail.'), !r.ok);
    await load(true);
  }

  async function relabel(m, label) {
    const r = await call('jarvis-items', { action: 'email_label', id: m.id, label });
    if (!r.ok) { setStatus(r.reply || 'Could not save that.', true); return; }
    setStatus(`Saved. Mail from ${m.from} will be filed as ${WORDS[label].toLowerCase()}.`);
    closeSheet();
    await load(false);
  }

  async function dropRule(rule) {
    const r = await call('jarvis-items', { action: 'email_rule_delete', id: rule.id });
    if (!r.ok) { setStatus(r.reply || 'Could not remove that rule.', true); return; }
    mail.rules = mail.rules.filter((x) => x.id !== rule.id);
    setStatus('Rule removed. Mail already filed stays as it is.'); renderAll(); renderSheet();
  }

  const mine = () => mail.emails.filter((m) => m.account === mail.account);
  const importantCount = (account) => mail.emails.filter((m) => m.account === account && m.label === 'important' && Date.now() - new Date(m.received_at).getTime() < 86400000).length;

  function row(m, now) {
    return el('li', {}, el('button', { class: 'drow mailrow', onclick: () => { state.sheet = { kind: 'mail', id: m.id }; renderSheet(); } },
      el('span', { class: 'body' },
        el('span', { class: 't' }, m.from),
        el('div', { class: 'm' }, m.subject || '(no subject)'),
        m.snippet ? el('div', { class: 'm2' }, m.snippet) : null),
      el('span', { class: 'when' }, L.fmtShortDate(new Date(m.received_at), now))));
  }

  function emailView(now) {
    if (!mail.loaded && !mail.loading && !mail.tried) load(true);
    const list = mine();
    const by = (label) => list.filter((m) => m.label === label);
    const out = [el('h1', { class: 'h1' }, 'Email'),
      el('p', { class: 'sub' }, mail.synced ? `Checked ${L.timeAgo(mail.synced, now)}` : mail.loaded ? 'Not checked yet. Tap Refresh.' : 'Loading')];
    out.push(el('div', { class: 'seg', role: 'group', 'aria-label': 'Account' },
      ['personal', 'college'].map((a) => el('button', { type: 'button', 'aria-pressed': String(mail.account === a), onclick: () => { mail.account = a; renderAll(); } },
        a === 'personal' ? 'Personal' : 'College', importantCount(a) ? el('span', { class: 'count warm' }, importantCount(a)) : null))));
    out.push(el('button', { class: 'act neutral addexam', type: 'button', disabled: mail.loading, onclick: refresh }, icon('refresh', 18), mail.loading ? 'Working…' : 'Refresh'));

    const imp = by('important'); const norm = by('normal'); const ads = by('promo');
    out.push(el('h2', { class: 'sec' }, `Important (${imp.length})`));
    out.push(imp.length ? el('ul', { class: 'stack' }, imp.map((m) => row(m, now))) : emptyBox('Nothing important', 'Mail that needs you will show up here.'));
    if (norm.length) out.push(el('h2', { class: 'sec' }, `Normal (${norm.length})`), el('ul', { class: 'stack' }, norm.slice(0, 40).map((m) => row(m, now))));
    if (ads.length) {
      out.push(el('button', { class: 'act neutral addexam', type: 'button', 'aria-expanded': String(mail.adsOpen), onclick: () => { mail.adsOpen = !mail.adsOpen; renderAll(); } }, icon(mail.adsOpen ? 'up' : 'right', 18), `Ads (${ads.length})`));
      if (mail.adsOpen) out.push(el('ul', { class: 'stack' }, ads.slice(0, 40).map((m) => row(m, now))));
    }
    out.push(el('button', { class: 'act neutral addexam', type: 'button', onclick: () => { state.sheet = { kind: 'mailrules' }; renderSheet(); } }, icon('check', 18), `Sorting rules${mail.rules.length ? ` (${mail.rules.length})` : ''}`));
    return out;
  }

  function mailSheet(s) {
    const m = mail.emails.find((x) => x.id === s.id);
    if (!m) { closeSheet(); return null; }
    const now = new Date();
    return el('div', { class: 'sheet mail-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mail' },
      el('div', { class: 'grab' }),
      el('div', { class: 'sh-top' }, el('div', {}, el('div', { class: 'kick' }, `${m.account === 'personal' ? 'Personal' : 'College'}, ${L.fmtShortDate(new Date(m.received_at), now)}`), el('h2', {}, m.subject || '(no subject)')),
        el('button', { class: 'sh-x', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, icon('close', 18))),
      el('p', { class: 'mfrom' }, m.from === m.sender ? m.sender : `${m.from} <${m.sender}>`),
      m.snippet ? el('p', { class: 'msnip' }, m.snippet) : null,
      el('p', { class: 'mnote' }, `Filed as ${WORDS[m.label].toLowerCase()}${m.by === 'rule' ? ' by a rule' : m.by === 'user' ? ' by you' : m.by === 'gmail' ? ' because Gmail put it in Promotions' : ' by Jarvis'}. File it differently and all mail from this sender follows.`),
      el('div', { class: 'three' }, ['important', 'normal', 'promo'].map((l) =>
        el('button', { class: 'act ' + (m.label === l ? 'primary' : 'neutral'), type: 'button', onclick: () => relabel(m, l) }, WORDS[l]))));
  }

  function rulesSheet() {
    const rows = mail.rules.map((r) => {
      let armed = false;
      const del = el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove rule for ${r.sender}`, onclick: () => {
        if (!armed) { armed = true; del.replaceChildren(el('small', {}, 'Tap again')); setTimeout(() => { if (del.isConnected) { armed = false; del.replaceChildren(icon('trash', 20)); } }, 4000); } else dropRule(r);
      } }, icon('trash', 20));
      return el('li', { class: 'linkrow' },
        el('div', { class: 'drow' }, el('span', { class: 'body' }, el('span', { class: 't' }, r.sender), el('div', { class: 'm' }, `${r.account === 'personal' ? 'Personal' : 'College'}, always ${WORDS[r.label].toLowerCase()}`))),
        del);
    });
    return el('div', { class: 'sheet links-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sorting rules' },
      el('div', { class: 'grab' }),
      el('div', { class: 'sh-top' }, el('div', {}, el('div', { class: 'kick' }, 'Email'), el('h2', {}, 'Sorting rules')),
        el('button', { class: 'sh-x', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, icon('close', 18))),
      rows.length ? el('ul', { class: 'stack' }, rows) : emptyBox('No rules yet', 'Correct a mail, or tell Jarvis "Unstop mail is an ad", and the sender is remembered here.'));
  }

  return {
    emailView,
    badge: () => importantCount('personal') + importantCount('college'),
    sheetFor: (s) => (s.kind === 'mail' ? mailSheet(s) : s.kind === 'mailrules' ? rulesSheet() : null),
  };
}
