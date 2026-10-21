// Small line-icon set drawn as inline SVG (no icon font, so the app works offline and under the strict CSP).
const NS = 'http://www.w3.org/2000/svg';
const D = {
  flame: { p: ['M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2 0 2 1 3 2 3 0-3-1-5 1-9.3z'] },
  bulb: { p: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'] },
  edit: { p: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13.5 6.5l4 4'] },
  link: { p: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'] },
  book: { p: ['M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5z', 'M4 20a2 2 0 0 1 2-2h13v3H6a2 2 0 0 1-2-1z'] },
  menu: { p: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  send: { p: ['M12 19V5', 'M5 12l7-7 7 7'] },
  mic: { r: [[9, 3, 6, 11, 3]], p: ['M5 11a7 7 0 0 0 14 0', 'M12 18v3'] },
  chat: { p: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'] },
  sun: { c: [[12, 12, 4]], p: ['M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'] },
  check: { c: [[12, 12, 9]], p: ['M8 12.5l3 3 5-6'] },
  circle: { c: [[12, 12, 9]] },
  bell: { p: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2z', 'M10 21h4'] },
  calendar: { r: [[4, 5, 16, 16, 2]], p: ['M4 10h16', 'M8 3v4', 'M16 3v4'] },
  left: { p: ['M15 6l-6 6 6 6'] },
  right: { p: ['M9 6l6 6-6 6'] },
  down: { p: ['M6 9l6 6 6-6'] },
  plus: { p: ['M12 5v14', 'M5 12h14'] },
  close: { p: ['M6 6l12 12', 'M18 6L6 18'] },
  alarm: { c: [[12, 13, 8]], p: ['M12 9v4l3 2', 'M5 3L2 6', 'M22 6l-3-3'] },
  list: { p: ['M4 6h2', 'M4 12h2', 'M4 18h2', 'M9 6h11', 'M9 12h11', 'M9 18h11'] },
  cloud: { p: ['M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z'] },
  out: { p: ['M7 17L17 7', 'M8 7h9v9'] },
  sliders: { c: [[16, 7, 2], [8, 17, 2]], p: ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10'] },
  trash: { p: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'] },
  search: { c: [[11, 11, 6]], p: ['M20 20l-4.2-4.2'] },
  alert: { p: ['M12 5v8', 'M12 18v.5'] },
  folder: { p: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'] },
  clock: { c: [[12, 12, 9]], p: ['M12 7v5l3 2'] },
  volume: { p: ['M4 10v4h4l5 4V6l-5 4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'] },
  mute: { p: ['M4 10v4h4l5 4V6l-5 4H4z', 'M17 9l5 6', 'M22 9l-5 6'] },
  stop: { r: [[7, 7, 10, 10, 2]] },
  repeat: { p: ['M17 3l3 3-3 3', 'M4 11V9a3 3 0 0 1 3-3h13', 'M7 21l-3-3 3-3', 'M20 13v2a3 3 0 0 1-3 3H4'] },
};

export function icon(name, size = 22) {
  const d = D[name] || D.circle;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const p of d.p || []) { const n = document.createElementNS(NS, 'path'); n.setAttribute('d', p); svg.append(n); }
  for (const [cx, cy, r] of d.c || []) { const n = document.createElementNS(NS, 'circle'); n.setAttribute('cx', cx); n.setAttribute('cy', cy); n.setAttribute('r', r); svg.append(n); }
  for (const [x, y, w, h, rx] of d.r || []) { const n = document.createElementNS(NS, 'rect'); n.setAttribute('x', x); n.setAttribute('y', y); n.setAttribute('width', w); n.setAttribute('height', h); n.setAttribute('rx', rx); svg.append(n); }
  return svg;
}
