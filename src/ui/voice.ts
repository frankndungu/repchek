// Spoken coach cues ("Chest up", "Elbows in") using the browser's built-in
// speech, window.speechSynthesis. The phone's own voice speaks the words:
// nothing is downloaded and nothing leaves the phone.
//
// A fault usually lasts many frames, and main.ts calls say() on every one
// of them. So say() is picky about when it actually speaks:
//   - the same cue is not repeated within SAME_CUE_COOLDOWN_MS
//   - it never queues cues up: a cue said a second late is about a rep
//     that is already over
//   - a different cue may cut off the current one, but only once the
//     current one has had INTERRUPT_AFTER_MS to be heard

const RATE = 1.1;
const VOLUME = 1;
const SAME_CUE_COOLDOWN_MS = 3000;
const INTERRUPT_AFTER_MS = 800;

// When each cue was last spoken, to enforce the cooldown.
const lastSaidAt = new Map<string, number>();
// The cue being spoken right now, if any.
let current: { cue: string; startedAt: number } | null = null;

export function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// The cues are English. If the phone's default voice speaks another
// language, use an English voice instead, so "Chest up" is not read out in,
// say, a French accent that is hard to understand. Null means the default
// voice is fine (or there is no English voice to switch to).
function englishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const defaultVoice = voices.find((v) => v.default) ?? voices[0];
  if (!defaultVoice || defaultVoice.lang.toLowerCase().startsWith("en")) {
    return null;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
}

// Speak a cue, unless one of the rules above says not to.
export function say(cue: string): void {
  if (!isSupported() || !cue) return;
  const synth = window.speechSynthesis;
  const now = performance.now();

  const last = lastSaidAt.get(cue);
  if (last !== undefined && now - last < SAME_CUE_COOLDOWN_MS) return;

  if (synth.speaking && current) {
    if (current.cue === cue) return;
    if (now - current.startedAt < INTERRUPT_AFTER_MS) return;
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(cue);
  utterance.rate = RATE;
  utterance.volume = VOLUME;
  const voice = englishVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  const spoken = { cue, startedAt: now };
  utterance.onend = utterance.onerror = () => {
    if (current === spoken) current = null;
  };

  current = spoken;
  lastSaidAt.set(cue, now);
  synth.speak(utterance);
}

// Call once from inside the Start tap. iOS Safari only lets a page speak
// after speech has been started once during a user tap. Cues later come
// from the camera loop, not from a tap, so without this they would be
// silently ignored on iPhones. An empty, silent sentence is enough.
export function warmUp(): void {
  if (!isSupported()) return;
  const utterance = new SpeechSynthesisUtterance("");
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}
