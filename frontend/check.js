// Tests that each file of the app is present, parses, and has what the other files need.
const out = document.getElementById('out');
const lines = [];
const say = (ok, text) => { lines.push(`${ok ? 'OK    ' : 'FAIL  '}${text}`); out.textContent = lines.join('\n'); };

const NEEDS = {
  'logic.js': ['listExams', 'collegeWork', 'listDates', 'groupToday', 'streakInfo', 'dateStr', 'monthGrid', 'timeAgo', 'fmtShortDate'],
  'icons.js': ['icon'],
  'lifeviews.js': ['createLife'],
  'emailview.js': ['createEmail'],
  'orb.js': [],
  'voice.js': [],
  'voicemode.js': [],
};

async function main() {
  say(true, `page ${location.href}`);
  for (const [file, names] of Object.entries(NEEDS)) {
    try {
      const mod = await import('./' + file + '?c=' + Date.now());
      const missing = names.filter((n) => typeof mod[n] === 'undefined');
      say(missing.length === 0, `${file}${missing.length ? ' is OLD, missing: ' + missing.join(', ') : ''}`);
    } catch (e) { say(false, `${file} would not load: ${e && e.message ? e.message : e}`); }
  }
  for (const file of ['app.js', 'styles.css', 'sw.js', 'index.html']) {
    try {
      const r = await fetch(file, { cache: 'no-store' });
      const t = await r.text();
      const extra = file === 'app.js' ? (t.includes('createEmail') && t.includes('const safe =') ? '' : ' (OLD version)') : '';
      say(r.ok && !extra, `${file} ${r.status}${extra}`);
    } catch (e) { say(false, `${file}: ${e.message}`); }
  }
  try {
    const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
    const keys = window.caches ? await caches.keys() : [];
    say(true, `service workers: ${regs.length}; caches: ${keys.join(', ') || 'none'}`);
  } catch (e) { say(false, 'service worker check: ' + e.message); }
  say(true, 'done');
}

document.getElementById('reset').addEventListener('click', async () => {
  try {
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) { /* ignore */ }
  location.replace('./?r=' + Date.now());
});

main().catch((e) => say(false, 'check failed: ' + e.message));
