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
let voice = null;
function pickVoice() {
  if (!canSpeak) return null;
  const list = synth.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!list.length) return null;
  const score = (v) => {
    let s = 0;
    if (/en[-_]GB/i.test(v.lang)) s += 6; else if (/en[-_]IN/i.test(v.lang)) s += 5; else if (/en[-_]US/i.test(v.lang)) s += 2;
    if (/daniel|arthur|oliver|rishi|aaron/i.test(v.name)) s += 3;
    if (/enhanced|premium|siri/i.test(v.name)) s += 2;
    if (v.localService) s += 1;
    return s;
  };
  return list.sort((a, b) => score(b) - score(a))[0];
}
if (canSpeak) { synth.addEventListener?.('voiceschanged', () => { voice = pickVoice(); }); voice = pickVoice(); }

export const tts = {
  speaking: false,
  // Call once from a tap: iPhone only lets a page speak after the user has touched it.
  unlock() { if (canSpeak) { try { synth.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* ignore */ } } },
  stop() { if (canSpeak) { synth.cancel(); } this.speaking = false; },
  speak(text, { onStart = () => {}, onEnd = () => {} } = {}) {
    if (!canSpeak || !text) { onEnd(); return; }
    synth.cancel();
    if (!voice) voice = pickVoice();
    // Long text is spoken sentence by sentence; iPhone cuts off long single utterances.
    const parts = String(text).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*\s*/g) || [text];
    this.speaking = true;
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-GB';
      u.rate = 1.02; u.pitch = 0.95;
      if (i === 0) u.onstart = () => onStart();
      const finished = () => { if (i === parts.length - 1) { this.speaking = false; onEnd(); } };
      u.onend = finished; u.onerror = finished;
      synth.speak(u);
    });
  },
};
