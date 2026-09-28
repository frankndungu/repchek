const BEEP_COOLDOWN_MS = 1200;
const BEEP_DURATION_S = 0.15;
const CHIME_PEAK_GAIN = 0.12;
const CHIME_FADE_IN_S = 0.01;
const CHIME_NOTE_S = 0.12;
const CHIME_SECOND_NOTE_AT_S = 0.14;
const WHISTLE_PEAK_GAIN = 0.06;
const WHISTLE_FREQUENCY = 2600;
const WHISTLE_VIBRATO_RATE = 30;
const WHISTLE_VIBRATO_DEPTH = 80;
const WHISTLE_BLAST_S = 0.18;
const WHISTLE_SECOND_BLAST_AT_S = 0.25;
const BELL_PEAK_GAIN = 0.1;
const BELL_DECAY_S = 1.8;
const BELL_SECOND_STRIKE_AT_S = 0.6;
// Frequency and gain relative to BELL_PEAK_GAIN. The upper partials are
// not whole multiples of each other, which is what makes it ring like metal.
const BELL_PARTIALS = [
  { frequency: 660, gain: 1.0 },
  { frequency: 1320, gain: 0.5 },
  { frequency: 1822, gain: 0.3 },
];

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

// Fault buzz: harsh on purpose, so it never sounds like a chime.
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

// Go whistle: two short referee blasts, counting has started.
export function whistleGo(): void {
  playWhistleBlast(0);
  playWhistleBlast(WHISTLE_SECOND_BLAST_AT_S);
}

// Set done chime: two falling notes, time to rest.
export function chimeSetDone(): void {
  playTone(990, 0, CHIME_NOTE_S);
  playTone(660, CHIME_SECOND_NOTE_AT_S, CHIME_NOTE_S);
}

// Finish bell: rung twice, the workout is over.
export function bellFinish(): void {
  playBellStrike(0);
  playBellStrike(BELL_SECOND_STRIKE_AT_S);
}

function playBellStrike(startOffsetS: number): void {
  for (const partial of BELL_PARTIALS) {
    playTone(
      partial.frequency,
      startOffsetS,
      BELL_DECAY_S,
      BELL_PEAK_GAIN * partial.gain,
    );
  }
}

// A high sine with a fast wobble on its pitch, like the pea rattling
// inside a whistle.
function playWhistleBlast(startOffsetS: number): void {
  if (!audioCtx) return;

  const start = audioCtx.currentTime + startOffsetS;
  const end = start + WHISTLE_BLAST_S;

  const osc = audioCtx.createOscillator();
  const vibrato = audioCtx.createOscillator();
  const vibratoDepth = audioCtx.createGain();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = WHISTLE_FREQUENCY;
  vibrato.type = "sine";
  vibrato.frequency.value = WHISTLE_VIBRATO_RATE;
  vibratoDepth.gain.value = WHISTLE_VIBRATO_DEPTH;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(
    WHISTLE_PEAK_GAIN,
    start + CHIME_FADE_IN_S,
  );
  gain.gain.exponentialRampToValueAtTime(0.001, end);

  vibrato.connect(vibratoDepth).connect(osc.frequency);
  osc.connect(gain).connect(audioCtx.destination);
  vibrato.start(start);
  osc.start(start);
  vibrato.stop(end);
  osc.stop(end);
}

// One soft sine note. Separate from beep(), so chimes never touch the
// fault cooldown.
function playTone(
  frequency: number,
  startOffsetS: number,
  durationS: number,
  peakGain: number = CHIME_PEAK_GAIN,
): void {
  if (!audioCtx) return;

  const start = audioCtx.currentTime + startOffsetS;
  const end = start + durationS;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + CHIME_FADE_IN_S);
  gain.gain.exponentialRampToValueAtTime(0.001, end);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(end);
}
