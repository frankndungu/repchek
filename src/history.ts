// Plain logic for the History tab: grouping, "am I improving", and how a
// row reads. No network and no DOM, so it is easy to test.

export interface HistoryItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  startedAt: string;
  totalReps: number;
  cleanReps: number;
}

const DAY_MS = 86_400_000;
const DAYS_IN_WEEK = 7;

// "Push-up (side)" -> "Push-up".
export function shortName(name: string): string {
  return name.split(" (")[0];
}

export function cleanPct(item: { totalReps: number; cleanReps: number }): number {
  return item.totalReps
    ? Math.round((item.cleanReps / item.totalReps) * 100)
    : 0;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// "Today", then the weekday for the days before it ("Tue"), then the date
// for anything a week or more back ("12 Oct", with the year if it is not
// this one).
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days < DAYS_IN_WEEK) return WEEKDAYS[date.getDay()];
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`;
}

// Monday of the week the date is in, as a day count.
function weekStart(date: Date): number {
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
  return Math.round(
    Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / DAY_MS,
  );
}

export interface WeekGroup {
  // "This week", "Last week", or "27 Oct to 2 Nov".
  title: string;
  sessions: number;
  cleanReps: number;
  items: HistoryItem[];
}

function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// Newest first in, newest first out.
export function groupByWeek(
  items: HistoryItem[],
  now: Date = new Date(),
): WeekGroup[] {
  const thisWeek = weekStart(now);
  const groups = new Map<number, HistoryItem[]>();
  for (const item of items) {
    const key = weekStart(new Date(item.startedAt));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, list]) => {
      const weeksAgo = (thisWeek - key) / DAYS_IN_WEEK;
      const start = key * DAY_MS;
      const title =
        weeksAgo === 0
          ? "This week"
          : weeksAgo === 1
            ? "Last week"
            : `${formatDay(start)} to ${formatDay(start + 6 * DAY_MS)}`;
      return {
        title,
        sessions: list.length,
        cleanReps: list.reduce((sum, i) => sum + i.cleanReps, 0),
        items: list,
      };
    });
}

export interface ExerciseChip {
  id: string;
  name: string;
}

// The exercises in the list, most trained first.
export function exerciseChips(items: HistoryItem[]): ExerciseChip[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const item of items) {
    const entry = counts.get(item.exerciseId);
    if (entry) entry.n += 1;
    else counts.set(item.exerciseId, { name: shortName(item.exerciseName), n: 1 });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([id, { name }]) => ({ id, name }));
}

export type TrendDirection = "up" | "steady" | "down" | "none";

export interface Trend {
  direction: TrendDirection;
  // Clean rate this week and last week, and the change in points.
  thisWeek: number | null;
  lastWeek: number | null;
  points: number;
}

// A change of this many points or fewer is called steady.
const STEADY_POINTS = 1;

function weightedRate(items: HistoryItem[]): number | null {
  const total = items.reduce((sum, i) => sum + i.totalReps, 0);
  if (total === 0) return null;
  const clean = items.reduce((sum, i) => sum + i.cleanReps, 0);
  return Math.round((clean / total) * 100);
}

// This week's clean rate against last week's. "none" until both weeks have
// a session.
export function weekTrend(items: HistoryItem[], now: Date = new Date()): Trend {
  const thisWeekKey = weekStart(now);
  const inWeek = (item: HistoryItem, weeksAgo: number) =>
    weekStart(new Date(item.startedAt)) === thisWeekKey - weeksAgo * DAYS_IN_WEEK;
  const thisWeek = weightedRate(items.filter((i) => inWeek(i, 0)));
  const lastWeek = weightedRate(items.filter((i) => inWeek(i, 1)));
  if (thisWeek === null || lastWeek === null) {
    return { direction: "none", thisWeek, lastWeek, points: 0 };
  }
  const points = thisWeek - lastWeek;
  const direction =
    Math.abs(points) <= STEADY_POINTS ? "steady" : points > 0 ? "up" : "down";
  return { direction, thisWeek, lastWeek, points };
}

// Clean rate of the last few sessions, oldest first, for the small chart.
export function sparkline(items: HistoryItem[], count = 5): number[] {
  return [...items]
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .slice(-count)
    .map(cleanPct);
}

export interface Comparison {
  // Clean rate now and in the last session of the same exercise.
  now: number;
  before: number;
  points: number;
}

// The latest earlier session of the same exercise, or null if this is the
// first one.
export function compareToPrevious(
  items: HistoryItem[],
  current: {
    exerciseId: string;
    startedAt: string;
    totalReps: number;
    cleanReps: number;
  },
): Comparison | null {
  const at = Date.parse(current.startedAt);
  const previous = items
    .filter((i) => i.exerciseId === current.exerciseId && Date.parse(i.startedAt) < at)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (!previous) return null;
  const now = cleanPct(current);
  const before = cleanPct(previous);
  return { now, before, points: now - before };
}

// One plain line for the report.
export function comparisonText(
  comparison: Comparison | null,
  exerciseName: string,
): string {
  if (!comparison) {
    return `First ${shortName(exerciseName).toLowerCase()} session saved. Do it again to see how you are improving.`;
  }
  const { now, before, points } = comparison;
  if (Math.abs(points) <= STEADY_POINTS) {
    return `Clean rate steady at ${now}%, same as last time.`;
  }
  const direction = points > 0 ? "up" : "down";
  const amount = Math.abs(points);
  return `Clean rate ${direction} ${amount} point${amount === 1 ? "" : "s"} from last time, ${before}% to ${now}%.`;
}

// "34 reps" or "1 rep".
export function repsText(total: number): string {
  return `${total} rep${total === 1 ? "" : "s"}`;
}
