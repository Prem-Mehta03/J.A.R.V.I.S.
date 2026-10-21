// Voice mode: a full-screen conversation by voice. Nothing is shown or saved in the chat.
// listen -> transcribe -> ask Jarvis -> speak -> listen again, until the person closes it.
import { attachOrb, setOrbMode, setOrbLevel } from './orb.js';
import { canRecord, startRecording } from './voice.js';
import { icon } from './icons.js';

const LABELS = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', paused: 'Tap the orb to talk', error: '' };
const ORB_MODE = { listening: 'listening', thinking: 'thinking', speaking: 'speaking', paused: 'idle', error: 'idle' };

// deps: el(), transcribe(blob) -> {ok,text,error,reply}, ask(text) -> {ok,reply}, speaker, getPrefs(), onExit()
export function createVoiceMode({ el, transcribe, ask, speaker, getPrefs, onExit }) {
  let node = null, run = 0, phase = 'paused', rec = null, finishListen = null, label = null, hint = null;

  const setPhase = (p, text = '') => {
    phase = p; setOrbMode(ORB_MODE[p]); if (p !== 'listening' && p !== 'speaking') setOrbLevel(0);
    if (!node) return;
    label.textContent = LABELS[p] || ''; hint.textContent = text; node.dataset.phase = p;
  };

  async function listen(my) {
    setPhase('listening');
    let silence;
    const done = new Promise((res) => { finishListen = res; });
    let ctl;
    try {
      ctl = rec = await startRecording({ onLevel: setOrbLevel, onSilence: (why) => finishListen(why) });
    } catch (e) {
      rec = null;
      setPhase('error', e && e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it for this app in iPhone Settings, then tap the orb.' : 'Could not start the microphone.');
      return null;
    }
    silence = await done; finishListen = null;
    rec = null;
    if (my !== run) { ctl.cancel(); return null; }
    if (silence === 'nothing') { ctl.cancel(); setPhase('paused'); return null; }
    setPhase('thinking');
    const blob = await ctl.stop();
    if (my !== run) return null;
    if (!blob || blob.size < 1200) { setPhase('paused'); return null; }
    return blob;
  }

  async function loop(my) {
    while (my === run) {
      const blob = await listen(my);
      if (!blob || my !== run) return;
      const t = await transcribe(blob);
      if (my !== run) return;
      let reply = '';
      if (t.ok && t.text) {
        const r = await ask(t.text);
        if (my !== run) return;
        reply = r.reply || 'No answer came back.';
      } else if (t.error === 'empty' || t.error === 'no_audio') { setPhase('paused'); return; }
      else reply = t.reply || 'I could not make that out.';
      const res = await speaker.speak(reply, getPrefs(), { onStart: () => { if (my === run) setPhase('speaking'); } });
      if (my !== run) return;
      if (res && res.engine === 'none') { setPhase('paused', 'This browser cannot speak replies.'); return; }
      if (getPrefs().engine !== 'device' && res && res.engine === 'device') hint && (hint.textContent = 'Natural voice unavailable. Using the phone voice.');
    }
  }

  function begin() { const my = ++run; loop(my); }

  function tap() {
    if (phase === 'listening' && finishListen) finishListen('done');
    else if (phase === 'speaking') speaker.stop();
    else if (phase === 'paused' || phase === 'error') { speaker.unlock(); begin(); }
  }

  function close() {
    run++; if (finishListen) finishListen('cancel');
    speaker.stop(); setOrbLevel(0); setOrbMode('idle');
    if (node) { node.remove(); node = null; }
    onExit();
  }

  return {
    get active() { return !!node; },
    open({ autostart = true } = {}) {
      if (node) return;
      speaker.unlock(); // must happen inside the tap that opened this screen
      const canvas = el('canvas', { class: 'vm-orb', 'aria-hidden': 'true' }); attachOrb(canvas, { count: 640 });
      label = el('div', { class: 'vm-label' }); hint = el('div', { class: 'vm-hint' });
      const orbBtn = el('button', { class: 'vm-orb-btn', type: 'button', 'aria-label': 'Tap to send, interrupt or start', onclick: tap }, canvas);
      node = el('div', { class: 'vm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Voice mode' },
        el('button', { class: 'vm-x', type: 'button', 'aria-label': 'End voice mode', onclick: close }, icon('close', 22)),
        orbBtn, label, hint);
      document.body.append(node);
      if (!canRecord()) { setPhase('error', 'Voice recording is not available in this browser.'); return; }
      if (autostart) begin(); else setPhase('paused');
    },
    close,
  };
}
