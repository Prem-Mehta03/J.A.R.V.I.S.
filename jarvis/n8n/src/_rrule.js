// ---- repeat rules: finds the next time a repeating reminder should fire ----
// Handles the rules the router accepts: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY with optional INTERVAL and BYDAY.
const RR_DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Returns the first occurrence strictly after `now`, keeping the clock time of `last` (all on the India calendar).
// Returns null for a rule it does not understand.
function nextOccurrence(rule, last, now) {
  const m = typeof rule === 'string' && rule.match(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
  if (!m) return null;
  const freq = m[1];
  const interval = Math.max(1, Math.min(52, Number((rule.match(/INTERVAL=(\d+)/) || [])[1]) || 1));
  const byday = ((rule.match(/BYDAY=([A-Z,]+)/) || [])[1] || '').split(',').filter((d) => d in RR_DAYS).map((d) => RR_DAYS[d]);

  const l = toIst(last);
  const timeOfDayMs = ((l.getUTCHours() * 60) + l.getUTCMinutes()) * 60000;
  const dayStartUtc = (y, mo, d) => Date.UTC(y, mo, d) - IST_OFFSET_MIN * 60000 + timeOfDayMs;

  let candidate = last;
  for (let i = 0; i < 2000; i += 1) {
    if (freq === 'DAILY') {
      candidate = new Date(candidate.getTime() + interval * 86400000);
    } else if (freq === 'WEEKLY') {
      if (byday.length) {
        // Step a day at a time to the next listed weekday.
        do { candidate = new Date(candidate.getTime() + 86400000); } while (!byday.includes(toIst(candidate).getUTCDay()));
      } else {
        candidate = new Date(candidate.getTime() + interval * 7 * 86400000);
      }
    } else if (freq === 'MONTHLY') {
      const c = toIst(candidate);
      const target = c.getUTCMonth() + interval;
      const y = c.getUTCFullYear() + Math.floor(target / 12);
      const mo = target % 12;
      const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      candidate = new Date(dayStartUtc(y, mo, Math.min(toIst(last).getUTCDate(), lastDay)));
    } else {
      const c = toIst(candidate);
      const y = c.getUTCFullYear() + interval;
      const lastDay = new Date(Date.UTC(y, toIst(last).getUTCMonth() + 1, 0)).getUTCDate();
      candidate = new Date(dayStartUtc(y, toIst(last).getUTCMonth(), Math.min(toIst(last).getUTCDate(), lastDay)));
    }
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}
