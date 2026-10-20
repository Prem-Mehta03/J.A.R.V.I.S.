// Node "Finish": pairs each push attempt with its result, then builds the one database update that records the outcome.
// A push that failed is released so it is tried again in 5 minutes (the calendar copy is the backup meanwhile).
const planned = $('Compose').all().map((i) => i.json);
const results = $input.all().map((i) => i.json);

const rows = planned.map((p, idx) => {
  let ok = false;
  const r = results.length === planned.length ? results[idx] : null;
  // The no-topic path passes the composed items straight through; a real ntfy answer has an id and no error.
  if (r && !r.error && !r.kind && (r.id || r.event)) ok = true;
  return { id: p.id, kind: p.kind, ok, next_remind: p.next_remind || '', occurrence: p.occurrence || null, adv: p.adv || 0 };
});
return [{ json: { rows: JSON.stringify(rows), total: rows.length, failed: rows.filter((r) => !r.ok).length } }];
