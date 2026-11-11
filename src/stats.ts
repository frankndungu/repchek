// The numbers on the live Stats panel.

// "0:42" for 42 000 ms.
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Reps a minute, from the reps so far and the time they took. Shown as "-"
// until there is enough to say anything: two reps and a few seconds.
const MIN_PACE_MS = 8000;

// A hold such as the plank has no pace: its "reps" are seconds, so a rate
// would just read about 60 a minute. It stays "-".
export function paceText(reps: number, elapsedMs: number, hold = false): string {
  if (hold || reps < 2 || elapsedMs < MIN_PACE_MS) return "-";
  return `${Math.round(reps / (elapsedMs / 60000))}/m`;
}
