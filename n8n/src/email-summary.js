// Node "Summary": the answer to the app after a check of both inboxes.

const merged = $('Merge labels').first().json;
const saved = $input.first().json || {};
const errors = merged.errors || {};
const names = { personal: 'personal', college: 'college' };
const failed = Object.keys(errors).filter((k) => names[k]);
const both = failed.length === 2;
const added = Number(saved.added) || 0;

let reply;
if (both) reply = "I couldn't read either Gmail account. Check the Gmail connections in n8n.";
else if (failed.length) reply = `Checked mail, but couldn't read the ${failed.join(' and ')} account.`;
else if (errors.classifier) reply = errors.classifier;
else reply = added ? `Checked mail: ${added} new, ${Number(saved.important) || 0} important.` : 'Checked mail: nothing new.';

return [{ json: { ok: !both, reply, added, important: Number(saved.important) || 0, errors } }];
