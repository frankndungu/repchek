const BEEP_COOLDOWN_MS = 1200;
const BEEP_DURATION_S = 0.15;
const CHIME_PEAK_GAIN = 0.12;
const CHIME_FADE_IN_S = 0.01;
const CHIME_NOTE_S = 0.12;
const CHIME_SECOND_NOTE_AT_S = 0.14;

let audioCtx: AudioContext | null = null;
let lastBeepAt = 0;

export function unlockAudio(): void {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
}

// Fault: harsh on purpose, so it never sounds like a chime.
export function beep(): void {
  if (!audioCtx) return;

  const now = performance.now();
  if (now - lastBeepAt < BEEP_COOLDOWN_MS) return;
  lastBeepAt = now;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + BEEP_DURATION_S,
  );

  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + BEEP_DURATION_S);
}

// Ready: two rising notes, counting has started.
export function chimeReady(): void {
  playTone(660, 0, CHIME_NOTE_S);
  playTone(990, CHIME_SECOND_NOTE_AT_S, CHIME_NOTE_S);
}

// Set done: two falling notes, time to rest.
export function chimeSetDone(): void {
  playTone(990, 0, CHIME_NOTE_S);
  playTone(660, CHIME_SECOND_NOTE_AT_S, CHIME_NOTE_S);
}

// One soft sine note. Separate from beep(), so chimes never touch the
// fault cooldown.
function playTone(
  frequency: number,
  startOffsetS: number,
  durationS: number,
): void {
  if (!audioCtx) return;

  const start = audioCtx.currentTime + startOffsetS;
  const end = start + durationS;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(CHIME_PEAK_GAIN, start + CHIME_FADE_IN_S);
  gain.gain.exponentialRampToValueAtTime(0.001, end);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(end);
}
