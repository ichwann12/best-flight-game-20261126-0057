// Valley Run — tiny synthesised sounds. No audio files: every sound is a
// WebAudio oscillator built at run time, so the game loads nothing over the
// network. Sounds start only after the player's first gesture, as browsers
// require, and a missing audio device never breaks the game.
let context = null;

function audio() {
  if (context) return context;
  try {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
  } catch {
    return null;
  }
  return context;
}

export function unlockAudio() {
  const ctx = audio();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function tone(freq, startAt, dur, type, gain) {
  const ctx = audio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, ctx.currentTime + startAt);
    amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + startAt + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + dur + 0.05);
  } catch {
    // Sound is garnish: never let it stop the game.
  }
}

/** Two rising notes when a ring is flown. */
export function ringChime() {
  tone(660, 0, 0.16, 'sine', 0.14);
  tone(990, 0.1, 0.28, 'sine', 0.14);
}

/** A low thud for a crash. */
export function crashThud() {
  tone(90, 0, 0.5, 'sawtooth', 0.2);
  tone(55, 0.08, 0.6, 'triangle', 0.22);
}

/** A short three-note fanfare for a landing. */
export function landingFanfare() {
  tone(523, 0, 0.2, 'triangle', 0.16);
  tone(659, 0.16, 0.2, 'triangle', 0.16);
  tone(784, 0.32, 0.45, 'triangle', 0.18);
}
