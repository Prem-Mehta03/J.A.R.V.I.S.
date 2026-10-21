// Node "Merge labels": adds the language model's labels to the mails Collect could not settle. A mail the model
// did not label properly is not stored, so the next run tries it again.

const collected = $('Collect').first().json;
const input = $input.first().json || {};
const LABELS = ['important', 'normal', 'promo'];
const rows = collected.rows.slice();
const errors = Object.assign({}, collected.errors);

if (collected.has_llm) {
  let text = null;
  const g = input.candidates && input.candidates[0] && input.candidates[0].content;
  if (g && Array.isArray(g.parts)) text = g.parts.map((p) => p.text || '').join('');
  else if (input.choices && input.choices[0] && input.choices[0].message) text = input.choices[0].message.content;
  let parsed = null;
  if (typeof text === 'string') {
    const cleaned = text.replace(/```(?:json)?/gi, '');
    const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}');
    if (s >= 0 && e > s) { try { parsed = JSON.parse(cleaned.slice(s, e + 1)); } catch (err) { parsed = null; } }
  }
  const list = parsed && Array.isArray(parsed.labels) ? parsed.labels : null;
  if (!list) {
    errors.classifier = 'The language models did not answer, so some mail will be sorted on the next check.';
  } else {
    const seenIdx = new Set();
    for (const entry of list) {
      if (!entry || !Number.isInteger(entry.i) || seenIdx.has(entry.i)) continue;
      const row = collected.to_classify[entry.i];
      const label = typeof entry.label === 'string' ? entry.label.toLowerCase().trim() : '';
      if (!row || !LABELS.includes(label)) continue;
      seenIdx.add(entry.i);
      rows.push(Object.assign({}, row, { label, label_source: 'llm' }));
    }
  }
}

return [{ json: { rows_json: JSON.stringify(rows), count: rows.length, errors, seen: collected.seen } }];
