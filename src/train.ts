// What the Train screen shows, worked out from the saved sessions. No DOM
// and no network, so it is easy to test.

import type { HistoryItem } from "./history";

// Until onboarding asks where someone trains, this is the order shown when
// nothing has been trained yet: the home exercises first.
export const TRAIN_ORDER = [
  "push-up",
  "mountain-climbers",
  "biceps-curl",
  "deadlift",
  "barbell-row",
  "dumbbell-row",
  "tyson-push-up",
  "squat",
  "glute-bridge",
  "wall-sit",
  "crunch",
  "plank",
  "pull-up",
];

export interface WorkoutCard {
  exerciseId: string;
  // The latest saved session of this exercise, if there is one.
  last: HistoryItem | null;
}

// The workouts to offer: the ones trained most recently first, then the
// rest in the default order. Sessions are matched to exercises by the
// exercise they belong to, so the front and side push-up are one card.
export function workoutsFor(
  order: string[],
  items: (HistoryItem & { exerciseKey?: string })[],
  count = 3,
): WorkoutCard[] {
  const latest = new Map<string, HistoryItem>();
  for (const item of items) {
    const key = item.exerciseKey ?? item.exerciseId;
    const seen = latest.get(key);
    if (!seen || Date.parse(item.startedAt) > Date.parse(seen.startedAt)) {
      latest.set(key, item);
    }
  }
  const done = order
    .filter((id) => latest.has(id))
    .sort(
      (a, b) =>
        Date.parse(latest.get(b)!.startedAt) -
        Date.parse(latest.get(a)!.startedAt),
    );
  const fresh = order.filter((id) => !latest.has(id));
  return [...done, ...fresh].slice(0, count).map((exerciseId) => ({
    exerciseId,
    last: latest.get(exerciseId) ?? null,
  }));
}

// "Last: 3 x 12, 85% clean", with ", 20 kg" added for a weighted set, or
// "New. Try it today" when the exercise has not been done.
export function lastLine(last: HistoryItem | null): string {
  if (!last) return "New. Try it today";
  const pct = last.totalReps
    ? Math.round((last.cleanReps / last.totalReps) * 100)
    : 0;
  const plan =
    last.targetSets && last.targetReps
      ? `${last.targetSets} x ${last.targetReps}`
      : `${last.totalReps} reps`;
  const weight = last.weightKg ? `, ${last.weightKg} kg` : "";
  return `Last: ${plan}, ${pct}% clean${weight}`;
}

// The line under "Hi <name>".
export function greetingLine(daysDone: number, goal: number): string {
  if (daysDone >= goal) return "Goal hit this week. Extra days still count.";
  return `Ready for day ${daysDone + 1} of ${goal} this week?`;
}

// "4 week streak", or "Start your streak" before the first week counts.
export function streakTitle(weeks: number): string {
  return weeks > 0 ? `${weeks} week streak` : "Start your streak";
}

// "Last time: 3 x 12, 85% clean." for the setup screen.
export function lastTimeLine(last: HistoryItem): string {
  const pct = last.totalReps
    ? Math.round((last.cleanReps / last.totalReps) * 100)
    : 0;
  const plan =
    last.targetSets && last.targetReps
      ? `${last.targetSets} x ${last.targetReps}`
      : `${last.totalReps} reps`;
  return `Last time: ${plan}, ${pct}% clean.`;
}
