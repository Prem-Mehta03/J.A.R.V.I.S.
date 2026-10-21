// Microphone recording with simple silence detection, plus spoken replies. Both are free and built into the phone:
// the recording is sent to the server for transcription; the replies use the phone's own voices.

const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

// Starts recording. Callbacks: onLevel(0..1) about 30 times a second, onSilence() when the speaker has finished
// (or nothing was said for a while). Returns { stop(): Promise<Blob|null>, cancel() }.
export async function startRecording({ onLevel = () => {}, onSilence = () => {} } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = AC ? new AC() : null;
  let analyser = null; let buf = null;
  if (ctx) {
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
  }

  const startedAt = performance.now();
  let spoke = false, speechMs = 0, quietSince = 0, floor = 0.01, samples = 0, done = false, timer = 0;
  const tick = () => {
    if (done) return;
    let level = 0;
    if (analyser) {
      analyser.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      level = Math.sqrt(sum / buf.length);
    }
    const now = performance.now();
    if (now - startedAt < 400) { floor = (floor * samples + level) / (samples + 1); samples++; } // learn the room's noise first
    const loud = level > Math.max(0.03, floor * 2.5);
    if (loud) { speechMs += 33; quietSince = 0; if (speechMs > 250) spoke = true; }
    else if (!quietSince) quietSince = now;
    onLevel(Math.min(1, level * 5));
    if (spoke && quietSince && now - quietSince > 1400) { done = true; onSilence('done'); return; }
    if (!spoke && now - startedAt > 9000) { done = true; onSilence('nothing'); return; }
    if (now - startedAt > 45000) { done = true; onSilence('long'); return; }
    timer = setTimeout(tick, 33);
  };
  rec.start(250);
  tick();

  const release = () => { clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {}); onLevel(0); };
  return {
    stop() {
      done = true;
      return new Promise((resolve) => {
        const finish = () => { release(); resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' }) : null); };
        if (rec.state === 'inactive') return finish();
        rec.onstop = finish; rec.stop();
      });
    },
    cancel() { done = true; try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* ignore */ } release(); },
  };
}

// ---------- spoken replies ----------
const synth = window.speechSynthesis;
export const canSpeak = !!synth && typeof SpeechSynthesisUtterance === 'function';
// iPhone lists joke voices (Fred, Zarvox, Bells...) next to the real ones; never offer or pick those.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|princess|deranged|hysterical|pipe organ)\b/i;
export function deviceVoices() {
  if (!canSpeak) return [];
  return synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang) && !NOVELTY.test(v.name));
}
const voiceScore = (v) => {
  let s = 0;
  if (/premium/i.test(v.name)) s += 8; else if (/enhanced/i.test(v.name)) s += 6;
  if (/en[-_]US/i.test(v.lang)) s += 3; else if (/en[-_]GB/i.test(v.lang)) s += 2; else if (/en[-_]IN/i.test(v.lang)) s += 1;
  if (/siri|aaron|evan|nathan|tom|alex|daniel|arthur/i.test(v.name)) s += 2;
  if (v.localService) s += 1;
  return s;
};
export function bestDeviceVoice(name) {
  const list = deviceVoices();
  return list.find((v) => v.name === name) || list.sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}
if (canSpeak && synth.addEventListener) synth.addEventListener('voiceschanged', () => {});

// Splits a reply into pieces of at most `max` characters at sentence ends (the natural voice speaks one piece at a time).
export function chunkText(text, max = 190, limit = 4) {
  const sentences = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) || [];
  const out = []; let cur = '';
  for (let s of sentences) {
    s = s.trim();
    while (s.length > max) { const cut = s.lastIndexOf(' ', max); const k = cut > 40 ? cut : max; if (cur) { out.push(cur); cur = ''; } out.push(s.slice(0, k)); s = s.slice(k).trim(); }
    if ((cur + ' ' + s).trim().length > max) { if (cur) out.push(cur); cur = s; } else cur = (cur + ' ' + s).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, limit);
}

// Loudness of a WAV (16-bit mono) every 40 ms, 0..1, so the orb can move with the voice.
export function envelope(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12, rate = 24000, start = 44, end = bytes.byteLength;
  while (pos + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = dv.getUint32(pos + 4, true);
    if (id === 'fmt ') rate = dv.getUint32(pos + 12, true);
    if (id === 'data') { start = pos + 8; end = Math.min(bytes.byteLength, start + size); break; }
    pos += 8 + size + (size % 2);
  }
  const win = Math.max(1, Math.round(rate * 0.04)), vals = [];
  for (let p = start; p + win * 2 <= end; p += win * 2) {
    let sum = 0; for (let i = 0; i < win; i++) { const v = dv.getInt16(p + i * 2, true) / 32768; sum += v * v; }
    vals.push(Math.sqrt(sum / win));
  }
  const sorted = [...vals].sort((a, b) => a - b);
  const peak = sorted[Math.floor(sorted.length * 0.95)] || 0.1;
  return vals.map((v) => Math.min(1, v / (peak * 1.1 || 1)));
}

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=';

