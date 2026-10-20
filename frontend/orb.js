// The Jarvis "AI core": a swirl of golden particles around a bright core, drawn on a canvas.
// One shared mode (idle, listening, thinking, replying) drives every orb on screen.
const TAU = Math.PI * 2;
const MODES = {
  idle:      { spin: 0.22, scale: 1.0,  energy: 0.55, streak: 0.5, ring: 0.25, ripple: 0 },
  listening: { spin: 0.45, scale: 0.92, energy: 0.85, streak: 0.8, ring: 0.5,  ripple: 1 },
  thinking:  { spin: 1.9,  scale: 0.96, energy: 1.0,  streak: 2.2, ring: 2.2,  ripple: 0 },
  replying:  { spin: 0.6,  scale: 1.03, energy: 0.9,  streak: 1.2, ring: 0.6,  ripple: 0.4 },
};
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const orbs = new Set();
let mode = 'idle';
let cur = { ...MODES.idle };
let last = 0, angle = 0, ringAngle = 0, t = 0, running = false;

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const BANDS = [[0.5, 0.3], [-0.7, 0.2], [0.2, -0.9], [1.1, -0.4]];
const PARTICLES = (() => {
  const r = rng(7);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  return Array.from({ length: 640 }, (_, i) => {
    let x, y, z, rad;
    if (i % 5 < 3) { // dense debris along tilted great circles, like orbiting data rings
      const [rx, rz] = BANDS[Math.floor(r() * BANDS.length)];
      const th = r() * TAU, ph = gauss() * 0.16;
      let bx = Math.cos(ph) * Math.cos(th), by = Math.sin(ph), bz = Math.cos(ph) * Math.sin(th);
      let y1 = by * Math.cos(rx) - bz * Math.sin(rx), z1 = by * Math.sin(rx) + bz * Math.cos(rx);
      let x2 = bx * Math.cos(rz) - y1 * Math.sin(rz), y2 = bx * Math.sin(rz) + y1 * Math.cos(rz);
      x = x2; y = y2; z = z1; rad = 0.93 + 0.07 * r();
    } else {
      const lat = Math.acos(2 * r() - 1), lon = r() * TAU;
      x = Math.sin(lat) * Math.cos(lon); y = Math.cos(lat); z = Math.sin(lat) * Math.sin(lon);
      rad = r() < 0.6 ? 0.9 + 0.1 * r() : 0.15 + 0.7 * r();
    }
    return {
      x: x * rad, y: y * rad, z: z * rad,
      sp: 0.7 + r() * 0.7, len: r(), w: 0.6 + r() * 1.4, a: 0.45 + r() * 0.55,
      col: `hsl(${30 + Math.round(r() * 16)} 100% ${60 + Math.round(r() * 24)}%)`,
    };
  });
})();
const RINGS = [
  { rx: 1.12, ry: 0.42, rot: 0.6, sp: 1, dash: [14, 8, 2, 8] },
  { rx: 1.08, ry: 0.28, rot: -0.8, sp: -1.4, dash: [4, 9] },
  { rx: 0.8, ry: 0.78, rot: 0.2, sp: 0.7, dash: [2, 6] },
];

export function setOrbMode(m) { if (MODES[m]) mode = m; }
export function getOrbMode() { return mode; }

export function attachOrb(canvas, { count = 560, rings = true } = {}) {
  orbs.add({ canvas, count: Math.min(count, PARTICLES.length), rings });
  if (!running) { running = true; requestAnimationFrame(frame); }
}

function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
  const target = MODES[mode];
  const k = Math.min(1, dt * 3.5);
  for (const key of Object.keys(cur)) cur[key] += (target[key] - cur[key]) * k;
  const slow = reduced ? 0.1 : 1;
  angle += cur.spin * dt * slow; ringAngle += cur.ring * dt * slow; t += dt * slow;
  for (const o of orbs) {
    if (!o.canvas.isConnected) { orbs.delete(o); continue; }
    draw(o);
  }
  if (orbs.size) requestAnimationFrame(frame); else running = false;
}

function draw(o) {
  const c = o.canvas;
  const size = c.clientWidth;
  if (!size) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(size * dpr)) { c.width = c.height = Math.round(size * dpr); }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const R = size * 0.37 * cur.scale * (1 + 0.02 * Math.sin(t * 1.6));
  const e = cur.energy;
  ctx.globalCompositeOperation = 'source-over';

  let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
  g.addColorStop(0, `rgba(255,170,60,${0.26 * e})`); g.addColorStop(0.55, `rgba(231,120,1,${0.1 * e})`); g.addColorStop(1, 'rgba(231,120,1,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, 'rgba(8,5,0,0.55)'); g.addColorStop(1, 'rgba(8,5,0,0.1)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  const tilt = 0.45 + 0.08 * Math.sin(t * 0.5), ct = Math.cos(tilt), st = Math.sin(tilt);
  const unit = size / 220;
  ctx.lineCap = 'round';
  for (let i = 0; i < o.count; i++) {
    const p = PARTICLES[i];
    const ang = angle * p.sp, ca = Math.cos(ang), sa = Math.sin(ang);
    const x0 = p.x * ca + p.z * sa, z0 = -p.x * sa + p.z * ca, y0 = p.y;
    const y1 = y0 * ct - z0 * st, z1 = y0 * st + z0 * ct;
    const sx = cx + x0 * R, sy = cy + y1 * R;
    const depth = (z1 + 1) / 2;
    ctx.globalAlpha = Math.min(1, (0.2 + 0.8 * depth) * (0.4 + e) * p.a);
    ctx.strokeStyle = p.col;
    ctx.lineWidth = Math.max(0.7, p.w * unit * 1.5);
    const len = (3 + 9 * p.len) * cur.streak * unit;
    let vx = -z0, vy = x0 * st; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - vx * len, sy - vy * len); ctx.stroke();
  }

  if (o.rings) {
    ctx.globalAlpha = 0.18 + 0.3 * e; ctx.strokeStyle = 'rgb(255,200,110)'; ctx.lineWidth = Math.max(0.6, unit * 0.9);
    for (const r of RINGS) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(r.rot + ringAngle * r.sp);
      ctx.setLineDash(r.dash.map((d) => d * unit)); ctx.lineDashOffset = -t * 18 * r.sp * unit;
      ctx.beginPath(); ctx.ellipse(0, 0, r.rx * R, r.ry * R, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.setLineDash([1 * unit, (TAU * R * 1.3) / 72 - unit]);
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }

  if (cur.ripple > 0.02) {
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.7 + i * 0.5) % 1;
      ctx.globalAlpha = (1 - ph) * 0.4 * cur.ripple; ctx.strokeStyle = 'rgb(255,184,77)'; ctx.lineWidth = Math.max(0.8, unit * 1.2);
      ctx.beginPath(); ctx.arc(cx, cy, R * (1.05 + 0.45 * ph), 0, TAU); ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const coreR = R * 0.55 * (1 + 0.08 * Math.sin(t * 3) * e);
  g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.22, 'rgba(255,214,120,0.95)'); g.addColorStop(0.6, 'rgba(255,150,40,0.35)'); g.addColorStop(1, 'rgba(255,140,30,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgb(255,226,150)'; ctx.lineWidth = Math.max(0.6, unit * 1.1);
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.5 * e; const a0 = angle * 3 + i * 2.1;
    ctx.beginPath(); ctx.arc(cx, cy, R * (0.14 + i * 0.07), a0, a0 + 2.2); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
