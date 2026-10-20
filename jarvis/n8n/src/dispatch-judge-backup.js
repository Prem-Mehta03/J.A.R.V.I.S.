// Node "Judge backup": a failed push counts as delivered if Google Calendar took the replacement event.
// If Calendar failed too, the item stays undelivered and is tried again in 5 minutes.
const failed = $('Judge').all().map((i) => i.json).filter((p) => !p.ok);
const results = $input.all().map((i) => i.json);

return failed.map((p, idx) => {
  const r = results.length === failed.length ? results[idx] : null;
  const ok = !!(r && !r.error && r.id);
  return { json: Object.assign({}, p, { ok, backup_body: null }) };
});
