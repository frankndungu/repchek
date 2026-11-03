// Plain logic for the History tab: which sessions a plan can see, and how a
// row reads. No network and no DOM, so it is easy to test.

export interface HistoryItem {
  id: string;
  exerciseName: string;
  startedAt: string;
  totalReps: number;
  cleanReps: number;
}

// Free accounts see this many days. Older sessions are kept.
export const FREE_HISTORY_DAYS = 7;

const DAY_MS = 86_400_000;

// The moment the free window starts, counted back from now.
export function freeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - FREE_HISTORY_DAYS * DAY_MS);
}

export interface HistoryView {
  visible: HistoryItem[];
  // Saved sessions this plan cannot see yet.
  locked: number;
}

export function viewFor(
  plan: "free" | "premium",
  items: HistoryItem[],
  now: Date = new Date(),
): HistoryView {
  if (plan === "premium") return { visible: items, locked: 0 };
  const cutoff = freeCutoff(now).getTime();
  const visible = items.filter((i) => Date.parse(i.startedAt) >= cutoff);
  return { visible, locked: items.length - visible.length };
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
  if (days < FREE_HISTORY_DAYS) return WEEKDAYS[date.getDay()];
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`;
}

// "Push-up (side)" -> "Push-up".
function shortName(name: string): string {
  return name.split(" (")[0];
}

// "Push-up, 34 reps, 85% clean".
export function rowText(item: HistoryItem): string {
  const reps = `${item.totalReps} rep${item.totalReps === 1 ? "" : "s"}`;
  const pct = item.totalReps
    ? Math.round((item.cleanReps / item.totalReps) * 100)
    : 0;
  return `${shortName(item.exerciseName)}, ${reps}, ${pct}% clean`;
}