// One speaker for the whole app. fetchSpeech(text, voice) must resolve { ok, audio } (base64 WAV) or { ok: false, detail }.
export function createSpeaker({ fetchSpeech, onLevel = () => {} }) {
  let audio = null, token = 0, synthTimer = 0, stopCurrent = () => {};
  const api = {
    speaking: false,
    lastError: '',
    // Call once from a tap: iPhone only lets a page play sound after a touch.
    unlock() {
      if (!audio) audio = new Audio();
      audio.src = SILENT_WAV; audio.play().catch(() => {});
      if (canSpeak) { try { synth.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* ignore */ } }
    },
    stop() {
      token++; stopCurrent(); stopCurrent = () => {};
      if (audio) { audio.pause(); }
      if (canSpeak) synth.cancel();
      clearInterval(synthTimer); api.speaking = false; onLevel(0);
    },
    // prefs: { engine: 'natural' | 'device', serverVoice, deviceVoice }. Resolves when finished or stopped.
    async speak(text, prefs = {}, { onStart = () => {} } = {}) {
      api.stop();
      const my = ++token; api.lastError = '';
      let started = false;
      const begin = () => { if (!started) { started = true; api.speaking = true; onStart(); } };
      const alive = () => my === token;
      if (prefs.engine !== 'device') {
        const parts = chunkText(text);
        const fetchPart = (t) => fetchSpeech(t, prefs.serverVoice).catch((e) => ({ ok: false, detail: String(e && e.message || e) }));
        let next = parts.length ? fetchPart(parts[0]) : null;
        for (let i = 0; i < parts.length; i++) {
          const res = await next;
          if (!alive()) return { engine: 'natural', stopped: true };
          if (!res || !res.ok) { api.lastError = (res && (res.detail || res.error)) || 'unavailable'; if (i === 0) break; return { engine: 'natural' }; }
          next = i + 1 < parts.length ? fetchPart(parts[i + 1]) : null;
          const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
          const env = envelope(bytes);
          const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
          if (!audio) audio = new Audio();
          await new Promise((resolve) => {
            let raf = 0;
            const done = () => { cancelAnimationFrame(raf); audio.onended = audio.onerror = null; URL.revokeObjectURL(url); resolve(); };
            stopCurrent = done;
            audio.onended = done; audio.onerror = done;
            audio.src = url;
            audio.play().then(() => {
              begin();
              const loop = () => { onLevel(env[Math.floor(audio.currentTime / 0.04)] || 0); raf = requestAnimationFrame(loop); };
              loop();
            }).catch(() => { api.lastError = 'The browser blocked playback.'; done(); });
          });
          if (!alive()) return { engine: 'natural', stopped: true };
          if (api.lastError) { if (i === 0) break; return { engine: 'natural' }; }
        }
        if (!api.lastError && started) { api.speaking = false; onLevel(0); return { engine: 'natural' }; }
      }
      // On-device voice (also the fallback when the natural voice is unavailable).
      if (!canSpeak) { api.speaking = false; return { engine: 'none' }; }
      if (!alive()) return { engine: 'device', stopped: true };
      const voice = bestDeviceVoice(prefs.deviceVoice);
      const pieces = String(text).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*\s*/g) || [text];
      await new Promise((resolve) => {
        pieces.forEach((part, i) => {
          const u = new SpeechSynthesisUtterance(part.trim());
          if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
          u.rate = 1; u.pitch = 1;
          if (i === 0) u.onstart = () => { begin(); const t0 = performance.now(); clearInterval(synthTimer); synthTimer = setInterval(() => { const t = (performance.now() - t0) / 1000; onLevel(0.3 + 0.5 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1))); }, 50); };
          const fin = () => { if (i === pieces.length - 1) { clearInterval(synthTimer); onLevel(0); resolve(); } };
          u.onend = fin; u.onerror = fin;
          stopCurrent = () => { clearInterval(synthTimer); resolve(); };
          synth.speak(u);
        });
      });
      api.speaking = false;
      return { engine: 'device', stopped: !alive() };
    },
  };
  return api;
}
